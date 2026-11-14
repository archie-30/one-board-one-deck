// 西洋棋規則引擎。純函式，狀態可序列化成 JSON。
//   棋盤：64 格，index 0 = a8（左上，黑方那邊），63 = h1（右下，白方那邊）；row = index / 8（0 在上）。
//   棋子：大寫白、小寫黑；P 兵、N 馬、B 象、R 車、Q 后、K 王；'' 空格。
//   正式規則：王車易位、吃過路兵、兵升變（自己選后、車、象、馬）。
//   結束：將死、逼和、同一局面第三次出現、50 回合（100 步）沒吃子也沒動兵、雙方子力都不夠將死、認輸。
import type { Result } from '@/engine/common/types'

export type Color = 'w' | 'b'
export type PieceType = 'P' | 'N' | 'B' | 'R' | 'Q' | 'K'
export type Promo = 'Q' | 'R' | 'B' | 'N'

export interface Move {
  from: number
  to: number
  promo?: Promo
}

export type ChessStatus = 'playing' | 'checkmate' | 'stalemate' | 'repetition' | 'fifty' | 'material' | 'resigned'

export interface ChessState {
  board: string[]
  turn: Color
  castling: { wK: boolean; wQ: boolean; bK: boolean; bQ: boolean }
  /** 可以吃過路兵的那一格（剛走兩步的兵越過的格子），沒有就是 -1 */
  ep: number
  /** 沒吃子也沒動兵的步數（100 步 = 50 回合就和棋） */
  halfmove: number
  /** 每一步之後的局面代碼（判斷同一局面出現幾次） */
  history: string[]
  status: ChessStatus
  winner: Color | null
  lastMove: Move | null
  /** 被吃掉的棋子（照被吃的順序） */
  captured: string[]
  /** 已經走了幾步（雙方各算一步） */
  plies: number
}

export type ChessAction = { type: 'move'; move: Move } | { type: 'resign'; color: Color }
export type ChessError = 'over' | 'illegal' | 'needPromotion' | 'notYourTurn'

export const START = 'rnbqkbnrpppppppp' + '.'.repeat(32) + 'PPPPPPPPRNBQKBNR'

export const colorOf = (p: string): Color | null => (!p ? null : p === p.toUpperCase() ? 'w' : 'b')
export const typeOf = (p: string): PieceType => p.toUpperCase() as PieceType
export const other = (c: Color): Color => (c === 'w' ? 'b' : 'w')
export const rowOf = (i: number) => i >> 3
export const colOf = (i: number) => i & 7
export const sq = (row: number, col: number) => row * 8 + col
/** 'e4' → 格子編號 */
export function at(name: string): number {
  const col = name.charCodeAt(0) - 97
  const rank = Number(name.slice(1))
  return sq(8 - rank, col)
}
export const squareName = (i: number) => String.fromCharCode(97 + colOf(i)) + (8 - rowOf(i))

function key(s: Pick<ChessState, 'board' | 'turn' | 'castling' | 'ep'>): string {
  const c = s.castling
  return s.board.map((p) => p || '.').join('') + s.turn + (c.wK ? 'K' : '') + (c.wQ ? 'Q' : '') + (c.bK ? 'k' : '') + (c.bQ ? 'q' : '') + s.ep
}

/** 從棋盤字串建立局面（測試、教學用）：64 個字元，'.' 是空格 */
export function fromBoard(layout: string, turn: Color = 'w', castling = { wK: false, wQ: false, bK: false, bQ: false }, ep = -1): ChessState {
  const board = layout.split('').map((ch) => (ch === '.' ? '' : ch))
  const s: ChessState = { board, turn, castling, ep, halfmove: 0, history: [], status: 'playing', winner: null, lastMove: null, captured: [], plies: 0 }
  s.history = [key(s)]
  return s
}

export function createChess(): ChessState {
  return fromBoard(START, 'w', { wK: true, wQ: true, bK: true, bQ: true })
}

const KNIGHT = [
  [-2, -1],
  [-2, 1],
  [-1, -2],
  [-1, 2],
  [1, -2],
  [1, 2],
  [2, -1],
  [2, 1],
]
const KING = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
]
const ROOK_DIRS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
]
const BISHOP_DIRS = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
]
const inside = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8

