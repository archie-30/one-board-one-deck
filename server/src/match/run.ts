// 對局流程（純邏輯，方便測試）：開局、（棋類）猜拳、玩家出牌、電腦出牌、時間到、悔棋、認輸、結束。
// 伺服器存著完整的牌局；送給每個人的只有他該看到的（見 defs.ts）。
// 每個動作都記一筆（log，有編號 seq），斷線連回來的人照編號補上沒收到的。
//
// 座位（seat）與引擎的座位（side）：撲克牌一樣；棋類猜拳贏的人先走，引擎的 0 號（先走）＝猜拳贏的座位（first）。
// side = (seat - first) mod 人數。送出去的動作裡的 player 是 side（客戶端知道 first，自己換算）。
import { randomRps, resolveRps, RPS_HANDS, type RpsHand } from '../../../src/engine/common/rps'
import { seedRng, nextInt, nextRandom, shuffle, type RngState } from '../../../src/engine/common/rng'
import { TURN_SECONDS } from '../../../src/data/timer'
import { BEGINNER_BOT, BOT_TOTAL } from '../games'
import type { RoomState } from '../roomCore'
import { MATCH_DEFS, type Options } from './defs'

/** 每個座位：真人（pid）或電腦；每個座位都配一位電腦打法（真人離開、斷線時由它代打） */
export interface Seat {
  pid?: string
  bot: number
  /** 真人的名字（他中途離開、由電腦代打時，畫面上註明是誰的位子） */
  name?: string
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
  /** 下一次要處理的時間（電腦出牌、時間到、猜拳時間到）；0 = 等玩家 */
  nextAt: number
  /** 開局動畫還沒播完前，誰都不動 */
  readyAt: number
  over: boolean
  /** 每個座位連續逾時幾次（連續 IDLE_TIMEOUTS 次就由電腦代打，直到他自己出手） */
  idle: number[]
  /** 先走的座位（引擎的 0 號）；棋類猜拳前是 -1 */
  first: number
  /** 猜拳中：每個座位出了什麼（還沒出是 null） */
  rps: { picks: (RpsHand | null)[]; deadline: number } | null
  /** 開局後套用過的動作（悔棋時從開局重算一次） */
  acts: { side: number; a: unknown }[]
  /** 悔棋：等誰同意（申請的那一方 side）；null = 沒有 */
  undoAsk: number | null
  /** 悔棋申請的回答期限（過了就當作不同意）；0 = 沒有申請 */
  undoUntil: number
  /** 每個座位用過悔棋沒（每局一次） */
  undoUsed: boolean[]
  /** 已經同意悔棋的座位（三人局要另外兩個在場的真人都同意） */
  undoOk?: number[]
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
/** 猜拳：進場動畫＋出拳的時間（照單人的 5 秒，再給一點寬限） */
export const RPS_FIRST = 2500 + TURN_SECONDS.rps * 1000 + SLACK_MS
/** 猜拳平手：結果停一下再出下一輪 */
export const RPS_AGAIN = 1100 + TURN_SECONDS.rps * 1000 + SLACK_MS
/** 對方要在幾秒內回答悔棋（畫面上倒數 10 秒，伺服器多給一點網路延遲） */
export const UNDO_ANSWER_MS = 10_000 + 1500
/** 猜拳分出勝負後，結果停一下（約 1.3 秒）才開始 */
export const RPS_SHOW = 1800

export const canMatch = (gameId: string) => gameId in MATCH_DEFS

/** 這位玩家現在在不在對局裡（斷線、離開對局就由電腦代打） */
function present(room: RoomState, pid: string | undefined): boolean {
  if (!pid) return false
  const p = room.players.find((x) => x.id === pid)
  return !!p && !p.away && p.inGame
}
const sideOf = (m: MatchState, seat: number) => (seat - m.first + m.seats.length) % m.seats.length
const seatOf = (m: MatchState, side: number) => (side + m.first) % m.seats.length
const push = (m: MatchState, pub: unknown, seat = -1) => m.log.push({ seq: m.log.length + 1, pub, seat })

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
  const humans = room.players.filter((p) => !p.spectator)
  const seats: Seat[] = Array.from({ length: def.seats }, (_, i) => ({ ...(humans[i] ? { pid: humans[i].id, name: humans[i].name } : {}), bot: pool[i] }))
  const dealt = def.deal(seed, opts)
  room.matchN = (room.matchN ?? 0) + 1
  const m: MatchState = {
    n: room.matchN,
    gameId: room.gameId,
    opts,
    seats,
    s: dealt,
    s0: dealt,
    rng,
    log: [],
    nextAt: 0,
    readyAt: now + START_DELAY,
    over: false,
    idle: seats.map(() => 0),
    first: def.rps ? -1 : 0,
    rps: null,
    acts: [],
    undoAsk: null,
    undoUntil: 0,
    undoUsed: seats.map(() => false),
  }
  room.match = m
  // 新的一局：上一局中途離開的人不能再加回來了
  room.leftMid = undefined
  if (def.rps) startRps(room, now + RPS_FIRST)
  // 一開局就分出勝負（大老二的一條龍）：直接攤牌
  else if (def.turn(m.s) < 0) end(m)
  else schedule(room, now)
  return m
}

