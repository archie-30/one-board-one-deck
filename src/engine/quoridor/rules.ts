// 步步為營（Quoridor，雙人）：9 × 9 棋盤，每人一顆棋子、10 道牆。
// 規則（正式規則）：
//   - 0 號從下面中間（第 8 列第 4 行）出發，要走到最上面一列；1 號從上面中間出發，要走到最下面一列。先到的人贏。
//   - 每一步二選一：走棋子（上下左右一格，不能穿牆），或放一道牆（長兩格，擋在格子之間）。
//   - 兩顆棋子面對面（中間沒有牆）時，可以跳過對方落在他後面；後面有牆或是邊界就改成斜跳到對方的左邊或右邊（那一邊也不能有牆）。
//   - 牆不能跟別的牆重疊或交叉（十字），也不能把任何一方完全堵死：放完之後兩個人都還要有路走到終點。
//   - 牆用完了就只能走棋子。
//   - 沒有和棋規則；為了不讓對局拖不完，雙方合計走滿 MAX_PLIES 步還沒人到，就和棋。
// 牆的位置：格子之間的交叉點，8 × 8 個（第 r 列第 c 個，r、c 都是 0～7）。
//   橫牆 (r, c)：擋住第 r 列和第 r+1 列之間、第 c 和 c+1 行那兩格的上下通路。
//   直牆 (r, c)：擋住第 c 行和第 c+1 行之間、第 r 和 r+1 列那兩格的左右通路。
// 純函式，不碰畫面。
import type { Result } from '../common/types'

export const N = 9
export const CELLS = N * N
/** 牆的交叉點：一邊 8 個 */
export const W = N - 1
export const WALLS_EACH = 10
/** 雙方合計走滿這麼多步還沒人到：和棋 */
export const MAX_PLIES = 200

export type Side = 0 | 1
export type Orient = 'h' | 'v'

export interface QuoridorState {
  /** 兩顆棋子在哪一格（列 × 9 + 行） */
  pawns: [number, number]
  /** 橫牆、直牆：交叉點（列 × 8 + 行）有沒有牆 */
  h: boolean[]
  v: boolean[]
  /** 每個人還剩幾道牆 */
  wallsLeft: [number, number]
  turn: Side
  status: 'playing' | 'goal' | 'resigned' | 'limit'
  winner: Side | null
  plies: number
  /** 上一步（畫面做動畫用） */
  last: { type: 'move'; side: Side; from: number; to: number } | { type: 'wall'; side: Side; at: number; o: Orient } | null
}

export type QuoridorAction =
  | { type: 'move'; to: number }
  | { type: 'wall'; at: number; o: Orient }
  | { type: 'timeout' }
  | { type: 'resign'; side: Side }
export type QuoridorError = 'over' | 'illegal' | 'noWalls' | 'overlap' | 'blocks'

export const rowOf = (i: number) => Math.floor(i / N)
export const colOf = (i: number) => i % N
export const cellAt = (r: number, c: number) => r * N + c
export const goalRow = (s: Side) => (s === 0 ? 0 : N - 1)
const other = (s: Side): Side => (s === 0 ? 1 : 0)

export function createQuoridor(): QuoridorState {
  return {
    pawns: [cellAt(N - 1, 4), cellAt(0, 4)],
    h: Array(W * W).fill(false),
    v: Array(W * W).fill(false),
    wallsLeft: [WALLS_EACH, WALLS_EACH],
    turn: 0,
    status: 'playing',
    winner: null,
    plies: 0,
    last: null,
  }
}

type Walls = Pick<QuoridorState, 'h' | 'v'>

/** a、b 兩格（相鄰）之間有沒有牆擋住 */
export function blocked(w: Walls, a: number, b: number): boolean {
  const ra = rowOf(a)
  const ca = colOf(a)
  const rb = rowOf(b)
  const cb = colOf(b)
  if (ca === cb) {
    // 上下：看兩列之間的橫牆（這一行的左邊那個交叉點或右邊那個）
    const r = Math.min(ra, rb)
    return (ca < W && w.h[r * W + ca]) || (ca > 0 && w.h[r * W + ca - 1])
  }
  // 左右：看兩行之間的直牆
  const c = Math.min(ca, cb)
  return (ra < W && w.v[ra * W + c]) || (ra > 0 && w.v[(ra - 1) * W + c])
}

