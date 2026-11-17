// 對局流程（純邏輯，方便測試）：開局、玩家出牌、電腦出牌、時間到、結束。
// 伺服器存著完整的牌局；送給每個人的只有他該看到的（見 defs.ts）。
// 每個動作都記一筆（log，有編號 seq），斷線連回來的人照編號補上沒收到的。
import { seedRng, nextRandom, shuffle, type RngState } from '../../../src/engine/common/rng'
import { BEGINNER_BOT, BOT_TOTAL } from '../games'
import type { RoomState } from '../roomCore'
import { MATCH_DEFS, type Options } from './defs'

/** 每個座位：真人（pid）或電腦；每個座位都配一位電腦打法（真人離開、斷線時由它代打） */
export interface Seat {
  pid?: string
  bot: number
}

export interface LogEntry {
  seq: number
  pub: unknown
  /** 做動作的座位看到的版本（例如排七蓋了哪張） */
  own?: unknown
  seat: number
  /** 這一筆是結束（攤牌） */
  end?: boolean
}

export interface MatchState {
  /** 第幾局（房間裡一直往上加） */
  n: number
  gameId: string
  opts: Options
  seats: Seat[]
  /** 現在的牌局（完整，只在伺服器） */
  s: unknown
  /** 開局發牌的樣子（給每個人算開局資訊；斷線連回來重送也用它） */
  s0: unknown
  rng: RngState
  log: LogEntry[]
  /** 下一次要處理的時間（電腦出牌、時間到）；0 = 等玩家 */
  nextAt: number
  /** 開局動畫（發牌）還沒播完前，誰都不動 */
  readyAt: number
  over: boolean
  /** 每個座位連續逾時幾次（連續 IDLE_TIMEOUTS 次就由電腦代打，直到他自己出手） */
  idle: number[]
}

/** 真人連續逾時幾次後，改由電腦代打（不然撿紅點這種逾時只跳過的玩法可能永遠打不完） */
export const IDLE_TIMEOUTS = 2

/** 發牌、開場動畫的時間：這之前電腦不出牌、倒數也還沒開始 */
export const START_DELAY = 4500
/** 倒數計時給一點寬限（網路延遲、動畫） */
export const SLACK_MS = 2500
/** 真人離開或斷線：電腦代打，想一下就好 */
export const AWAY_THINK = 1200
/** 伺服器的鬧鐘可能早幾毫秒響：差這麼一點就當作到了 */
export const EARLY_MS = 50

export const canMatch = (gameId: string) => gameId in MATCH_DEFS

/** 這位玩家現在在不在對局裡（斷線、離開對局就由電腦代打） */
function present(room: RoomState, pid: string | undefined): boolean {
  if (!pid) return false
  const p = room.players.find((x) => x.id === pid)
  return !!p && !p.away && p.inGame
}

/** 開局：對戰的人依進房順序入座，空位由電腦補上 */
export function startMatch(room: RoomState, seed: number, now: number): MatchState {
  const def = MATCH_DEFS[room.gameId]
  const opts = room.rules?.gameId === room.gameId ? room.rules.options : {}
  let rng = seedRng(seed ^ 0x5bd1e995)
  // 電腦挑不重複的打法；難度「高」不挑新手打法的那位
  const high = opts.difficulty === 'high'
  let pool: number[]
  ;[pool, rng] = shuffle(
    Array.from({ length: BOT_TOTAL }, (_, i) => i).filter((i) => !(high && i === BEGINNER_BOT)),
    rng,
  )
  const humans = room.players.filter((p) => !p.spectator).map((p) => p.id)
  const seats: Seat[] = Array.from({ length: def.seats }, (_, i) => ({ ...(humans[i] ? { pid: humans[i] } : {}), bot: pool[i] }))
  const dealt = def.deal(seed, opts)
  room.matchN = (room.matchN ?? 0) + 1
  const m: MatchState = { n: room.matchN, gameId: room.gameId, opts, seats, s: dealt, s0: dealt, rng, log: [], nextAt: 0, readyAt: now + START_DELAY, over: false, idle: seats.map(() => 0) }
  room.match = m
  // 一開局就分出勝負（大老二的一條龍）：直接攤牌
  if (def.turn(m.s) < 0) end(m)
  else schedule(room, now)
  return m
}

