// 五子棋規則引擎：純函式，不依賴 UI。
import type { Result } from '../common/types'

export const BOARD_SIZE = 15

/** 0 = 空，1 = 黑，2 = 白 */
export type Stone = 0 | 1 | 2
export type Player = 1 | 2

export interface GomokuOptions {
  /** 黑棋禁手（三三、四四、長連） */
  forbidden: boolean
  /** 長連（六子以上）是否算贏 */
  overlineWins: boolean
}

export const DEFAULT_GOMOKU_OPTIONS: GomokuOptions = {
  forbidden: false,
  overlineWins: true,
}

export interface GomokuState {
  size: number
  board: Stone[]
  turn: Player
  /** 依序落子的格子編號 */
  moves: number[]
  /** 0 = 進行中，1 = 黑勝，2 = 白勝，3 = 和局 */
  winner: 0 | 1 | 2 | 3
  /** 勝利連線的格子（依方向排序） */
  winLine: number[]
  options: GomokuOptions
}

export type PlaceError = 'finished' | 'out' | 'occupied' | 'forbidden'
export type ForbiddenKind = 'overline' | 'doubleFour' | 'doubleThree'

export const DIRECTIONS: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
]

export function createGomoku(options: Partial<GomokuOptions> = {}, size = BOARD_SIZE): GomokuState {
  return {
    size,
    board: new Array<Stone>(size * size).fill(0),
    turn: 1,
    moves: [],
    winner: 0,
    winLine: [],
    options: { ...DEFAULT_GOMOKU_OPTIONS, ...options },
  }
}

export const toIndex = (x: number, y: number, size = BOARD_SIZE) => y * size + x
export const toXY = (index: number, size = BOARD_SIZE): [number, number] => [index % size, Math.floor(index / size)]

function at(board: readonly Stone[], size: number, x: number, y: number): Stone | -1 {
  if (x < 0 || y < 0 || x >= size || y >= size) return -1
  return board[y * size + x]
}

/** 通過 (x,y) 的同色連續棋子（含自己），回傳依方向排序的格子編號 */
export function runThrough(
  board: readonly Stone[],
  size: number,
  x: number,
  y: number,
  dx: number,
  dy: number,
): number[] {
  const color = at(board, size, x, y)
  if (color !== 1 && color !== 2) return []
  let sx = x
  let sy = y
  while (at(board, size, sx - dx, sy - dy) === color) {
    sx -= dx
    sy -= dy
  }
  const cells: number[] = []
  while (at(board, size, sx, sy) === color) {
    cells.push(sy * size + sx)
    sx += dx
    sy += dy
  }
  return cells
}

/** 這條線上，黑棋再下哪些空格會剛好成五（且連線包含 (x,y)） */
function fivePoints(board: Stone[], size: number, x: number, y: number, dx: number, dy: number): number[] {
  const points: number[] = []
  const origin = y * size + x
  for (let k = -4; k <= 4; k++) {
    if (k === 0) continue
    const cx = x + dx * k
    const cy = y + dy * k
    if (at(board, size, cx, cy) !== 0) continue
    const ci = cy * size + cx
    board[ci] = 1
    const run = runThrough(board, size, cx, cy, dx, dy)
    board[ci] = 0
    if (run.length === 5 && run.includes(origin)) points.push(ci)
  }
  return points
}

/** 這條線上有幾個「四」（再一手就成五） */
function countFours(board: Stone[], size: number, x: number, y: number, dx: number, dy: number): number {
  const points = fivePoints(board, size, x, y, dx, dy)
  if (points.length <= 1) return points.length
  // 兩個成五點：若是同一組連四的兩端（活四）只算一個四，否則是同線雙四
  const run = runThrough(board, size, x, y, dx, dy)
  return run.length === 4 ? 1 : 2
}

/** 這條線是否為「活三」（再一手可成活四） */
function isOpenThree(board: Stone[], size: number, x: number, y: number, dx: number, dy: number): boolean {
  const origin = y * size + x
  for (let k = -3; k <= 3; k++) {
    if (k === 0) continue
    const cx = x + dx * k
    const cy = y + dy * k
    if (at(board, size, cx, cy) !== 0) continue
    const ci = cy * size + cx
    board[ci] = 1
    const run = runThrough(board, size, cx, cy, dx, dy)
    let open = false
    if (run.length === 4 && run.includes(origin)) {
      open = fivePoints(board, size, cx, cy, dx, dy).length === 2
    }
    board[ci] = 0
    if (open) return true
  }
  return false
}

/**
 * 檢查黑棋下在 index 是否為禁手。回傳禁手種類，沒有則回傳 null。
 * 剛好成五永遠不算禁手。這是常見的簡化判定（不遞迴檢查「假禁手」）。
 */
export function forbiddenKind(boardIn: readonly Stone[], size: number, index: number): ForbiddenKind | null {
  if (boardIn[index] !== 0) return null
  const board = boardIn.slice()
  board[index] = 1
  const [x, y] = toXY(index, size)
  let overline = false
  let fours = 0
  let threes = 0
  for (const [dx, dy] of DIRECTIONS) {
    const len = runThrough(board, size, x, y, dx, dy).length
    if (len === 5) return null
    if (len > 5) {
      overline = true
      continue
    }
    const f = countFours(board, size, x, y, dx, dy)
    fours += f
    if (f === 0 && isOpenThree(board, size, x, y, dx, dy)) threes++
  }
  if (overline) return 'overline'
  if (fours >= 2) return 'doubleFour'
  if (threes >= 2) return 'doubleThree'
  return null
}

/** 目前輪到的玩家能不能下在這格 */
export function canPlace(state: GomokuState, index: number): PlaceError | null {
  if (state.winner !== 0) return 'finished'
  if (!Number.isInteger(index) || index < 0 || index >= state.board.length) return 'out'
  if (state.board[index] !== 0) return 'occupied'
  if (state.options.forbidden && state.turn === 1 && forbiddenKind(state.board, state.size, index)) {
    return 'forbidden'
  }
  return null
}

/** 落子：(state, index) → newState */
export function placeStone(state: GomokuState, index: number): Result<GomokuState, PlaceError> {
  const error = canPlace(state, index)
  if (error) return { ok: false, reason: error }

  const board = state.board.slice()
  const player = state.turn
  board[index] = player
  const [x, y] = toXY(index, state.size)

  let winLine: number[] = []
  for (const [dx, dy] of DIRECTIONS) {
    const run = runThrough(board, state.size, x, y, dx, dy)
    if (run.length === 5 || (run.length > 5 && state.options.overlineWins)) {
      winLine = run
      break
    }
  }

  const moves = [...state.moves, index]
  let winner: GomokuState['winner'] = 0
  if (winLine.length) winner = player
  else if (moves.length === board.length) winner = 3

  return {
    ok: true,
    state: {
      ...state,
      board,
      moves,
      winner,
      winLine,
      turn: winner === 0 ? (player === 1 ? 2 : 1) : player,
    },
  }
}
