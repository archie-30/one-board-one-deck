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
import { ref, shallowRef, watch } from 'vue'
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
  /** 真人的名字（他離開房間、由電腦代打時註明是誰的位子） */
  name?: string
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
/** 目前這一局打完了（伺服器攤牌了） */
export const liveOver = ref(false)
/** 對局還沒打完就要離開：App 層跳確認視窗（有值＝視窗打開，按「離開房間」就呼叫它） */
export const leaveMid = shallowRef<(() => void) | null>(null)

/** 對局中離開又用房號加回來：等伺服器送來這一局，就直接進對局（catchUp：補播到第幾步為止要快轉） */
export const rejoinMatch = shallowRef<{ n: number; gameId: string; catchUp: number } | null>(null)
let rejoining = false
/** 正在用房號加回原本的對局（onlineWs 加入時設定） */
export const expectRejoin = (on: boolean) => (rejoining = on)

/**
 * 伺服器開局後先等大家的發牌動畫播完才收動作（server/src/match/run.ts 的 START_DELAY 4.5 秒；棋類猜拳分出來後 RPS_SHOW 1.8 秒）。
 * 自己這邊的動畫可能比較快播完：這時按出牌，伺服器會不收（牌選了卻出不出去）。
 * 所以太早送的動作先留著，到伺服器準備好了才送出去（畫面上看起來只是「等一下下」）。
 */
const START_DELAY_MS = 4500
const RPS_SHOW_MS = 1800
/** 這個時間之前送的動作先留著 */
let readyLocal = 0
let pendingTimer = 0

/** 伺服器送來開局資訊（開局時；斷線連回來也會重送，附上到目前為止的每一步） */
export function receiveMatch(intro: MatchIntro & { log?: MatchEvent[] }) {
  const cur = liveMatch.value
  // 加回來的：不管之前留著什麼，都當成新拿到這一局（從頭補播）
  if (cur && cur.n === intro.n && !rejoining) {
    // 連回來：補上沒收到的
    for (const e of intro.log ?? []) receiveAct(intro.n, e)
    return
  }
  const { log, ...rest } = intro
  // 剛開局（還沒有任何一步）：伺服器還在等發牌動畫；連回來、加回來的局早就準備好了
  readyLocal = log?.length ? 0 : Date.now() + START_DELAY_MS - 300
  window.clearTimeout(pendingTimer)
  liveOver.value = false
  liveMatch.value = { ...rest, queue: [], lastSeq: 0, onEvent: null, onReject: null }
  for (const e of log ?? []) receiveAct(intro.n, e)
  // 加回來的：直接進這一局，離開期間的每一步快轉補播
  if (rejoining && intro.seat >= 0) {
    rejoining = false
    rejoinMatch.value = { n: intro.n, gameId: intro.gameId, catchUp: log?.length ? log[log.length - 1].seq : 0 }
  }
}

/** 伺服器送來一個動作（照編號；收過的不再收） */
export function receiveAct(n: number, e: MatchEvent) {
  const m = liveMatch.value
  if (!m || m.n !== n || e.seq <= m.lastSeq) return
  m.lastSeq = e.seq
  if (e.end) liveOver.value = true
  // 猜拳分出結果：伺服器再等一下（讓大家看結果）才收棋步
  if ((e.ev as { type?: string } | null)?.type === 'rps') readyLocal = Date.now() + RPS_SHOW_MS - 300
  m.queue.push(e)
  m.onEvent?.()
}

/**
 * 對局還在打、自己卻在房間頁（例如對局中重新整理網頁，連回來後停在房間）：可以「回到對戰」。
 * 撲克牌的觀戰還不支援（跟開局時一樣留在房間）。
 */