const DIRS: [number, number][] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
]
/** 從 i 往 (dr, dc) 走一格；出界是 -1 */
const stepTo = (i: number, dr: number, dc: number) => {
  const r = rowOf(i) + dr
  const c = colOf(i) + dc
  return r < 0 || r >= N || c < 0 || c >= N ? -1 : cellAt(r, c)
}
/** 從 i 走得過去的相鄰格（不管棋子） */
export function openNeighbors(w: Walls, i: number): number[] {
  const out: number[] = []
  for (const [dr, dc] of DIRS) {
    const n = stepTo(i, dr, dc)
    if (n >= 0 && !blocked(w, i, n)) out.push(n)
  }
  return out
}

/** 每一格到 side 的終點最少要走幾步（不管棋子，只看牆）；走不到是 Infinity */
export function distMap(w: Walls, side: Side): number[] {
  const d = Array(CELLS).fill(Infinity)
  const q: number[] = []
  for (let c = 0; c < N; c++) {
    const g = cellAt(goalRow(side), c)
    d[g] = 0
    q.push(g)
  }
  for (let k = 0; k < q.length; k++) {
    const i = q[k]
    for (const n of openNeighbors(w, i)) {
      if (d[n] === Infinity) {
        d[n] = d[i] + 1
        q.push(n)
      }
    }
  }
  return d
}
/** 從終點往回找，找到 cell 就停：cell 到 side 的終點最少幾步（只看牆）；走不到是 Infinity */
export function distTo(w: Walls, side: Side, cell: number): number {
  if (rowOf(cell) === goalRow(side)) return 0
  const d = new Int16Array(CELLS).fill(-1)
  const q = new Int16Array(CELLS)
  let tail = 0
  for (let c = 0; c < N; c++) {
    const g = cellAt(goalRow(side), c)
    d[g] = 0
    q[tail++] = g
  }
  for (let k = 0; k < tail; k++) {
    const i = q[k]
    const r = rowOf(i)
    const c = colOf(i)
    // 上下左右（直接查牆，不另外建陣列，比較快）
    if (r > 0 && d[i - N] < 0 && !blocked(w, i, i - N)) {
      if (i - N === cell) return d[i] + 1
      d[i - N] = d[i] + 1
      q[tail++] = i - N
    }
    if (r < N - 1 && d[i + N] < 0 && !blocked(w, i, i + N)) {
      if (i + N === cell) return d[i] + 1
      d[i + N] = d[i] + 1
      q[tail++] = i + N
    }
    if (c > 0 && d[i - 1] < 0 && !blocked(w, i, i - 1)) {
      if (i - 1 === cell) return d[i] + 1
      d[i - 1] = d[i] + 1
      q[tail++] = i - 1
    }
    if (c < N - 1 && d[i + 1] < 0 && !blocked(w, i, i + 1)) {
      if (i + 1 === cell) return d[i] + 1
      d[i + 1] = d[i] + 1
      q[tail++] = i + 1
    }
  }
  return Infinity
}
/** side 現在離終點還要走幾步（只看牆） */
export const distance = (s: Pick<QuoridorState, 'h' | 'v' | 'pawns'>, side: Side) => distTo(s, side, s.pawns[side])

/** 輪到的人棋子能走到哪些格（含跳過對方、斜跳） */
export function pawnMoves(s: QuoridorState, side: Side = s.turn): number[] {
  const me = s.pawns[side]
  const op = s.pawns[other(side)]
  const out: number[] = []
  for (const [dr, dc] of DIRS) {
    const n = stepTo(me, dr, dc)
    if (n < 0 || blocked(s, me, n)) continue
    if (n !== op) {
      out.push(n)
      continue
    }
    // 對方擋在前面：直跳過去；後面有牆或是邊界就斜跳
    const jump = stepTo(n, dr, dc)
    if (jump >= 0 && !blocked(s, n, jump)) {
      out.push(jump)
      continue
    }
    for (const [pr, pc] of dr === 0 ? [[-1, 0], [1, 0]] : [[0, -1], [0, 1]]) {
      const d = stepTo(n, pr, pc)
      if (d >= 0 && d !== me && !blocked(s, n, d)) out.push(d)
    }
  }
  return out
}

