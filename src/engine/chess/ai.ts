// 西洋棋電腦對手：子力＋位置分數，交給共用的搜尋挑一步。
import type { ChessStyle } from '@/engine/common/personas'
import type { RngState } from '@/engine/common/rng'
import { chooseMove, MATE, type SearchGame } from '@/engine/common/search'
import { colOf, colorOf, inCheck, legalMoves, makeMove, rowOf, typeOf, type ChessState, type Move } from './rules'

export const VALUE: Record<string, number> = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0 }

/** 位置分數（白方視角，row 0 是第 8 排）：中央好、兵往前好、王留在後面安全 */
function placeBonus(t: string, row: number, col: number, endgame: boolean): number {
  const center = 3.5 - Math.max(Math.abs(3.5 - row), Math.abs(3.5 - col))
  switch (t) {
    case 'P':
      return (6 - row) * 8 + (col >= 2 && col <= 5 && row <= 4 ? 10 : 0)
    case 'N':
      return center * 12 - (row === 7 ? 10 : 0)
    case 'B':
      return center * 6 - (row === 7 ? 8 : 0)
    case 'R':
      return row === 1 ? 15 : 0
    case 'Q':
      return center * 3
    case 'K':
      return endgame ? center * 10 : (row === 7 ? 15 : -20) + (col <= 2 || col >= 6 ? 10 : 0)
  }
  return 0
}

export function evaluateChess(s: ChessState, style: ChessStyle): number {
  let score = 0
  let heavy = 0
  for (const p of s.board) if (p && typeOf(p) !== 'P' && typeOf(p) !== 'K') heavy += VALUE[typeOf(p)]
  const endgame = heavy <= 2600
  s.board.forEach((p, i) => {
    if (!p) return
    const t = typeOf(p)
    const white = colorOf(p) === 'w'
    const row = white ? rowOf(i) : 7 - rowOf(i)
    let v = VALUE[t] + placeBonus(t, row, colOf(i), endgame)
    // 愛進攻的人：棋子越過中線多加分
    if (t !== 'K' && row <= 3) v += style.attack * 12
    score += white ? v : -v
  })
  // 重視安全的人：自己被將軍扣分
  const me = s.turn
  const base = me === 'w' ? score : -score
  return base - (inCheck(s, me) ? 20 + style.safety * 30 : 0)
}

export const chessGame: SearchGame<ChessState, Move> = {
  moves: (s) => legalMoves({ ...s, status: 'playing' }).map((m) => (m.promo && m.promo !== 'Q' ? null : m)).filter((m): m is Move => !!m),
  play: (s, m) => makeMove(s, m).state,
  evaluate: evaluateChess,
  captureValue: (s, m) => {
    const victim = s.board[m.to]
    const v = victim ? VALUE[typeOf(victim)] : m.to === s.ep && typeOf(s.board[m.from]) === 'P' ? 100 : 0
    return (v ? v * 10 - VALUE[typeOf(s.board[m.from])] / 10 : 0) + (m.promo ? 800 : 0)
  },
  noMoves: (s) => (inCheck(s, s.turn) ? -MATE : 0),
}

export function chooseChessMove(s: ChessState, style: ChessStyle, rng: RngState): [Move | null, RngState] {
  return chooseMove(chessGame, s, style, rng)
}