/** 某一格有沒有被 by 方攻擊 */
export function attacked(board: readonly string[], target: number, by: Color): boolean {
  const r = rowOf(target)
  const c = colOf(target)
  const own = (p: string, t: PieceType) => p !== '' && colorOf(p) === by && typeOf(p) === t
  // 兵：白兵往上攻擊，所以從目標往下看
  const pr = by === 'w' ? r + 1 : r - 1
  for (const dc of [-1, 1]) if (inside(pr, c + dc) && own(board[sq(pr, c + dc)], 'P')) return true
  for (const [dr, dc] of KNIGHT) if (inside(r + dr, c + dc) && own(board[sq(r + dr, c + dc)], 'N')) return true
  for (const [dr, dc] of KING) if (inside(r + dr, c + dc) && own(board[sq(r + dr, c + dc)], 'K')) return true
  for (const [dirs, types] of [
    [ROOK_DIRS, ['R', 'Q']],
    [BISHOP_DIRS, ['B', 'Q']],
  ] as const) {
    for (const [dr, dc] of dirs) {
      let rr = r + dr
      let cc = c + dc
      while (inside(rr, cc)) {
        const p = board[sq(rr, cc)]
        if (p) {
          if (colorOf(p) === by && (types as readonly string[]).includes(typeOf(p))) return true
          break
        }
        rr += dr
        cc += dc
      }
    }
  }
  return false
}

export const kingSquare = (board: readonly string[], c: Color) => board.indexOf(c === 'w' ? 'K' : 'k')
export const inCheck = (s: Pick<ChessState, 'board'>, c: Color) => attacked(s.board, kingSquare(s.board, c), other(c))

/** 不管自己王會不會被將，先列出所有走法 */
function pseudoMoves(s: ChessState): Move[] {
  const out: Move[] = []
  const me = s.turn
  const b = s.board
  const push = (from: number, to: number) => {
    const p = b[from]
    if (typeOf(p) === 'P' && (rowOf(to) === 0 || rowOf(to) === 7)) for (const promo of ['Q', 'R', 'B', 'N'] as Promo[]) out.push({ from, to, promo })
    else out.push({ from, to })
  }
  for (let i = 0; i < 64; i++) {
    const p = b[i]
    if (!p || colorOf(p) !== me) continue
    const r = rowOf(i)
    const c = colOf(i)
    const t = typeOf(p)
    if (t === 'P') {
      const dir = me === 'w' ? -1 : 1
      const start = me === 'w' ? 6 : 1
      if (inside(r + dir, c) && !b[sq(r + dir, c)]) {
        push(i, sq(r + dir, c))
        if (r === start && !b[sq(r + 2 * dir, c)]) out.push({ from: i, to: sq(r + 2 * dir, c) })
      }
      for (const dc of [-1, 1]) {
        if (!inside(r + dir, c + dc)) continue
        const to = sq(r + dir, c + dc)
        if ((b[to] && colorOf(b[to]) !== me) || to === s.ep) push(i, to)
      }
    } else if (t === 'N' || t === 'K') {
      for (const [dr, dc] of t === 'N' ? KNIGHT : KING) {
        if (!inside(r + dr, c + dc)) continue
        const to = sq(r + dr, c + dc)
        if (!b[to] || colorOf(b[to]) !== me) out.push({ from: i, to })
      }
      // 王車易位：王、車都沒動過，中間沒有子，王現在、經過、到達的格子都沒被攻擊
      if (t === 'K') {
        const home = me === 'w' ? 60 : 4
        if (i === home && !attacked(b, i, other(me))) {
          const rights = me === 'w' ? [s.castling.wK, s.castling.wQ] : [s.castling.bK, s.castling.bQ]
          const rook = me === 'w' ? 'R' : 'r'
          if (rights[0] && b[i + 3] === rook && !b[i + 1] && !b[i + 2] && !attacked(b, i + 1, other(me)) && !attacked(b, i + 2, other(me))) out.push({ from: i, to: i + 2 })
          if (rights[1] && b[i - 4] === rook && !b[i - 1] && !b[i - 2] && !b[i - 3] && !attacked(b, i - 1, other(me)) && !attacked(b, i - 2, other(me)))
            out.push({ from: i, to: i - 2 })
        }
      }
    } else {
      const dirs = t === 'R' ? ROOK_DIRS : t === 'B' ? BISHOP_DIRS : [...ROOK_DIRS, ...BISHOP_DIRS]
      for (const [dr, dc] of dirs) {
        let rr = r + dr
        let cc = c + dc
        while (inside(rr, cc)) {
          const to = sq(rr, cc)
          if (b[to]) {
            if (colorOf(b[to]) !== me) out.push({ from: i, to })
            break
          }
          out.push({ from: i, to })
          rr += dr
          cc += dc
        }
      }
    }
  }
  return out
}

