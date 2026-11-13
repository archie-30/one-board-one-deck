// 圍棋規則引擎：純函式，不依賴 UI。
// 規則照正式比賽常用的中國規則：
//   - 黑棋先下；提掉沒有氣的棋；不能自殺（除非同時提掉對方的子）。
//   - 全局同形禁止：下完後的局面不能和以前出現過的任何局面一樣（包含打劫）。
//   - 雙方連續虛手就結束；數子法計分：自己的棋子＋只被自己圍住的空點；白棋加貼 7.5 子。
//   - 可以認輸。
import type { Result } from '../common/types'

export type Color = 1 | 2
export type Point = 0 | 1 | 2
export type GoSize = 9 | 13 | 19

export interface GoOptions {
  size: GoSize
  komi: number
}

export const DEFAULT_GO_OPTIONS: GoOptions = { size: 19, komi: 7.5 }

export interface GoState {
  size: number
  board: Point[]
  turn: Color
  /** 提掉對方幾顆子：captures[1] 是黑棋提的、captures[2] 是白棋提的 */
  captures: [number, number, number]
  /** 連續虛手的次數 */
  passes: number
  /** 下過的局面（禁止全局同形用） */
  history: number[]
  /** 上一手：格子編號；-1 = 虛手；-2 = 還沒人下 */
  lastMove: number
  /** 上一手提掉的子（畫面做動畫用） */
  lastCaptured: number[]
  moves: number
  phase: 'play' | 'over'
  /** 認輸的一方，0 = 沒有人認輸 */
  resigned: 0 | Color
  komi: number
}

export type GoAction = { type: 'play'; index: number } | { type: 'pass' } | { type: 'resign' }
export type GoError = 'over' | 'out' | 'occupied' | 'suicide' | 'ko'

export const other = (c: Color): Color => (c === 1 ? 2 : 1)
export const toIndex = (x: number, y: number, size: number) => y * size + x
export const toXY = (i: number, size: number): [number, number] => [i % size, Math.floor(i / size)]

export function neighbors(i: number, size: number): number[] {
  const x = i % size
  const y = (i - x) / size
  const out: number[] = []
  if (x > 0) out.push(i - 1)
  if (x < size - 1) out.push(i + 1)
  if (y > 0) out.push(i - size)
  if (y < size - 1) out.push(i + size)
  return out
}

/** 一塊相連的同色棋，以及它的氣 */
export function groupAt(board: readonly Point[], size: number, start: number): { stones: number[]; liberties: number[] } {
  const color = board[start]
  const stones: number[] = []
  const libs = new Set<number>()
  const seen = new Set<number>([start])
  const stack = [start]
  while (stack.length) {
    const i = stack.pop()!
    stones.push(i)
    for (const n of neighbors(i, size)) {
      const v = board[n]
      if (v === 0) libs.add(n)
      else if (v === color && !seen.has(n)) {
        seen.add(n)
        stack.push(n)
      }
    }
  }
  return { stones, liberties: [...libs] }
}

/** 局面雜湊（兩個 FNV 雜湊組成約 52 位元，實務上不會撞） */
export function hashBoard(board: readonly Point[]): number {
  let a = 0x811c9dc5
  let b = 0x01000193 ^ 0x5bd1e995
  for (let i = 0; i < board.length; i++) {
    a = Math.imul(a ^ (board[i] + 1), 16777619)
    b = Math.imul(b ^ (board[i] * 7 + i), 2246822519)
  }
  return (a >>> 0) * 1048576 + ((b >>> 0) & 0xfffff)
}

export function createGo(options: Partial<GoOptions> = {}): GoState {
  const opts = { ...DEFAULT_GO_OPTIONS, ...options }
  const board = new Array<Point>(opts.size * opts.size).fill(0)
  return {
    size: opts.size,
    board,
    turn: 1,
    captures: [0, 0, 0],
    passes: 0,
    history: [hashBoard(board)],
    lastMove: -2,
    lastCaptured: [],
    moves: 0,
    phase: 'play',
    resigned: 0,
    komi: opts.komi,
  }
}

