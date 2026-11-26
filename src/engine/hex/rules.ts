// 海克斯（Hex，雙人）。純函式，不碰畫面。
// 規則（正式規則）：
//   - 菱形棋盤 n × n 個六角格（預設 11，規則設定可改 9、13）。
//   - 紅方（0 號，先下）要把上、下兩條紅邊連起來；藍方（1 號）要把左、右兩條藍邊連起來。
//   - 兩人輪流在空格放一顆自己的子，放了就不會動、不會被吃。
//   - 先用自己的子連通兩條邊的人贏。棋盤下滿一定有人連通，所以沒有和棋。
//   - 交換規則（規則設定，預設關）：紅方下第一手之後，藍方可以選擇「交換」：
//     把那顆紅子換成自己的（照對角線翻到對稱的位置變成藍子），然後換紅方下。先手的人就不會挑太好的第一手。
//   - 時間到＝這一手跳過、換對方。可以認輸。
// 格子編號：第 r 列第 c 行＝r × n + c（第 0 列在上面，每往下一列整列往右錯開半格）。
// 相鄰的六格：(r-1,c)、(r-1,c+1)、(r,c-1)、(r,c+1)、(r+1,c-1)、(r+1,c)。
import type { Result } from '../common/types'

export type Side = 0 | 1
export const SIZES = [9, 11, 13] as const
export const sizeOf = (v: unknown): number => (v === '9' || v === 9 ? 9 : v === '13' || v === 13 ? 13 : 11)

export interface HexState {
  n: number
  /** 每一格：-1＝空、0＝紅、1＝藍 */
  cells: number[]
  turn: Side
  status: 'playing' | 'done' | 'resigned'
  winner: Side | null
  plies: number
  /** 交換規則有沒有開、用過了沒 */
  swapRule: boolean
  swapped: boolean
  /** 上一步（畫面做動畫用）：誰下在哪一格；交換時 from 是原本那顆紅子；時間到跳過時 cell 是 -1 */
  last: { side: Side; cell: number; from?: number } | null
  /** 贏的那一串（連通兩邊的子），畫面亮起來用 */
  path: number[]
}

export type HexAction = { type: 'place'; cell: number } | { type: 'swap' } | { type: 'timeout' } | { type: 'resign'; side: Side }
export type HexError = 'over' | 'illegal' | 'taken' | 'noSwap'

const other = (s: Side): Side => (s === 0 ? 1 : 0)

export function createHex(n = 11, swapRule = false): HexState {
  return { n, cells: Array(n * n).fill(-1), turn: 0, status: 'playing', winner: null, plies: 0, swapRule, swapped: false, last: null, path: [] }
}

/** 相鄰的格子（每個棋盤大小算一次就好） */
const nbCache = new Map<number, number[][]>()
export function neighbors(n: number): number[][] {
  let out = nbCache.get(n)
  if (out) return out
  out = []
  const D = [
    [-1, 0],
    [-1, 1],
    [0, -1],
    [0, 1],
    [1, -1],
    [1, 0],
  ]
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const list: number[] = []
      for (const [dr, dc] of D) {
        const rr = r + dr
        const cc = c + dc
        if (rr >= 0 && rr < n && cc >= 0 && cc < n) list.push(rr * n + cc)
      }
      out.push(list)
    }
  }
  nbCache.set(n, out)
  return out
}

/** 這一格在不在 side 的起點邊／終點邊（紅：上、下；藍：左、右） */
export const onStart = (n: number, side: Side, i: number) => (side === 0 ? Math.floor(i / n) === 0 : i % n === 0)
export const onEnd = (n: number, side: Side, i: number) => (side === 0 ? Math.floor(i / n) === n - 1 : i % n === n - 1)

/** side 有沒有連通兩邊；有的話回傳連通的那一串（只留從起點到終點的一條路上的子） */
export function connection(n: number, cells: readonly number[], side: Side): number[] | null {
  const nb = neighbors(n)
  const prev = new Map<number, number>()
  const queue: number[] = []
  for (let k = 0; k < n; k++) {
    const i = side === 0 ? k : k * n
    if (cells[i] === side) {
      prev.set(i, -1)
      queue.push(i)
    }
  }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]
    if (onEnd(n, side, i)) {
      const path: number[] = []
      for (let x = i; x >= 0; x = prev.get(x)!) path.push(x)
      return path.reverse()
    }
    for (const j of nb[i]) {
      if (cells[j] === side && !prev.has(j)) {
        prev.set(j, i)
        queue.push(j)
      }
    }
  }
  return null
}

/** 交換規則：照對角線翻過去的那一格（紅子 (r,c) → 藍子 (c,r)，紅邊變藍邊） */
export const mirror = (n: number, i: number) => (i % n) * n + Math.floor(i / n)

/** 現在能不能交換：規則有開、棋盤上只有紅方下的第一顆、輪到藍方、還沒換過 */
export function canSwap(s: HexState): boolean {
  if (!s.swapRule || s.swapped || s.status !== 'playing' || s.turn !== 1) return false
  let stones = 0
  for (const v of s.cells) if (v >= 0) stones++
  return stones === 1 && s.cells.some((v) => v === 0)
}

export function applyHex(state: HexState, action: HexAction): Result<HexState, HexError> {
  if (state.status !== 'playing') return { ok: false, reason: 'over' }
  if (action.type === 'resign') return { ok: true, state: { ...state, status: 'resigned', winner: other(action.side), last: null } }
  if (action.type === 'timeout') return { ok: true, state: { ...state, turn: other(state.turn), plies: state.plies + 1, last: { side: state.turn, cell: -1 } } }
  if (action.type === 'swap') {
    if (!canSwap(state)) return { ok: false, reason: 'noSwap' }
    const from = state.cells.indexOf(0)
    const cells = state.cells.slice()
    cells[from] = -1
    const to = mirror(state.n, from)
    cells[to] = 1
    return { ok: true, state: { ...state, cells, turn: 0, plies: state.plies + 1, swapped: true, last: { side: 1, cell: to, from } } }
  }
  const cell = action.cell
  if (!Number.isInteger(cell) || cell < 0 || cell >= state.cells.length) return { ok: false, reason: 'illegal' }
  if (state.cells[cell] >= 0) return { ok: false, reason: 'taken' }
  const side = state.turn
  const cells = state.cells.slice()
  cells[cell] = side
  const path = connection(state.n, cells, side)
  const s: HexState = { ...state, cells, turn: other(side), plies: state.plies + 1, last: { side, cell } }
  if (path) return { ok: true, state: { ...s, status: 'done', winner: side, path } }
  return { ok: true, state: s }
}

/** 空格 */
export const emptyCells = (s: Pick<HexState, 'cells'>): number[] => s.cells.flatMap((v, i) => (v < 0 ? [i] : []))
