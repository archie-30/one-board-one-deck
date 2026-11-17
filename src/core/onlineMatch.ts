// 連線對局（客戶端這一邊）：伺服器當裁判，這裡負責收發。
//   開局：伺服器送來「自己的視角」（自己的手牌、別人剩幾張、輪到誰…），和每個座位是誰（真人或電腦）。
//   之後：每個動作（不管是誰出的，包括自己）都由伺服器送來，照順序一個個套用；自己出牌也是先送給伺服器，等它確認才算。
//   結束：伺服器攤牌（整局完整的樣子），拿來算分、翻開別人剩的牌。
//
// 座位：伺服器的座位是 0、1、2、3（大家都一樣）；畫面上「自己」一律在 0 號（下方），
// 所以收到的座位要轉成自己的視角（local），送出去前再轉回來（abs）。
//
// 別人的手牌：只知道張數。畫面上先隨便放幾張「沒看過的牌」當背面，等他真的打出某張牌時，
// 把那張牌跟他手上的某張背面換位（CardStage.adopt），看起來就像從他手上打出來。
import { shallowRef } from 'vue'
import { OPPONENTS } from '@/data/names'
import { S } from '@/data/strings'
import { PERSONAS } from '@/engine/common/personas'
import { getGame } from '@/games/registry'
import { resolveOptions } from '@/games/options'
import type { Look } from '@/ui/art/look'
import { online, sendIntent } from './online'
import { opponentById, type Opponent } from './opponents'

export interface MatchSeat {
  /** 真人（房間成員編號）；沒有就是電腦 */
  pid?: string
  /** 這個座位的電腦打法（真人離開時由它代打；名字、長相也用它） */
  bot: number
}

export interface MatchIntro {
  n: number
  gameId: string
  /** 自己的座位（伺服器的編號；-1＝觀戰） */
  seat: number
  seats: MatchSeat[]
  /** 房主的規則設定 */
  opts: Record<string, string | boolean>
  /** 開局時自己看得到的牌局 */
  start: unknown
}

export interface MatchEvent {
  seq: number
  ev: unknown
  end?: boolean
}

export interface LiveMatch extends MatchIntro {
  /** 還沒套用的動作 */
  queue: MatchEvent[]
  lastSeq: number
  /** 有新動作進來時叫一下（遊戲畫面在等的話就接著處理） */
  onEvent: (() => void) | null
  /** 伺服器沒收自己送的動作（不合規則、不是輪到自己）：遊戲畫面解除「等確認」 */
  onReject: (() => void) | null
}

/** 目前的連線對局（沒有就是 null） */
export const liveMatch = shallowRef<LiveMatch | null>(null)

/** 伺服器送來開局資訊（開局時；斷線連回來也會重送，附上到目前為止的每一步） */
export function receiveMatch(intro: MatchIntro & { log?: MatchEvent[] }) {
  const cur = liveMatch.value
  if (cur && cur.n === intro.n) {
    // 連回來：補上沒收到的
    for (const e of intro.log ?? []) receiveAct(intro.n, e)
    return
  }
  const { log, ...rest } = intro
  liveMatch.value = { ...rest, queue: [], lastSeq: 0, onEvent: null, onReject: null }
  for (const e of log ?? []) receiveAct(intro.n, e)
}

/** 伺服器送來一個動作（照編號；收過的不再收） */
export function receiveAct(n: number, e: MatchEvent) {
  const m = liveMatch.value
  if (!m || m.n !== n || e.seq <= m.lastSeq) return
  m.lastSeq = e.seq
  m.queue.push(e)
  m.onEvent?.()
}

/** 伺服器說：剛剛送的動作不收 */
export function rejectAct() {
  liveMatch.value?.onReject?.()
}

/** 遊戲畫面開局時拿：這個玩法現在有連線對局、而且自己有座位，才會拿到 */
export function joinLiveMatch(gameId: string): LiveMatch | null {
  const m = liveMatch.value
  return online.room && m && m.gameId === gameId && m.seat >= 0 ? m : null
}

/** 送出自己的動作（伺服器確認後，會跟別人的動作一樣送回來，那時才真的套用） */
export function sendAct(a: unknown) {
  sendIntent({ t: 'act', a })
}

/** 座位換算：伺服器座位 → 自己的視角（自己是 0） */
export const toLocal = (m: MatchIntro, abs: number) => (abs - m.seat + m.seats.length) % m.seats.length
/** 自己的視角 → 伺服器座位 */
export const toAbs = (m: MatchIntro, local: number) => (local + m.seat) % m.seats.length
/** 把一個依座位排的陣列轉成自己的視角 */
export const rotate = <T>(m: MatchIntro, arr: readonly T[]): T[] => arr.map((_, i) => arr[toAbs(m, i)])

/** 畫面上的對手（依自己的視角，不含自己）：真人用他的名字、頭像；電腦用房主取的名字 */
export function matchOpponents(m: MatchIntro): Opponent[] {
  return rotate(m, m.seats)
    .slice(1)
    .map((seat) => {
      const bot = opponentById(seat.bot)
      if (!seat.pid) return bot
      const p = online.room?.players.find((x) => x.id === seat.pid)
      const look: Look = p?.look ?? OPPONENTS[seat.bot].look
      return { ...bot, name: p?.name ?? S.online.someone, look, tag: S.online.humanTag, persona: PERSONAS[seat.bot] }
    })
}

/** 在別人的「背面手牌」裡放進一張真的牌：如果那張牌不在他手上，就跟他手上某張背面換位（keep 裡的牌不換） */
export function bringInto(zones: number[][], into: number, card: number, keep: readonly number[] = []): [number, number] | null {
  if (zones[into].includes(card)) return null
  const from = zones.findIndex((z) => z.includes(card))
  const swap = zones[into].find((c) => !keep.includes(c))
  if (from < 0 || swap === undefined) return null
  zones[from][zones[from].indexOf(card)] = swap
  zones[into][zones[into].indexOf(swap)] = card
  return [card, swap]
}

/** 房主把自己的規則設定送給伺服器（開局照這份）。只送會影響公平的設定（不是 live 的） */
export function sendRules(gameId: string) {
  if (!gameId) return
  const game = getGame(gameId)
  const all = resolveOptions(game)
  const options: Record<string, string | boolean> = {}
  for (const d of game.settings) if (!d.live) options[d.key] = all[d.key]
  sendIntent({ t: 'rules', gameId, options })
}