/** 只動棋盤（不檢查合不合法、不判斷結束）；回傳新局面與被吃的子 */
export function makeMove(s: ChessState, m: Move): { state: ChessState; captured: string } {
  const b = s.board.slice()
  const p = b[m.from]
  const me = colorOf(p)!
  const t = typeOf(p)
  let captured = b[m.to]
  // 吃過路兵
  if (t === 'P' && m.to === s.ep && !captured) {
    const victim = m.to + (me === 'w' ? 8 : -8)
    captured = b[victim]
    b[victim] = ''
  }
  b[m.to] = m.promo ? (me === 'w' ? m.promo : m.promo.toLowerCase()) : p
  b[m.from] = ''
  // 王車易位：車跟著跳過去
  if (t === 'K' && Math.abs(m.to - m.from) === 2) {
    if (m.to > m.from) {
      b[m.from + 1] = b[m.from + 3]
      b[m.from + 3] = ''
    } else {
      b[m.from - 1] = b[m.from - 4]
      b[m.from - 4] = ''
    }
  }
  const castling = { ...s.castling }
  if (t === 'K') {
    if (me === 'w') castling.wK = castling.wQ = false
    else castling.bK = castling.bQ = false
  }
  for (const corner of [m.from, m.to]) {
    if (corner === 63) castling.wK = false
    if (corner === 56) castling.wQ = false
    if (corner === 7) castling.bK = false
    if (corner === 0) castling.bQ = false
  }
  const ep = t === 'P' && Math.abs(m.to - m.from) === 16 ? (m.from + m.to) / 2 : -1
  const state: ChessState = {
    ...s,
    board: b,
    turn: other(me),
    castling,
    ep,
    halfmove: t === 'P' || captured ? 0 : s.halfmove + 1,
    lastMove: { ...m },
    captured: captured ? [...s.captured, captured] : s.captured,
    plies: s.plies + 1,
  }
  return { state, captured }
}

/** 所有合法的走法 */
export function legalMoves(s: ChessState): Move[] {
  if (s.status !== 'playing') return []
  return pseudoMoves(s).filter((m) => !inCheck(makeMove(s, m).state, s.turn))
}

/** 某一格的棋子能走到哪些格子 */
export const targetsFrom = (s: ChessState, from: number): number[] => [...new Set(legalMoves(s).filter((m) => m.from === from).map((m) => m.to))]

/** 這一步會不會升變（要讓玩家選升成什麼） */
export const isPromotion = (s: ChessState, from: number, to: number) => typeOf(s.board[from] || 'x') === 'P' && (rowOf(to) === 0 || rowOf(to) === 7)

/** 雙方子力都不夠將死：王對王、王＋一隻輕子對王、雙方只剩同色格的象 */
export function insufficientMaterial(board: readonly string[]): boolean {
  const rest = board.map((p, i) => ({ p, i })).filter(({ p }) => p && typeOf(p) !== 'K')
  if (rest.length === 0) return true
  if (rest.some(({ p }) => ['P', 'R', 'Q'].includes(typeOf(p)))) return false
  if (rest.length === 1) return true
  // 只剩象：全部在同一種顏色的格子上
  if (rest.every(({ p }) => typeOf(p) === 'B')) {
    const shade = (i: number) => (rowOf(i) + colOf(i)) % 2
    return rest.every(({ i }) => shade(i) === shade(rest[0].i))
  }
  return false
}

export function applyChess(state: ChessState, action: ChessAction): Result<ChessState, ChessError> {
  if (state.status !== 'playing') return { ok: false, reason: 'over' }
  if (action.type === 'resign') return { ok: true, state: { ...state, status: 'resigned', winner: other(action.color) } }
  const m = action.move
  const p = state.board[m.from]
  if (!p || colorOf(p) !== state.turn) return { ok: false, reason: p ? 'notYourTurn' : 'illegal' }
  if (isPromotion(state, m.from, m.to) && !m.promo) {
    return legalMoves(state).some((x) => x.from === m.from && x.to === m.to) ? { ok: false, reason: 'needPromotion' } : { ok: false, reason: 'illegal' }
  }
  const legal = legalMoves(state).find((x) => x.from === m.from && x.to === m.to && (x.promo ?? null) === (m.promo ?? null))
  if (!legal) return { ok: false, reason: 'illegal' }
  const s = makeMove(state, legal).state
  const k = key(s)
  s.history = [...state.history, k]
  // 結束判斷
  const replies = legalMoves(s)
  if (!replies.length) {
    if (inCheck(s, s.turn)) {
      s.status = 'checkmate'
      s.winner = other(s.turn)
    } else s.status = 'stalemate'
  } else if (insufficientMaterial(s.board)) s.status = 'material'
  else if (s.history.filter((h) => h === k).length >= 3) s.status = 'repetition'
  else if (s.halfmove >= 100) s.status = 'fifty'
  return { ok: true, state: s }
}

/** 測試用：從局面往下數 depth 層的所有走法數（用來核對走法產生是否正確） */
export function perft(s: ChessState, depth: number): number {
  if (depth === 0) return 1
  let n = 0
  for (const m of pseudoMoves(s)) {
    const next = makeMove(s, m).state
    if (inCheck(next, s.turn)) continue
    n += depth === 1 ? 1 : perft(next, depth - 1)
  }
  return n
}
