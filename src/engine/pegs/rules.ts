// 孔明棋（英式十字形 33 孔，單人）。純函式，不碰畫面。
// 規則（使用者選的）：
//   - 7 × 7 的格子去掉四個角各 2 × 2，剩 33 個孔；開局除了正中間，每個孔都插著一顆子。
//   - 每一步：一顆子沿直線（上下左右，不能斜）跳過旁邊的一顆子，落到後面的空孔；被跳過的子拿掉。
//   - 剩一顆就過關；剩下那顆在正中間是「完美」。沒有步可走（還剩兩顆以上）就結束，照剩幾顆算。
//   - 返回上一步不限次數（畫面自己記，引擎只管一步一步）。
// 孔的編號：r × 7 + c（r、c 是 0～6），不是孔的格子永遠空著。
import type { Result } from '../common/types'

export const N = 7
export const CELLS = N * N
export const CENTER = 24
/** 這一格是不是孔（十字形） */
export const isHole = (i: number) => {
  if (i < 0 || i >= CELLS) return false
  const r = Math.floor(i / N)
  const c = i % N
  return (r >= 2 && r <= 4) || (c >= 2 && c <= 4)
}
export const HOLES: readonly number[] = Array.from({ length: CELLS }, (_, i) => i).filter(isHole)

export interface PegsState {
  /** 每一格有沒有子（不是孔的格子一定是 false） */
  pegs: boolean[]
  /** 走了幾步 */
  moves: number
  /** playing／won（剩一顆）／stuck（沒步可走） */
  status: 'playing' | 'won' | 'stuck'
  /** 上一步（畫面做動畫用）：從哪跳到哪、拿掉哪一顆 */
  last: { from: number; over: number; to: number } | null
}
export interface PegsMove {
  from: number
  to: number
}
export type PegsError = 'over' | 'empty' | 'illegal'

/** 開局：正中間空著，其他 32 個孔都有子 */
export function createPegs(): PegsState {
  return { pegs: Array.from({ length: CELLS }, (_, i) => isHole(i) && i !== CENTER), moves: 0, status: 'playing', last: null }
}
/** 自己擺一個局面（教學、測試用） */
export function fromPegs(list: readonly number[]): PegsState {
  const pegs = Array(CELLS).fill(false)
  for (const i of list) if (isHole(i)) pegs[i] = true
  return judge({ pegs, moves: 0, status: 'playing', last: null })
}

const DIRS: readonly [number, number][] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
]
/** 從 from 往 (dr, dc) 跳：中間那顆、落點（出界或不是孔回 -1） */
function step(from: number, dr: number, dc: number): [number, number] {
  const r = Math.floor(from / N) + dr * 2
  const c = (from % N) + dc * 2
  if (r < 0 || r >= N || c < 0 || c >= N) return [-1, -1]
  const to = r * N + c
  return isHole(to) ? [from + dr * N + dc, to] : [-1, -1]
}

/** 這顆子能跳到哪些空孔 */
export function jumpsFrom(s: Pick<PegsState, 'pegs'>, from: number): number[] {
  if (!s.pegs[from]) return []
  const out: number[] = []
  for (const [dr, dc] of DIRS) {
    const [over, to] = step(from, dr, dc)
    if (to >= 0 && s.pegs[over] && !s.pegs[to]) out.push(to)
  }
  return out
}
/** 所有能走的步 */
export function legalMoves(s: Pick<PegsState, 'pegs'>): PegsMove[] {
  const out: PegsMove[] = []
  for (const from of HOLES) for (const to of jumpsFrom(s, from)) out.push({ from, to })
  return out
}
export const remaining = (s: Pick<PegsState, 'pegs'>) => s.pegs.reduce((n, p) => n + (p ? 1 : 0), 0)
/** 完美：剩一顆而且在正中間 */
export const isPerfect = (s: PegsState) => s.status === 'won' && s.pegs[CENTER]

function judge(s: PegsState): PegsState {
  if (remaining(s) <= 1) return { ...s, status: 'won' }
  if (!legalMoves(s).length) return { ...s, status: 'stuck' }
  return { ...s, status: 'playing' }
}

export function applyPegs(state: PegsState, m: PegsMove): Result<PegsState, PegsError> {
  if (state.status !== 'playing') return { ok: false, reason: 'over' }
  const { from, to } = m
  if (!isHole(from) || !state.pegs[from]) return { ok: false, reason: 'empty' }
  if (!jumpsFrom(state, from).includes(to)) return { ok: false, reason: 'illegal' }
  const over = (from + to) / 2
  const pegs = state.pegs.slice()
  pegs[from] = false
  pegs[over] = false
  pegs[to] = true
  return { ok: true, state: judge({ ...state, pegs, moves: state.moves + 1, last: { from, over, to } }) }
}