export function canReturnToMatch(): boolean {
  const m = liveMatch.value
  if (!m || liveOver.value || !online.room || online.room.phase !== 'playing' || online.room.gameId !== m.gameId) return false
  return m.seat >= 0 || getGame(m.gameId).category !== 'cards'
}
/** 回到正在打的這一局：跟中途加回來一樣，用房間那張模式卡片翻面進場，離開期間的每一步快轉補播 */
export function returnToMatch() {
  const m = liveMatch.value
  if (!m || !canReturnToMatch()) return
  rejoinMatch.value = { n: m.n, gameId: m.gameId, catchUp: m.lastSeq }
}

/** 伺服器說：剛剛送的動作不收 */
export function rejectAct() {
  liveMatch.value?.onReject?.()
}

/** 遊戲畫面開局時拿：這個玩法現在有連線對局才會拿到（觀戰的人也拿得到，seat 是 -1） */
export function joinLiveMatch(gameId: string): LiveMatch | null {
  const m = liveMatch.value
  return online.room && m && m.gameId === gameId ? m : null
}
/** 在觀戰（沒有座位，只能看） */
export const isWatching = (m: MatchIntro) => m.seat < 0
/** 畫面的視角：自己的座位；觀戰就從 0 號座位那位玩家的角度看 */
const viewSeat = (m: MatchIntro) => Math.max(0, m.seat)

/** 送出自己的動作（伺服器確認後，會跟別人的動作一樣送回來，那時才真的套用） */
export function sendAct(a: unknown) {
  window.clearTimeout(pendingTimer)
  const wait = readyLocal - Date.now()
  // 出拳不用等；其他動作在伺服器準備好之前先留著，時間到再送
  if (wait > 0 && (a as { type?: string } | null)?.type !== 'rps') pendingTimer = window.setTimeout(() => sendIntent({ t: 'act', a }), wait)
  else sendIntent({ t: 'act', a })
}

/** 座位換算：伺服器座位 → 自己的視角（自己是 0） */
export const toLocal = (m: MatchIntro, abs: number) => (abs - viewSeat(m) + m.seats.length) % m.seats.length
/** 自己的視角 → 伺服器座位 */
export const toAbs = (m: MatchIntro, local: number) => (local + viewSeat(m)) % m.seats.length
/** 把一個依座位排的陣列轉成自己的視角 */
export const rotate = <T>(m: MatchIntro, arr: readonly T[]): T[] => arr.map((_, i) => arr[toAbs(m, i)])

/** 畫面上的對手（依自己的視角，不含自己）：真人用他的名字、頭像；電腦用房主取的名字 */
export const matchOpponents = (m: MatchIntro): Opponent[] => matchPlayers(m).slice(1)
/** 每個座位上的人（依自己的視角，0 號是自己；觀戰時 0 號是畫面下方那位） */
export function matchPlayers(m: MatchIntro): Opponent[] {
  return rotate(m, m.seats).map((seat) => {
    const bot = opponentById(seat.bot)
    if (!seat.pid) return bot
    const p = online.room?.players.find((x) => x.id === seat.pid)
    // 他離開房間了：位子由電腦代打，名字註明
    if (!p && online.room) return { ...bot, name: S.online.botFor(seat.name ?? bot.name), tag: S.online.botTag }
    const look: Look = p?.look ?? OPPONENTS[seat.bot].look
    // 名字下面放他裝備的稱號（最多兩個）；沒裝稱號才寫「真人玩家」
    const titles = (p?.titles ?? []).map((id) => S.profile.titles[id]?.name).filter(Boolean)
    return { ...bot, name: p?.name ?? S.online.someone, look, tag: titles.length ? titles.join(S.online.titleSep) : S.online.humanTag, human: true, persona: PERSONAS[seat.bot] }
  })
}
/** 有人離開房間（改由電腦代打）時，把畫面上的名字換掉：fn 收到每個座位（自己的視角）現在的樣子 */
export function watchSeats(m: MatchIntro, fn: (players: Opponent[]) => void) {
  watch(
    () => online.room?.players.map((p) => p.id).join(',') ?? '',
    () => fn(matchPlayers(m)),
  )
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
