// 九子棋（Nine Men's Morris，雙人）。純函式，不碰畫面。
// 規則（常見的正式規則）：
//   - 棋盤是三個套在一起的正方形，四邊中點用線連起來，共 24 個點；每人 9 顆子。
//   - 先「放子」：兩人輪流把手上的子放到空點上，放完 9 顆才開始「走子」。
//   - 走子：沿著線走到相鄰的空點。
//   - 成三：自己的三顆子連成一條線（剛放下或剛走到），就拿走對方一顆子；
//     對方在成三裡的子不能拿，除非對方所有的子都在成三裡。
//   - 飛子（規則設定，預設開）：放完子之後只剩 3 顆的人，可以飛到任何空點。
//   - 輸：放完子之後只剩 2 顆，或輪到自己卻完全沒有能走的步。
//   - 和棋：雙方都放完子之後，連續 60 步沒有人拿子（有人在飛子時 20 步）；或整局超過 400 步。
//   - 時間到＝這一步跳過、換對方。可以認輸。
// 點的編號（x, y 是 7 × 7 的格子座標）：
//    0 ─────── 1 ─────── 2
//    │  3 ──── 4 ──── 5  │
//    │  │  6 ─ 7 ─ 8  │  │
//    9 ─10 ─11     12 ─13 ─14
//    │  │ 15 ─16 ─17  │  │
//    │ 18 ────19 ────20  │
//   21 ───────22 ───────23
import type { Result } from '../common/types'

export type Side = 0 | 1
export const POINTS = 24
export const PIECES = 9
/** 雙方都放完子之後，連續幾步沒人拿子算和棋 */
export const QUIET_LIMIT = 60
/** 有人在飛子（剩 3 顆）時，連續幾步沒人拿子就和棋（飛的那一方很會擋，不然會僵持很久；使用者要的） */
export const FLY_QUIET_LIMIT = 20
export const MAX_PLIES = 400

/** 每個點在 7 × 7 格子上的位置（畫面用） */
export const XY: readonly [number, number][] = [
  [0, 0], [3, 0], [6, 0],
  [1, 1], [3, 1], [5, 1],
  [2, 2], [3, 2], [4, 2],
  [0, 3], [1, 3], [2, 3], [4, 3], [5, 3], [6, 3],
  [2, 4], [3, 4], [4, 4],
  [1, 5], [3, 5], [5, 5],
  [0, 6], [3, 6], [6, 6],
]

/** 16 條線（每條三個點）＝能成三的位置 */
export const MILLS: readonly [number, number, number][] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11], [12, 13, 14], [15, 16, 17], [18, 19, 20], [21, 22, 23],
  [0, 9, 21], [3, 10, 18], [6, 11, 15], [1, 4, 7], [16, 19, 22], [8, 12, 17], [5, 13, 20], [2, 14, 23],
]

/** 相鄰的點（沿著線走一格） */
export const ADJ: readonly number[][] = (() => {
  const adj: number[][] = Array.from({ length: POINTS }, () => [])
  for (const [a, b, c] of MILLS) {
    adj[a].push(b)
    adj[b].push(a, c)
    adj[c].push(b)
  }
  return adj
})()
/** 每個點在哪兩條線上 */
export const MILLS_AT: readonly (readonly [number, number, number])[][] = Array.from({ length: POINTS }, (_, p) => MILLS.filter((m) => m.includes(p)))

export interface MorrisState {
  /** 每個點：-1＝空、0／1＝誰的子 */
  board: number[]
  /** 手上還沒放的子 */
  hand: [number, number]
  turn: Side
  /** 飛子規則 */
  flying: boolean
  status: 'playing' | 'done' | 'resigned'
  /** 贏家；和棋是 null */
  winner: Side | null
  /** 怎麼結束的（畫面用）：pieces 只剩兩顆、blocked 沒步可走、quiet 太久沒拿子、long 下太久 */
  reason: 'pieces' | 'blocked' | 'quiet' | 'flyQuiet' | 'long' | 'resign' | null
  plies: number
  /** 雙方都放完子之後，連續幾步沒人拿子 */
  quiet: number
  /** 上一步（畫面做動畫用）：from＝-1 是放子；removed＝-1 是沒拿子；時間到跳過時 to 是 -1 */
  last: { side: Side; from: number; to: number; removed: number } | null
}

