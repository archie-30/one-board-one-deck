// 西洋棋、象棋共用對局畫面的「轉接頭」：把兩種棋的引擎包成同一組函式，畫面只認這組函式。
import type { ChessStyle } from '@/engine/common/personas'
import type { RngState } from '@/engine/common/rng'
import { chooseChessMove } from '@/engine/chess/ai'
import { applyChess, createChess, inCheck as chessInCheck, isPromotion, kingSquare, targetsFrom as chessTargets, type ChessState, type Move, type Promo } from '@/engine/chess/rules'
import { chooseXiangqiMove } from '@/engine/xiangqi/ai'
import { applyXiangqi, createXiangqi, inCheck as xqInCheck, targetsFrom as xqTargets, type XiangqiState } from '@/engine/xiangqi/rules'

/** 0 = 先走的一方（白／紅），1 = 後走的一方（黑） */
export type Seat = 0 | 1

export interface ClassicMove {
  from: number
  to: number
  promo?: Promo
}

export interface Adapter<S> {
  kind: 'chess' | 'xiangqi'
  create(): S
  board(s: S): readonly string[]
  turn(s: S): Seat
  /** 棋子屬於哪一方 */
  seatOf(piece: string): Seat
  targets(s: S, from: number): number[]
  needsPromotion(s: S, from: number, to: number): boolean
  apply(s: S, m: ClassicMove): { ok: true; state: S } | { ok: false; reason: string }
  resign(s: S, seat: Seat): S
  choose(s: S, style: ChessStyle, rng: RngState): [ClassicMove | null, RngState]
  over(s: S): boolean
  /** 贏的一方；和棋或還沒結束是 null */
  winner(s: S): Seat | null
  status(s: S): string
  /** 被將軍的王在哪一格（沒被將軍是 -1） */
  checkSq(s: S): number
  lastMove(s: S): { from: number; to: number } | null
  plies(s: S): number
  captured(s: S): readonly string[]
}

const up = (p: string) => p === p.toUpperCase()

export const chessAdapter: Adapter<ChessState> = {
  kind: 'chess',
  create: createChess,
  board: (s) => s.board,
  turn: (s) => (s.turn === 'w' ? 0 : 1),
  seatOf: (p) => (up(p) ? 0 : 1),
  targets: chessTargets,
  needsPromotion: isPromotion,
  apply: (s, m) => applyChess(s, { type: 'move', move: m as Move }),
  resign: (s, seat) => {
    const r = applyChess(s, { type: 'resign', color: seat === 0 ? 'w' : 'b' })
    return r.ok ? r.state : s
  },
  choose: (s, style, rng) => {
    const [m, next] = chooseChessMove(s, style, rng)
    // 電腦升變一律選后
    if (m && isPromotion(s, m.from, m.to) && !m.promo) m.promo = 'Q'
    return [m, next]
  },
  over: (s) => s.status !== 'playing',
  winner: (s) => (s.winner === null ? null : s.winner === 'w' ? 0 : 1),
  status: (s) => s.status,
  checkSq: (s) => (s.status !== 'resigned' && chessInCheck(s, s.turn) ? kingSquare(s.board, s.turn) : -1),
  lastMove: (s) => s.lastMove,
  plies: (s) => s.plies,
  captured: (s) => s.captured,
}

export const xiangqiAdapter: Adapter<XiangqiState> = {
  kind: 'xiangqi',
  create: createXiangqi,
  board: (s) => s.board,
  turn: (s) => (s.turn === 'r' ? 0 : 1),
  seatOf: (p) => (up(p) ? 0 : 1),
  targets: xqTargets,
  needsPromotion: () => false,
  apply: (s, m) => applyXiangqi(s, { type: 'move', move: { from: m.from, to: m.to } }),
  resign: (s, seat) => {
    const r = applyXiangqi(s, { type: 'resign', side: seat === 0 ? 'r' : 'b' })
    return r.ok ? r.state : s
  },
  choose: (s, style, rng) => chooseXiangqiMove(s, style, rng),
  over: (s) => s.status !== 'playing',
  winner: (s) => (s.winner === null ? null : s.winner === 'r' ? 0 : 1),
  status: (s) => s.status,
  checkSq: (s) => (s.status !== 'resigned' && xqInCheck(s.board, s.turn) ? s.board.indexOf(s.turn === 'r' ? 'K' : 'k') : -1),
  lastMove: (s) => s.lastMove,
  plies: (s) => s.plies,
  captured: (s) => s.captured,
}