function end(m: MatchState) {
  m.over = true
  m.nextAt = 0
  m.log.push({ seq: m.log.length + 1, pub: MATCH_DEFS[m.gameId].reveal(m.s), seat: -1, end: true })
}

/** 輪到誰：電腦（或沒在對局裡的真人）→ 排定想多久後出；真人 → 排定時間到 */
export function schedule(room: RoomState, now: number) {
  const m = room.match
  if (!m || m.over) return
  const def = MATCH_DEFS[m.gameId]
  const t = def.turn(m.s)
  if (t < 0) return end(m)
  const seat = m.seats[t]
  const base = Math.max(now, m.readyAt)
  if (!present(room, seat.pid) || m.idle[t] >= IDLE_TIMEOUTS) {
    let r: number
    ;[r, m.rng] = nextRandom(m.rng)
    m.nextAt = base + (seat.pid ? AWAY_THINK : def.think(m.s, seat.bot, m.opts, r))
  } else m.nextAt = m.opts.timer === false ? 0 : base + def.seconds * 1000 + SLACK_MS
}

function commit(room: RoomState, seat: number, a: unknown, now: number): LogEntry[] {
  const m = room.match!
  const def = MATCH_DEFS[m.gameId]
  const before = m.s
  const after = def.apply(before, a)
  if (!after) return []
  m.s = after
  const r = def.render(before, after, a)
  const start = m.log.length
  m.log.push({ seq: m.log.length + 1, pub: r.pub, ...(r.own !== undefined ? { own: r.own } : {}), seat })
  if (def.turn(after) < 0) end(m)
  else schedule(room, now)
  return m.log.slice(start)
}

/** 真人出牌：只有輪到他時才收；格式、規則不對就不收 */
export function playerAct(room: RoomState, pid: string, raw: unknown, now: number): LogEntry[] {
  const m = room.match
  if (!m || m.over || now < m.readyAt - 500) return []
  const def = MATCH_DEFS[m.gameId]
  const seat = m.seats.findIndex((s) => s.pid === pid)
  if (seat < 0 || def.turn(m.s) !== seat) return []
  const a = def.parse(raw, seat)
  if (!a) return []
  m.idle[seat] = 0
  return commit(room, seat, a, now)
}

/** 時間到：電腦出牌，或真人逾時跳過 */
export function matchTick(room: RoomState, now: number): LogEntry[] {
  const m = room.match
  // 早幾毫秒醒來也算到了
  if (!m || m.over || !m.nextAt || now < m.nextAt - EARLY_MS) return []
  const def = MATCH_DEFS[m.gameId]
  const t = def.turn(m.s)
  const seat = m.seats[t]
  if (present(room, seat.pid) && m.idle[t] < IDLE_TIMEOUTS) {
    m.idle[t]++
    return commit(room, t, def.timeout(t), now)
  }
  let a: unknown
  ;[a, m.rng] = def.bot(m.s, seat.bot, m.opts, m.rng)
  const out = commit(room, t, a, now)
  // 電腦的動作被規則擋下（不該發生）：改用逾時，避免卡住
  return out.length ? out : commit(room, t, def.timeout(t), now)
}

/** 某位玩家給他看的一筆紀錄 */
export const entryFor = (e: LogEntry, seat: number) => (e.own !== undefined && e.seat === seat ? e.own : e.pub)

/** 開局資訊（每個人自己的視角） */
export function matchIntro(m: MatchState, pid: string) {
  const seat = m.seats.findIndex((s) => s.pid === pid)
  return {
    n: m.n,
    gameId: m.gameId,
    seat,
    seats: m.seats.map((s) => (s.pid ? { pid: s.pid, bot: s.bot } : { bot: s.bot })),
    opts: m.opts,
    start: MATCH_DEFS[m.gameId].start(m.s0, seat),
  }
}