export type MorrisAction =
  | { type: 'place'; to: number; remove?: number }
  | { type: 'move'; from: number; to: number; remove?: number }
  | { type: 'timeout' }
  | { type: 'resign'; side: Side }
export type MorrisError = 'over' | 'illegal' | 'taken' | 'needRemove' | 'badRemove' | 'phase'

const other = (s: Side): Side => (s === 0 ? 1 : 0)

export function createMorris(flying = true): MorrisState {
  return { board: Array(POINTS).fill(-1), hand: [PIECES, PIECES], turn: 0, flying, status: 'playing', winner: null, reason: null, plies: 0, quiet: 0, last: null }
}

export const countOf = (board: readonly number[], side: Side) => board.reduce((n, v) => n + (v === side ? 1 : 0), 0)

/** 這個點的子在不在成三裡 */
export const inMill = (board: readonly number[], p: number): boolean => board[p] >= 0 && MILLS_AT[p].some(([a, b, c]) => board[a] === board[p] && board[b] === board[p] && board[c] === board[p])

/** 子放到（走到）p 之後，會不會成三（board 已經是放好之後的） */
export const formsMill = (board: readonly number[], p: number): boolean => inMill(board, p)

/** 能拿走的對方的子：不在成三裡的；全部都在成三裡就都能拿 */
export function removable(board: readonly number[], victim: Side): number[] {
  const all: number[] = []
  const free: number[] = []
  for (let p = 0; p < POINTS; p++) {
    if (board[p] !== victim) continue
    all.push(p)
    if (!inMill(board, p)) free.push(p)
  }
  return free.length ? free : all
}

/** 這個人現在能不能飛 */
export const canFly = (s: Pick<MorrisState, 'board' | 'hand' | 'flying'>, side: Side) => s.flying && s.hand[side] === 0 && countOf(s.board, side) === 3

/** 這顆子能走到哪 */
export function targetsOf(s: Pick<MorrisState, 'board' | 'hand' | 'flying'>, from: number): number[] {
  const side = s.board[from] as Side
  if (side < 0) return []
  if (canFly(s, side)) return s.board.flatMap((v, i) => (v < 0 ? [i] : []))
  return ADJ[from].filter((q) => s.board[q] < 0)
}

/** 能不能走（放子階段一定能放） */
export function hasMove(s: Pick<MorrisState, 'board' | 'hand' | 'flying'>, side: Side): boolean {
  if (s.hand[side] > 0) return s.board.some((v) => v < 0)
  for (let p = 0; p < POINTS; p++) if (s.board[p] === side && targetsOf(s, p).length) return true
  return false
}

/** 結束了沒（輪到 s.turn 的人） */
function judge(s: MorrisState): MorrisState {
  const side = s.turn
  const loser = (reason: MorrisState['reason']): MorrisState => ({ ...s, status: 'done', winner: other(side), reason })
  if (s.hand[side] === 0 && countOf(s.board, side) < 3) return loser('pieces')
  if (!hasMove(s, side)) return loser('blocked')
  if (s.hand[0] === 0 && s.hand[1] === 0) {
    const flyingNow = canFly(s, 0) || canFly(s, 1)
    if (flyingNow && s.quiet >= FLY_QUIET_LIMIT) return { ...s, status: 'done', winner: null, reason: 'flyQuiet' }
    if (s.quiet >= QUIET_LIMIT) return { ...s, status: 'done', winner: null, reason: 'quiet' }
  }
  if (s.plies >= MAX_PLIES) return { ...s, status: 'done', winner: null, reason: 'long' }
  return s
}

