// 象棋電腦對手：子力＋位置分數，交給共用的搜尋挑一步。
import type { ChessStyle } from '@/engine/common/personas'
import type { RngState } from '@/engine/common/rng'
import { chooseMove, MATE, type SearchGame } from '@/engine/common/search'
import { basicLegal, colOf, inCheck, legalMoves, makeMove, rowOf, sideOf, typeOf, type XiangqiState, type XMove } from './rules'

export const VALUE: Record<string, number> = { K: 0, A: 200, B: 200, N: 400, R: 900, C: 450, P: 100 }

/** 位置分數（紅方視角，row 9 是紅方底線）：兵過河、越接近九宮越好；馬、炮在中間好 */
function placeBonus(t: string, row: number, col: number): number {
  const center = 4 - Math.abs(4 - col)
  switch (t) {
    case 'P':
      if (row >= 5) return 0
      return 80 + (4 - row) * 15 + (col >= 3 && col <= 5 ? 20 : 0) - (row === 0 ? 40 : 0)
    case 'N':
      return center * 8 + (row <= 6 ? 15 : 0)
    case 'C':
      return center * 6 + (col === 4 ? 10 : 0)
    case 'R':
      return center * 4 + (row <= 4 ? 15 : 0)
  }
  return 0
}

export function evaluateXiangqi(s: XiangqiState, style: ChessStyle): number {
  let score = 0
  s.board.forEach((p, i) => {
    if (!p) return
    const red = sideOf(p) === 'r'
    const t = typeOf(p)
    const row = red ? rowOf(i) : 9 - rowOf(i)
    let v = VALUE[t] + placeBonus(t, row, colOf(i))
    if (t !== 'K' && t !== 'A' && t !== 'B' && row <= 4) v += style.attack * 12
    score += red ? v : -v
  })
  const base = s.turn === 'r' ? score : -score
  return base - (inCheck(s.board, s.turn) ? 20 + style.safety * 30 : 0)
}

export const xiangqiGame: SearchGame<XiangqiState, XMove> = {
  // 往後算時不管重複局面（太花時間）；真正要走的那一步在 chooseXiangqiMove 會再檢查
  moves: (s) => basicLegal(s),
  play: (s, m) => makeMove(s, m),
  evaluate: evaluateXiangqi,
  captureValue: (s, m) => {
    const victim = s.board[m.to]
    return victim ? VALUE[typeOf(victim)] * 10 - VALUE[typeOf(s.board[m.from])] / 10 + (typeOf(victim) === 'K' ? 50000 : 0) : 0
  },
  // 象棋沒有步可走就是輸（被將死或困斃）
  noMoves: () => -MATE,
}

export function chooseXiangqiMove(s: XiangqiState, style: ChessStyle, rng: RngState): [XMove | null, RngState] {
  // 第一步只從真正合法的步（含禁長將）裡挑
  const legal = legalMoves(s)
  const game: SearchGame<XiangqiState, XMove> = { ...xiangqiGame, moves: (x) => (x === s ? legal : basicLegal(x)) }
  return chooseMove(game, s, style, rng, 40000)
}
