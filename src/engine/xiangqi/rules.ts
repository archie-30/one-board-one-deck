// 象棋規則引擎。純函式，狀態可序列化成 JSON。
//   棋盤：9 路 × 10 行，index = row * 9 + col；row 0 在上（黑方），row 9 在下（紅方）。
//   棋子：大寫紅、小寫黑；K 帥／將、A 仕／士、B 相／象、N 傌／馬、R 俥／車、C 炮／包、P 兵／卒；'' 空格。
//   規則：蹩馬腿、塞象眼、相（象）不過河、仕（士）與帥（將）不出九宮、炮隔一子吃、兵（卒）過河才能橫走、
//         王不見王（兩邊的將帥不能在同一條直線上中間沒有子）。
//   結束：被將死或困斃（輪到自己卻沒有合法的步）都算輸；認輸。
//   重複局面（簡化版禁長將）：一直將軍造成同一局面第三次出現時，將軍的一方必須換別步；
//   其他情況同一局面第三次出現就和棋。60 回合（120 步）都沒有吃子也算和棋。
import type { Result } from '@/engine/common/types'

export type Side = 'r' | 'b'
export type XType = 'K' | 'A' | 'B' | 'N' | 'R' | 'C' | 'P'

export interface XMove {
  from: number
  to: number
}

export type XStatus = 'playing' | 'checkmate' | 'stalemate' | 'repetition' | 'limit' | 'resigned'

export interface XiangqiState {
  board: string[]
  turn: Side
  history: string[]
  /** 每一步是不是將軍（和 history 對齊）：判斷「一直將軍」用 */
  checks: boolean[]
  /** 沒有吃子的步數 */
  quiet: number
  status: XStatus
  winner: Side | null
  lastMove: XMove | null
  captured: string[]
  plies: number
}

export type XAction = { type: 'move'; move: XMove } | { type: 'resign'; side: Side }
export type XError = 'over' | 'illegal' | 'notYourTurn' | 'perpetualCheck'

export const COLS = 9
export const ROWS = 10
export const START = 'rnbakabnr' + '.........' + '.c.....c.' + 'p.p.p.p.p' + '.........' + '.........' + 'P.P.P.P.P' + '.C.....C.' + '.........' + 'RNBAKABNR'
/** 沒吃子幾步就和棋 */
export const QUIET_LIMIT = 120

export const sideOf = (p: string): Side | null => (!p ? null : p === p.toUpperCase() ? 'r' : 'b')
export const typeOf = (p: string): XType => p.toUpperCase() as XType
export const other = (s: Side): Side => (s === 'r' ? 'b' : 'r')
export const rowOf = (i: number) => Math.floor(i / COLS)
export const colOf = (i: number) => i % COLS
export const sq = (row: number, col: number) => row * COLS + col
const inside = (r: number, c: number) => r >= 0 && r < ROWS && c >= 0 && c < COLS
const inPalace = (side: Side, r: number, c: number) => c >= 3 && c <= 5 && (side === 'r' ? r >= 7 && r <= 9 : r >= 0 && r <= 2)
/** 有沒有過河 */
const crossed = (side: Side, r: number) => (side === 'r' ? r <= 4 : r >= 5)

const key = (s: Pick<XiangqiState, 'board' | 'turn'>) => s.board.map((p) => p || '.').join('') + s.turn

/** 從棋盤字串建立局面（90 個字元，'.' 是空格；測試、教學用） */
export function fromBoard(layout: string, turn: Side = 'r'): XiangqiState {
  const board = layout.split('').map((ch) => (ch === '.' ? '' : ch))
  const s: XiangqiState = { board, turn, history: [], checks: [], quiet: 0, status: 'playing', winner: null, lastMove: null, captured: [], plies: 0 }
  s.history = [key(s)]
  s.checks = [false]
  return s
}

export const createXiangqi = () => fromBoard(START, 'r')

const ORTHO = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
]
const DIAG = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
]