export function applyMorris(state: MorrisState, action: MorrisAction): Result<MorrisState, MorrisError> {
  if (state.status !== 'playing') return { ok: false, reason: 'over' }
  const side = state.turn
  if (action.type === 'resign') return { ok: true, state: { ...state, status: 'resigned', winner: other(action.side), reason: 'resign', last: null } }
  if (action.type === 'timeout') return { ok: true, state: judge({ ...state, turn: other(side), plies: state.plies + 1, last: { side, from: -1, to: -1, removed: -1 } }) }
  const board = state.board.slice()
  const hand: [number, number] = [state.hand[0], state.hand[1]]
  const ok = (p: unknown): p is number => typeof p === 'number' && Number.isInteger(p) && p >= 0 && p < POINTS
  let from = -1
  const to = action.to
  if (!ok(to)) return { ok: false, reason: 'illegal' }
  if (action.type === 'place') {
    if (hand[side] <= 0) return { ok: false, reason: 'phase' }
    if (board[to] >= 0) return { ok: false, reason: 'taken' }
    board[to] = side
    hand[side]--
  } else {
    if (hand[side] > 0) return { ok: false, reason: 'phase' }
    from = action.from
    if (!ok(from) || board[from] !== side) return { ok: false, reason: 'illegal' }
    if (!targetsOf(state, from).includes(to)) return { ok: false, reason: board[to] >= 0 ? 'taken' : 'illegal' }
    board[from] = -1
    board[to] = side
  }
  let removed = -1
  const victim = other(side)
  if (formsMill(board, to) && countOf(board, victim) > 0) {
    const r = action.remove
    if (r === undefined) return { ok: false, reason: 'needRemove' }
    if (!ok(r) || !removable(board, victim).includes(r)) return { ok: false, reason: 'badRemove' }
    board[r] = -1
    removed = r
  } else if (action.remove !== undefined) return { ok: false, reason: 'badRemove' }
  const placing = hand[0] > 0 || hand[1] > 0
  const quiet = placing || removed >= 0 ? 0 : state.quiet + 1
  const s: MorrisState = { ...state, board, hand, turn: victim, plies: state.plies + 1, quiet, last: { side, from, to, removed } }
  return { ok: true, state: judge(s) }
}

/** 所有能走的步（成三的步，每一種拿法各算一步） */
export function legalActions(s: MorrisState): MorrisAction[] {
  if (s.status !== 'playing') return []
  const side = s.turn
  const victim = other(side)
  const out: MorrisAction[] = []
  const withRemoves = (base: { type: 'place'; to: number } | { type: 'move'; from: number; to: number }, board: number[]) => {
    if (formsMill(board, base.to) && countOf(board, victim) > 0) for (const r of removable(board, victim)) out.push({ ...base, remove: r })
    else out.push(base)
  }
  const board = s.board.slice()
  if (s.hand[side] > 0) {
    for (let p = 0; p < POINTS; p++) {
      if (board[p] >= 0) continue
      board[p] = side
      withRemoves({ type: 'place', to: p }, board)
      board[p] = -1
    }
    return out
  }
  for (let p = 0; p < POINTS; p++) {
    if (board[p] !== side) continue
    for (const q of targetsOf(s, p)) {
      board[p] = -1
      board[q] = side
      withRemoves({ type: 'move', from: p, to: q }, board)
      board[q] = -1
      board[p] = side
    }
  }
  return out
}

/** 放下（走到）to 之後會不會成三（畫面用：成三的話要接著選拿哪一顆） */
export function wouldMill(s: MorrisState, from: number, to: number): boolean {
  const board = s.board.slice()
  if (from >= 0) board[from] = -1
  board[to] = s.turn
  return formsMill(board, to) && countOf(board, other(s.turn)) > 0
}