/** 這道牆會不會跟已經有的牆重疊或交叉 */
export function wallOverlaps(w: Walls, at: number, o: Orient): boolean {
  const r = Math.floor(at / W)
  const c = at % W
  if (w.h[at] || w.v[at]) return true // 同一個交叉點已經有牆（同向重疊或十字交叉）
  if (o === 'h') return (c > 0 && w.h[at - 1]) || (c < W - 1 && w.h[at + 1])
  return (r > 0 && w.v[at - W]) || (r < W - 1 && w.v[at + W])
}

/** 放上這道牆之後的牆 */
export function withWall(w: Walls, at: number, o: Orient): Walls {
  if (o === 'h') {
    const h = w.h.slice()
    h[at] = true
    return { h, v: w.v }
  }
  const v = w.v.slice()
  v[at] = true
  return { h: w.h, v }
}

/** 這道牆能不能放（不含「還有沒有牆」）；不能放回傳原因 */
export function wallProblem(s: QuoridorState, at: number, o: Orient): QuoridorError | null {
  if (!Number.isInteger(at) || at < 0 || at >= W * W || (o !== 'h' && o !== 'v')) return 'illegal'
  if (wallOverlaps(s, at, o)) return 'overlap'
  const w = withWall(s, at, o)
  const p = { ...w, pawns: s.pawns }
  if (distance(p, 0) === Infinity || distance(p, 1) === Infinity) return 'blocks'
  return null
}

/** 所有能放的牆（輪到的人還有牆才有） */
export function legalWalls(s: QuoridorState): { at: number; o: Orient }[] {
  if (s.wallsLeft[s.turn] <= 0) return []
  const out: { at: number; o: Orient }[] = []
  for (let at = 0; at < W * W; at++) for (const o of ['h', 'v'] as const) if (!wallProblem(s, at, o)) out.push({ at, o })
  return out
}

export function applyQuoridor(s: QuoridorState, a: QuoridorAction): Result<QuoridorState, QuoridorError> {
  if (s.status !== 'playing') return { ok: false, reason: 'over' }
  if (a.type === 'resign') return { ok: true, state: { ...s, status: 'resigned', winner: other(a.side) } }
  if (a.type === 'timeout') return { ok: true, state: limit({ ...s, turn: other(s.turn), plies: s.plies + 1 }) }
  if (a.type === 'move') {
    if (!pawnMoves(s).includes(a.to)) return { ok: false, reason: 'illegal' }
    const pawns: [number, number] = [...s.pawns]
    const from = pawns[s.turn]
    pawns[s.turn] = a.to
    const won = rowOf(a.to) === goalRow(s.turn)
    return {
      ok: true,
      state: limit({
        ...s,
        pawns,
        turn: other(s.turn),
        plies: s.plies + 1,
        status: won ? 'goal' : 'playing',
        winner: won ? s.turn : null,
        last: { type: 'move', side: s.turn, from, to: a.to },
      }),
    }
  }
  if (s.wallsLeft[s.turn] <= 0) return { ok: false, reason: 'noWalls' }
  const bad = wallProblem(s, a.at, a.o)
  if (bad) return { ok: false, reason: bad }
  const w = withWall(s, a.at, a.o)
  const wallsLeft: [number, number] = [...s.wallsLeft]
  wallsLeft[s.turn]--
  return { ok: true, state: limit({ ...s, ...w, wallsLeft, turn: other(s.turn), plies: s.plies + 1, last: { type: 'wall', side: s.turn, at: a.at, o: a.o } }) }
}

/** 走滿 MAX_PLIES 步還沒人到：和棋 */
const limit = (s: QuoridorState): QuoridorState => (s.status === 'playing' && s.plies >= MAX_PLIES ? { ...s, status: 'limit', winner: null } : s)

/** 牆在畫面上的兩端：橫牆從 (r+1 線, c 行) 蓋兩格；給畫面用 */
export const wallRC = (at: number) => ({ r: Math.floor(at / W), c: at % W })