/** 不管自己會不會被將，先列出某一方所有的走法 */
function pseudoMoves(board: readonly string[], me: Side): XMove[] {
  const out: XMove[] = []
  const can = (to: number) => !board[to] || sideOf(board[to]) !== me
  for (let i = 0; i < board.length; i++) {
    const p = board[i]
    if (!p || sideOf(p) !== me) continue
    const r = rowOf(i)
    const c = colOf(i)
    switch (typeOf(p)) {
      case 'K':
        for (const [dr, dc] of ORTHO) if (inPalace(me, r + dr, c + dc) && can(sq(r + dr, c + dc))) out.push({ from: i, to: sq(r + dr, c + dc) })
        break
      case 'A':
        for (const [dr, dc] of DIAG) if (inPalace(me, r + dr, c + dc) && can(sq(r + dr, c + dc))) out.push({ from: i, to: sq(r + dr, c + dc) })
        break
      case 'B':
        for (const [dr, dc] of DIAG) {
          const rr = r + 2 * dr
          const cc = c + 2 * dc
          if (!inside(rr, cc) || crossed(me, rr)) continue
          if (board[sq(r + dr, c + dc)]) continue // 塞象眼
          if (can(sq(rr, cc))) out.push({ from: i, to: sq(rr, cc) })
        }
        break
      case 'N':
        for (const [dr, dc] of ORTHO) {
          if (!inside(r + dr, c + dc) || board[sq(r + dr, c + dc)]) continue // 蹩馬腿
          for (const side of [-1, 1]) {
            const rr = r + 2 * dr + (dr === 0 ? side : 0)
            const cc = c + 2 * dc + (dc === 0 ? side : 0)
            if (inside(rr, cc) && can(sq(rr, cc))) out.push({ from: i, to: sq(rr, cc) })
          }
        }
        break
      case 'R':
      case 'C': {
        const cannon = typeOf(p) === 'C'
        for (const [dr, dc] of ORTHO) {
          let rr = r + dr
          let cc = c + dc
          let jumped = false
          while (inside(rr, cc)) {
            const to = sq(rr, cc)
            if (!jumped) {
              if (!board[to]) out.push({ from: i, to })
              else {
                if (!cannon) {
                  if (sideOf(board[to]) !== me) out.push({ from: i, to })
                  break
                }
                jumped = true // 炮架
              }
            } else if (board[to]) {
              if (sideOf(board[to]) !== me) out.push({ from: i, to })
              break
            }
            rr += dr
            cc += dc
          }
        }
        break
      }
      case 'P': {
        const dr = me === 'r' ? -1 : 1
        if (inside(r + dr, c) && can(sq(r + dr, c))) out.push({ from: i, to: sq(r + dr, c) })
        if (crossed(me, r)) for (const dc of [-1, 1]) if (inside(r, c + dc) && can(sq(r, c + dc))) out.push({ from: i, to: sq(r, c + dc) })
        break
      }
    }
  }
  return out
}

/** side 的將帥有沒有被將（包括兩邊將帥照面）。從將帥的位置往外找攻擊者，比列出對方所有步快很多 */
export function inCheck(board: readonly string[], side: Side): boolean {
  const king = board.indexOf(side === 'r' ? 'K' : 'k')
  if (king < 0) return true
  const r = rowOf(king)
  const c = colOf(king)
  const enemy = other(side)
  const is = (i: number, t: XType) => board[i] !== '' && sideOf(board[i]) === enemy && typeOf(board[i]) === t
  // 直線：第一個碰到的是車（或對面的將帥＝照面）；隔一個子碰到的是炮
  for (const [dr, dc] of ORTHO) {
    let rr = r + dr
    let cc = c + dc
    let screens = 0
    while (inside(rr, cc)) {
      const i = sq(rr, cc)
      if (board[i]) {
        if (screens === 0 && (is(i, 'R') || (dc === 0 && is(i, 'K')))) return true
        if (screens === 1) {
          if (is(i, 'C')) return true
          break
        }
        screens++
      }
      rr += dr
      cc += dc
    }
  }
  // 馬：馬腿是「馬那一邊、往將帥方向走一格」的位置
  for (const [a, b] of [
    [2, 1],
    [2, -1],
    [-2, 1],
    [-2, -1],
    [1, 2],
    [1, -2],
    [-1, 2],
    [-1, -2],
  ]) {
    const hr = r - a
    const hc = c - b
    if (!inside(hr, hc) || !is(sq(hr, hc), 'N')) continue
    const leg = Math.abs(a) === 2 ? sq(hr + Math.sign(a), hc) : sq(hr, hc + Math.sign(b))
    if (!board[leg]) return true
  }
  // 兵（卒）：從對方那邊往前一格，或過河後從旁邊
  const fwd = enemy === 'r' ? 1 : -1
  if (inside(r + fwd, c) && is(sq(r + fwd, c), 'P')) return true
  for (const dc of [-1, 1]) if (inside(r, c + dc) && is(sq(r, c + dc), 'P') && crossed(enemy, r)) return true
  return false
}