/** 試下一手：回傳下完後的棋盤與提掉的子；不合法時回傳原因 */
export function tryPlay(state: GoState, index: number): Result<{ board: Point[]; captured: number[]; hash: number }, GoError> {
  const { size } = state
  if (state.phase === 'over') return { ok: false, reason: 'over' }
  if (!Number.isInteger(index) || index < 0 || index >= size * size) return { ok: false, reason: 'out' }
  if (state.board[index] !== 0) return { ok: false, reason: 'occupied' }
  const me = state.turn
  const board = state.board.slice()
  board[index] = me
  const captured: number[] = []
  for (const n of neighbors(index, size)) {
    if (board[n] !== other(me)) continue
    const g = groupAt(board, size, n)
    if (g.liberties.length === 0) {
      for (const s of g.stones) {
        board[s] = 0
        captured.push(s)
      }
    }
  }
  if (groupAt(board, size, index).liberties.length === 0) return { ok: false, reason: 'suicide' }
  const hash = hashBoard(board)
  if (state.history.includes(hash)) return { ok: false, reason: 'ko' }
  return { ok: true, state: { board, captured, hash } }
}

export function applyGo(state: GoState, action: GoAction): Result<GoState, GoError> {
  if (state.phase === 'over') return { ok: false, reason: 'over' }
  if (action.type === 'resign') return { ok: true, state: { ...state, phase: 'over', resigned: state.turn, lastCaptured: [] } }
  if (action.type === 'pass') {
    const passes = state.passes + 1
    return { ok: true, state: { ...state, passes, turn: other(state.turn), lastMove: -1, lastCaptured: [], moves: state.moves + 1, phase: passes >= 2 ? 'over' : 'play' } }
  }
  const r = tryPlay(state, action.index)
  if (!r.ok) return r
  const captures = state.captures.slice() as GoState['captures']
  captures[state.turn] += r.state.captured.length
  return {
    ok: true,
    state: {
      ...state,
      board: r.state.board,
      turn: other(state.turn),
      captures,
      passes: 0,
      history: [...state.history, r.state.hash],
      lastMove: action.index,
      lastCaptured: r.state.captured,
      moves: state.moves + 1,
    },
  }
}

/** 所有合法的落子點 */
export function legalMoves(state: GoState): number[] {
  const out: number[] = []
  for (let i = 0; i < state.board.length; i++) if (state.board[i] === 0 && tryPlay(state, i).ok) out.push(i)
  return out
}

export interface GoScore {
  black: number
  white: number
  /** 每一點算誰的：0 = 都不算（單官）、1 = 黑、2 = 白 */
  area: Point[]
  winner: Color
  /** 贏多少（子） */
  margin: number
}

/** 數子法計分。dead 是要當作死棋提掉的子 */
export function scoreGo(state: GoState, dead: readonly number[] = []): GoScore {
  const { size } = state
  const board = state.board.slice()
  for (const d of dead) board[d] = 0
  const area = new Array<Point>(board.length).fill(0)
  const seen = new Uint8Array(board.length)
  for (let i = 0; i < board.length; i++) {
    if (board[i] !== 0) {
      area[i] = board[i]
      continue
    }
    if (seen[i]) continue
    // 一塊空地：看它碰到哪些顏色
    const region: number[] = []
    const borders = new Set<Point>()
    const stack = [i]
    seen[i] = 1
    while (stack.length) {
      const p = stack.pop()!
      region.push(p)
      for (const n of neighbors(p, size)) {
        if (board[n] === 0) {
          if (!seen[n]) {
            seen[n] = 1
            stack.push(n)
          }
        } else borders.add(board[n])
      }
    }
    if (borders.size === 1) {
      const owner = [...borders][0]
      for (const p of region) area[p] = owner
    }
  }
  let black = 0
  let white = state.komi
  for (const a of area) {
    if (a === 1) black++
    else if (a === 2) white++
  }
  const winner: Color = state.resigned ? other(state.resigned) : black > white ? 1 : 2
  return { black, white, area, winner, margin: Math.abs(black - white) }
}
