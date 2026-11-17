// 西洋跳棋（英式／美式，English draughts）：8 × 8 棋盤，只用深色格，每人 12 顆。
// 規則（跟使用者確認過）：
//   - 一般子只能往前斜走一格；吃子是斜著跳過緊鄰的對方棋子、落在後面的空格，也只能往前吃。
//   - 走到對面底線就升王；王前後四個斜方向都能走一格、都能吃（不是飛王）。
//   - 能吃就一定要吃（規則設定「強制吃子」，預設開；關掉時可以選擇不吃）。吃的時候可以選任一條，不一定要吃最多。
//   - 連吃：跳完如果還能再跳就要跳到底（同一步）；一般子在連吃途中到了底線，升王後這一步就結束。
//   - 被吃的子整步跳完才拿掉（同一步不能跳過同一顆兩次）。
//   - 輪到的人沒有棋可以走（被吃光或被堵死）就輸；連續 80 步（雙方各 40 步）沒人吃子、也沒有一般子往前走，和棋。
// 座位：0 號先走，從下面（第 5～7 排）往上走；1 號從上面（第 0～2 排）往下走。純函式，不碰畫面。
import type { Result } from '../common/types'

export const SIZE = 8
/** 0 空格；1 先手一般子、2 先手王；3 後手一般子、4 後手王 */
export type Cell = 0 | 1 | 2 | 3 | 4
export type Side = 0 | 1

export interface CheckersOptions {
  /** 能吃就一定要吃 */
  forceCapture: boolean
}
export const DEFAULT_CHECKERS_OPTIONS: CheckersOptions = { forceCapture: true }

/** 連續幾步（雙方合計）沒人吃子、也沒有一般子往前走就和棋 */
export const DRAW_QUIET = 80

export type CheckersStatus = 'playing' | 'nomoves' | 'quiet' | 'resigned'

export interface CheckersMove {
  /** 起點、每一次落點（一般走一格就是兩格；連吃有好幾個落點） */
  path: number[]
  /** 這一步吃掉的子（照吃的順序） */
  captured: number[]
}

export interface CheckersState {
  board: Cell[]
  turn: Side
  status: CheckersStatus
  winner: Side | null
  plies: number
  /** 連續幾步沒人吃子、也沒有一般子往前走 */
  quiet: number
  last: (CheckersMove & { crowned: boolean }) | null
  options: CheckersOptions
}

export type CheckersAction = { type: 'move'; path: number[] } | { type: 'timeout' } | { type: 'resign'; side: Side }
export type CheckersError = 'over' | 'illegal' | 'mustCapture'

export const rowOf = (i: number) => Math.floor(i / SIZE)
export const colOf = (i: number) => i % SIZE
export const isDark = (i: number) => (rowOf(i) + colOf(i)) % 2 === 1
export const ownerOf = (c: Cell): Side | -1 => (c === 0 ? -1 : c <= 2 ? 0 : 1)
export const isKing = (c: Cell) => c === 2 || c === 4
const other = (s: Side): Side => (s === 0 ? 1 : 0)
/** 這一方的一般子往哪個方向走（列的變化） */
const forward = (s: Side) => (s === 0 ? -1 : 1)
/** 升王的那一排 */
export const crownRow = (s: Side) => (s === 0 ? 0 : SIZE - 1)

export function createCheckers(options: Partial<CheckersOptions> = {}): CheckersState {
  const board = Array<Cell>(SIZE * SIZE).fill(0)
  for (let i = 0; i < board.length; i++) {
    if (!isDark(i)) continue
    if (rowOf(i) <= 2) board[i] = 3
    else if (rowOf(i) >= 5) board[i] = 1
  }
  return { board, turn: 0, status: 'playing', winner: null, plies: 0, quiet: 0, last: null, options: { ...DEFAULT_CHECKERS_OPTIONS, ...options } }
}

/** 照擺好的盤面開局（教學、測試用）；rows：8 行，. 空、x 先手子、X 先手王、o 後手子、O 後手王 */
export function fromRows(rows: string[], turn: Side = 0, options: Partial<CheckersOptions> = {}): CheckersState {
  const map: Record<string, Cell> = { x: 1, X: 2, o: 3, O: 4 }
  const board = rows.join('').split('').map((ch) => map[ch] ?? 0) as Cell[]
  return { ...createCheckers(options), board, turn }
}