export function makeMove(s: XiangqiState, m: XMove): XiangqiState {
  const board = s.board.slice()
  const captured = board[m.to]
  board[m.to] = board[m.from]
  board[m.from] = ''
  return { ...s, board, turn: other(s.turn), lastMove: { ...m }, captured: captured ? [...s.captured, captured] : s.captured, quiet: captured ? 0 : s.quiet + 1, plies: s.plies + 1 }
}

/** 不考慮重複局面的合法步（走完自己不能被將、不能王見王）；電腦往後算時用這個，比較快 */
export function basicLegal(s: XiangqiState): XMove[] {
  return pseudoMoves(s.board, s.turn).filter((m) => !inCheck(makeMove(s, m).board, s.turn))
}

/** 這步是不是「一直將軍」造成第三次重複，要禁止 */
function perpetual(s: XiangqiState, m: XMove): boolean {
  const next = makeMove(s, m)
  if (!inCheck(next.board, next.turn)) return false
  const k = key(next)
  return s.history.filter((h) => h === k).length >= 2
}

/** 所有合法的步 */
export function legalMoves(s: XiangqiState): XMove[] {
  if (s.status !== 'playing') return []
  return basicLegal(s).filter((m) => !perpetual(s, m))
}

export const targetsFrom = (s: XiangqiState, from: number): number[] => legalMoves(s).filter((m) => m.from === from).map((m) => m.to)

export function applyXiangqi(state: XiangqiState, action: XAction): Result<XiangqiState, XError> {
  if (state.status !== 'playing') return { ok: false, reason: 'over' }
  if (action.type === 'resign') return { ok: true, state: { ...state, status: 'resigned', winner: other(action.side) } }
  const m = action.move
  const p = state.board[m.from]
  if (!p) return { ok: false, reason: 'illegal' }
  if (sideOf(p) !== state.turn) return { ok: false, reason: 'notYourTurn' }
  if (!basicLegal(state).some((x) => x.from === m.from && x.to === m.to)) return { ok: false, reason: 'illegal' }
  if (perpetual(state, m)) return { ok: false, reason: 'perpetualCheck' }
  const s = makeMove(state, m)
  const k = key(s)
  const check = inCheck(s.board, s.turn)
  s.history = [...state.history, k]
  s.checks = [...state.checks, check]
  if (!legalMoves(s).length) {
    // 被將死或困斃：沒步可走的一方輸
    s.status = check ? 'checkmate' : 'stalemate'
    s.winner = other(s.turn)
  } else if (s.history.filter((h) => h === k).length >= 3) s.status = 'repetition'
  else if (s.quiet >= QUIET_LIMIT) s.status = 'limit'
  return { ok: true, state: s }
}

/** 測試用：從局面往下數 depth 層的所有走法數 */
export function perft(s: XiangqiState, depth: number): number {
  if (depth === 0) return 1
  let n = 0
  for (const m of pseudoMoves(s.board, s.turn)) {
    const next = makeMove(s, m)
    if (inCheck(next.board, s.turn)) continue
    n += depth === 1 ? 1 : perft(next, depth - 1)
  }
  return n
}