// ── 猜拳（棋類）──

/** 新的一輪：電腦（和不在的真人）直接隨便出，真人等他出 */
function startRps(room: RoomState, deadline: number) {
  const m = room.match!
  m.rps = { picks: m.seats.map(() => null), deadline }
  m.nextAt = deadline
  for (let i = 0; i < m.seats.length; i++) {
    if (present(room, m.seats[i].pid)) continue
    let h: RpsHand
    ;[h, m.rng] = randomRps(m.rng)
    m.rps.picks[i] = h
  }
}

/** 大家都出了（或時間到）：比一比。平手再來一輪；分出勝負就決定誰先走 */
function settleRps(room: RoomState, now: number, timeUp: boolean) {
  const m = room.match!
  const picks = m.rps!.picks
  if (!timeUp && picks.some((h) => !h)) return
  const missed = picks.map((h) => !h)
  let winner: number
  if (missed[0] && missed[1]) {
    // 兩個人都沒出：隨便一個先走
    ;[winner, m.rng] = nextInt(m.rng, 2)
  } else if (missed[0] || missed[1]) winner = missed[0] ? 1 : 0
  else {
    const r = resolveRps(picks[0]!, picks[1]!)
    if (r === 0) {
      push(m, { type: 'rps', hands: picks, winner: -1 })
      startRps(room, now + RPS_AGAIN)
      return
    }
    winner = r === 1 ? 0 : 1
  }
  push(m, { type: 'rps', hands: picks, winner, missed })
  m.rps = null
  m.first = winner
  m.readyAt = now + RPS_SHOW
  schedule(room, now)
}

// ── 對局 ──

function end(m: MatchState) {
  m.over = true
  m.nextAt = 0
  m.undoAsk = null
  m.undoUntil = 0
  let rng: RngState
  ;[, rng] = nextRandom(m.rng)
  m.log.push({ seq: m.log.length + 1, pub: MATCH_DEFS[m.gameId].reveal(m.s, m.s0, rng), seat: -1, end: true })
}

