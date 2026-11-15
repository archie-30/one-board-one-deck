// 黑白棋（奧賽羅）：8 × 8，黑棋先下。下的子要和自己另一顆子把對方的子夾在中間（橫、直、斜），
// 夾到的子全部翻成自己的顏色；一顆都夾不到的地方不能下。沒地方下就輪空，雙方都沒地方下就結束，子多的人贏。
// 純函式，狀態可序列化成 JSON。
import type { Result } from '../common/types'

export const SIZE = 8
export type Disc = 0 | 1 | 2
export type Player = 1 | 2

export interface OthelloState {
  board: Disc[]
  turn: Player
  /** 下了幾手（輪空與逾時也算一手） */
  moves: number
  /** 上一手下在哪；-1 = 輪空／逾時；-2 = 還沒人下 */
  lastMove: number
  /** 上一手翻過來的子（畫面做翻面動畫用） */
  lastFlipped: number[]
  /** 剛剛因為沒地方下而被跳過的一方（0 = 沒有） */
  skipped: 0 | Player
  over: boolean
  /** 1 黑贏、2 白贏、3 和局、0 還沒結束 */
  winner: 0 | 1 | 2 | 3
}

export type OthelloAction = { type: 'play'; index: number } | { type: 'timeout' }
export type OthelloError = 'over' | 'occupied' | 'noFlip' | 'out'

export const other = (p: Player): Player => (p === 1 ? 2 : 1)
export const toIndex = (x: number, y: number) => y * SIZE + x
export const toXY = (i: number): [number, number] => [i % SIZE, Math.floor(i / SIZE)]

const DIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
]

export function createOthello(): OthelloState {
  const board: Disc[] = new Array(SIZE * SIZE).fill(0)
  board[toIndex(3, 3)] = 2
  board[toIndex(4, 4)] = 2
  board[toIndex(3, 4)] = 1
  board[toIndex(4, 3)] = 1
  return { board, turn: 1, moves: 0, lastMove: -2, lastFlipped: [], skipped: 0, over: false, winner: 0 }
}

/** player 下在 index 會翻過來的子（不能下就是空陣列） */
export function flipsFor(board: readonly Disc[], index: number, player: Player): number[] {
  if (board[index] !== 0) return []
  const [x, y] = toXY(index)
  const opp = other(player)
  const out: number[] = []
  for (const [dx, dy] of DIRS) {
    const line: number[] = []
    let cx = x + dx
    let cy = y + dy
    while (cx >= 0 && cy >= 0 && cx < SIZE && cy < SIZE && board[toIndex(cx, cy)] === opp) {
      line.push(toIndex(cx, cy))
      cx += dx
      cy += dy
    }
    if (line.length && cx >= 0 && cy >= 0 && cx < SIZE && cy < SIZE && board[toIndex(cx, cy)] === player) out.push(...line)
  }
  return out
}

/** player 下在 index 能不能翻到至少一顆（不建陣列，電腦算很多次時比較快） */
export function canFlip(board: readonly Disc[], index: number, player: Player): boolean {
  if (board[index] !== 0) return false
  const x = index % SIZE
  const y = (index - x) / SIZE
  const opp = player === 1 ? 2 : 1
  for (const [dx, dy] of DIRS) {
    let cx = x + dx
    let cy = y + dy
    let n = 0
    while (cx >= 0 && cy >= 0 && cx < SIZE && cy < SIZE && board[cy * SIZE + cx] === opp) {
      n++
      cx += dx
      cy += dy
    }
    if (n && cx >= 0 && cy >= 0 && cx < SIZE && cy < SIZE && board[cy * SIZE + cx] === player) return true
  }
  return false
}

/** player 所有能下的位置 */
export function legalMoves(board: readonly Disc[], player: Player): number[] {
  const out: number[] = []
  for (let i = 0; i < board.length; i++) if (canFlip(board, i, player)) out.push(i)
  return out
}

export function countDiscs(board: readonly Disc[]): { black: number; white: number } {
  let black = 0
  let white = 0
  for (const d of board) {
    if (d === 1) black++
    else if (d === 2) white++
  }
  return { black, white }
}

/** 換下一個人：對方有地方下就換對方；對方沒有、自己有就輪空（自己再下）；都沒有就結束 */
function advance(s: OthelloState, mover: Player): OthelloState {
  const next = other(mover)
  if (legalMoves(s.board, next).length) return { ...s, turn: next, skipped: 0 }
  if (legalMoves(s.board, mover).length) return { ...s, turn: mover, skipped: next }
  const { black, white } = countDiscs(s.board)
  return { ...s, turn: next, skipped: 0, over: true, winner: black > white ? 1 : white > black ? 2 : 3 }
}

export function applyOthello(state: OthelloState, action: OthelloAction): Result<OthelloState, OthelloError> {
  if (state.over) return { ok: false, reason: 'over' }
  const me = state.turn
  if (action.type === 'timeout') {
    // 時間到：這一手跳過，換對方（對方也沒地方下時照常判斷結束）
    return { ok: true, state: advance({ ...state, moves: state.moves + 1, lastMove: -1, lastFlipped: [] }, me) }
  }
  const i = action.index
  if (i < 0 || i >= SIZE * SIZE) return { ok: false, reason: 'out' }
  if (state.board[i] !== 0) return { ok: false, reason: 'occupied' }
  const flips = flipsFor(state.board, i, me)
  if (!flips.length) return { ok: false, reason: 'noFlip' }
  const board = state.board.slice()
  board[i] = me
  for (const f of flips) board[f] = me
  return { ok: true, state: advance({ ...state, board, moves: state.moves + 1, lastMove: i, lastFlipped: flips }, me) }
}