function dirsOf(c: Cell): [number, number][] {
  if (isKing(c)) return [[-1, -1], [-1, 1], [1, -1], [1, 1]]
  const f = forward(ownerOf(c) as Side)
  return [[f, -1], [f, 1]]
}
const at = (r: number, c: number) => (r >= 0 && c >= 0 && r < SIZE && c < SIZE ? r * SIZE + c : -1)

/** 從 from 出發的所有吃子路線（連吃要跳到底） */
function captures(board: readonly Cell[], from: number): CheckersMove[] {
  const piece = board[from]
  const me = ownerOf(piece)
  const out: CheckersMove[] = []
  const walk = (pos: number, path: number[], taken: number[], cell: Cell) => {
    let more = false
    // 一般子剛升王：這一步結束
    const crowned = !isKing(piece) && rowOf(pos) === crownRow(me as Side) && path.length > 1
    if (!crowned) {
      for (const [dr, dc] of dirsOf(cell)) {
        const mid = at(rowOf(pos) + dr, colOf(pos) + dc)
        const land = at(rowOf(pos) + dr * 2, colOf(pos) + dc * 2)
        if (mid < 0 || land < 0) continue
        const victim = board[mid]
        if (victim === 0 || ownerOf(victim) === me || taken.includes(mid)) continue
        // 落點要是空的（起點那格已經空了）
        if (land !== from && board[land] !== 0) continue
        more = true
        walk(land, [...path, land], [...taken, mid], cell)
      }
    }
    if (!more && taken.length) out.push({ path, captured: taken })
  }
  walk(from, [from], [], piece)
  return out
}

/** 輪到的人所有合法的步（強制吃子時，能吃就只剩吃子的步） */
export function legalMoves(s: CheckersState): CheckersMove[] {
  if (s.status !== 'playing') return []
  const caps: CheckersMove[] = []
  const steps: CheckersMove[] = []
  for (let i = 0; i < s.board.length; i++) {
    const c = s.board[i]
    if (ownerOf(c) !== s.turn) continue
    caps.push(...captures(s.board, i))
    for (const [dr, dc] of dirsOf(c)) {
      const to = at(rowOf(i) + dr, colOf(i) + dc)
      if (to >= 0 && s.board[to] === 0) steps.push({ path: [i, to], captured: [] })
    }
  }
  if (caps.length && s.options.forceCapture) return caps
  return [...caps, ...steps]
}

const samePath = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((v, i) => v === b[i])

/** 走完一步後：換人、看有沒有結束 */
function settle(s: CheckersState): CheckersState {
  if (!legalMoves(s).length) return { ...s, status: 'nomoves', winner: other(s.turn) }
  if (s.quiet >= DRAW_QUIET) return { ...s, status: 'quiet', winner: null }
  return s
}

export function applyCheckers(s: CheckersState, a: CheckersAction): Result<CheckersState, CheckersError> {
  if (s.status !== 'playing') return { ok: false, reason: 'over' }
  if (a.type === 'resign') return { ok: true, state: { ...s, status: 'resigned', winner: other(a.side) } }
  if (a.type === 'timeout') return { ok: true, state: settle({ ...s, turn: other(s.turn), plies: s.plies + 1, quiet: s.quiet + 1, last: null }) }
  const legal = legalMoves(s)
  const move = legal.find((m) => samePath(m.path, a.path))
  if (!move) {
    // 強制吃子：有子可吃卻走了一般的一步
    const any = legal.some((m) => m.captured.length)
    return { ok: false, reason: any && s.options.forceCapture ? 'mustCapture' : 'illegal' }
  }
  const board = s.board.slice()
  const from = move.path[0]
  const to = move.path[move.path.length - 1]
  let piece = board[from]
  board[from] = 0
  for (const c of move.captured) board[c] = 0
  const man = !isKing(piece)
  const crowned = man && rowOf(to) === crownRow(s.turn)
  if (crowned) piece = s.turn === 0 ? 2 : 4
  board[to] = piece
  // 吃子、一般子往前走：重新算和棋
  const quiet = move.captured.length || man ? 0 : s.quiet + 1
  return { ok: true, state: settle({ ...s, board, turn: other(s.turn), plies: s.plies + 1, quiet, last: { ...move, crowned } }) }
}

/** 每一方還有幾顆子（一般子、王） */
export function countPieces(s: CheckersState, side: Side): { men: number; kings: number } {
  let men = 0
  let kings = 0
  for (const c of s.board) if (ownerOf(c) === side) isKing(c) ? kings++ : men++
  return { men, kings }
}