/** 輪到誰：電腦（或沒在對局裡的真人）→ 排定想多久後出；真人 → 排定時間到 */
export function schedule(room: RoomState, now: number) {
  const m = room.match
  if (!m || m.over || m.rps) return
  const def = MATCH_DEFS[m.gameId]
  const side = def.turn(m.s)
  if (side < 0) return end(m)
  const t = seatOf(m, side)
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
  m.acts.push({ side: sideOf(m, seat), a })
  const r = def.render(before, after, a)
  const start = m.log.length
  // 有人在等對方同意悔棋時又有人走了：悔棋取消
  if (m.undoAsk !== null) {
    push(m, { type: 'undoNo', by: m.undoAsk })
    m.undoAsk = null
    m.undoUntil = 0
  }
  m.log.push({ seq: m.log.length + 1, pub: r.pub, ...(r.own !== undefined ? { own: r.own } : {}), seat: r.ownSide !== undefined ? seatOf(m, r.ownSide) : seat })
  if (def.turn(after) < 0) end(m)
  else schedule(room, now)
  return m.log.slice(start)
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** 真人送來的動作：猜拳、出牌／落子、認輸、悔棋（申請／回覆）。只有合規則的才收 */
export function playerAct(room: RoomState, pid: string, raw: unknown, now: number): LogEntry[] {
  const m = room.match
  if (!m || m.over) return []
  const def = MATCH_DEFS[m.gameId]
  const seat = m.seats.findIndex((s) => s.pid === pid)
  if (seat < 0 || !isObj(raw)) return []
  const start = m.log.length
  // 猜拳中只收出拳
  if (m.rps) {
    if (raw.type !== 'rps' || !RPS_HANDS.includes(raw.hand as RpsHand) || m.rps.picks[seat]) return []
    m.rps.picks[seat] = raw.hand as RpsHand
    settleRps(room, now, false)
    // 還在等對方出：告訴大家「他出好了」（不說出什麼）
    if (m.log.length === start) push(m, { type: 'rpsPicked', seat }, seat)
    return m.log.slice(start)
  }
  if (now < m.readyAt - 500) return []
  const side = sideOf(m, seat)
  if (raw.type === 'resign') {
    const after = def.resign?.(m.s, side)
    if (!after) return []
    m.s = after
    push(m, { type: 'resign', player: side }, seat)
    // 兩人的棋認輸就結束；三人的（星形跳棋）剩下的人繼續下
    if (def.turn(after) < 0) end(m)
    else schedule(room, now)
    return m.log.slice(start)
  }
  if (raw.type === 'tie') {
    const after = def.tie?.(m.s, side, (sd) => {
      const st = m.seats[seatOf(m, sd)]
      return !!st?.pid && present(room, st.pid)
    })
    if (!after) return []
    m.s = after
    push(m, { type: 'tie', player: side }, seat)
    end(m)
    return m.log.slice(start)
  }
  if (raw.type === 'undo') return askUndo(room, seat, now)
  if (raw.type === 'undoReply') {
    // 只有被問的人能回答（申請的人自己不行、答過的不能再答）
    if (m.undoAsk === null || m.undoAsk === side || m.undoOk?.includes(seat)) return []
    if (raw.ok === true) {
      m.undoOk = [...(m.undoOk ?? []), seat]
      const asker = seatOf(m, m.undoAsk)
      // 在場的真人都同意了才悔（電腦、不在的人不用問）
      if (askees(room, asker).every((i) => m.undoOk!.includes(i))) return doUndo(room, asker, now)
      push(m, { type: 'undoOk', seat }, seat)
      return m.log.slice(start)
    }
    push(m, { type: 'undoNo', by: m.undoAsk })
    m.undoAsk = null
    m.undoUntil = 0
    return m.log.slice(start)
  }
  if (def.turn(m.s) !== side) return []
  const a = def.parse(raw, side)
  if (!a) return []
  m.idle[seat] = 0
  return commit(room, seat, a, now)
}

// ── 悔棋（要對方同意；對手是電腦或不在就直接同意）──

/** 這一方最後一手在 acts 裡的位置（沒走過是 -1）；undoRun 的玩法退到那一串連續動作的第一步 */
function lastMoveOf(m: MatchState, side: number): number {
  let k = m.acts.map((x) => x.side).lastIndexOf(side)
  if (k >= 0 && MATCH_DEFS[m.gameId].undoRun) while (k > 0 && m.acts[k - 1].side === side) k--
  return k
}

/** 悔棋要問誰：申請的人以外、在場的真人 */
function askees(room: RoomState, seat: number): number[] {
  const m = room.match!
  return m.seats.map((s, i) => (i !== seat && s.pid && present(room, s.pid) ? i : -1)).filter((i) => i >= 0)
}

function askUndo(room: RoomState, seat: number, now: number): LogEntry[] {
  const m = room.match!
  const def = MATCH_DEFS[m.gameId]
  const side = sideOf(m, seat)
  // 連線不限悔棋次數：每次都要其他人同意（對電腦、對方不在就直接同意）
  if (!def.undo || m.undoAsk !== null || lastMoveOf(m, side) < 0) return []
  // 對手是電腦、或不在：直接同意
  if (!askees(room, seat).length) return doUndo(room, seat, now)
  const start = m.log.length
  m.undoOk = []
  m.undoAsk = side
  m.undoUntil = now + UNDO_ANSWER_MS
  push(m, { type: 'undoAsk', by: side }, seat)
  return m.log.slice(start)
}

/** 同意悔棋：退回到這一方最後一手之前（中間對方的回應也一起退），從開局重算一次 */
function doUndo(room: RoomState, seat: number, now: number): LogEntry[] {
  const m = room.match!
  const def = MATCH_DEFS[m.gameId]
  const side = sideOf(m, seat)
  const k = lastMoveOf(m, side)
  m.undoAsk = null
  m.undoUntil = 0
  if (k < 0) return []
  const start = m.log.length
  m.acts = m.acts.slice(0, k)
  let s = m.s0
  for (const x of m.acts) s = def.apply(s, x.a) ?? s
  m.s = s
  push(m, { type: 'undo', by: side, moves: m.acts.length }, seat)
  schedule(room, now)
  return m.log.slice(start)
}

/** 時間到：猜拳時間到、電腦出牌，或真人逾時跳過 */
export function matchTick(room: RoomState, now: number): LogEntry[] {
  const m = room.match
  if (!m || m.over) return []
  const start = m.log.length
  // 悔棋申請過了 10 秒沒人回答：當作不同意
  if (m.undoAsk !== null && m.undoUntil && now >= m.undoUntil - EARLY_MS) {
    push(m, { type: 'undoNo', by: m.undoAsk })
    m.undoAsk = null
    m.undoUntil = 0
  }
  // 早幾毫秒醒來也算到了
  if (!m.nextAt || now < m.nextAt - EARLY_MS) return m.log.slice(start)
  if (m.rps) {
    settleRps(room, now, true)
    return m.log.slice(start)
  }
  const def = MATCH_DEFS[m.gameId]
  const side = def.turn(m.s)
  const t = seatOf(m, side)
  const seat = m.seats[t]
  if (present(room, seat.pid) && m.idle[t] < IDLE_TIMEOUTS) {
    m.idle[t]++
    return commit(room, t, def.timeout(side), now)
  }
  let a: unknown
  ;[a, m.rng] = def.bot(m.s, seat.bot, m.opts, m.rng)
  const out = commit(room, t, a, now)
  // 電腦的動作被規則擋下（不該發生）：改用逾時，避免卡住
  return out.length ? out : commit(room, t, def.timeout(side), now)
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
    seats: m.seats.map((s) => (s.pid ? { pid: s.pid, bot: s.bot, ...(s.name ? { name: s.name } : {}) } : { bot: s.bot })),
    opts: m.opts,
    // 棋類開局時還不知道誰先走（猜拳後才知道），所以給「先走那一方」的視角都一樣（棋類是公開的；暗棋只給有棋沒棋）
    start: MATCH_DEFS[m.gameId].start(m.s0, m.first < 0 || seat < 0 ? -1 : sideOf(m, seat)),
  }
}
