// 五子棋開局棋譜（挑戰難度用）：前三手照公認的好開局下，之後交給電腦自己算。
//   第 2 手（白）：貼著黑子下（直接，正上下左右）或斜著下（間接）
//   第 3 手（黑）：白直接 → 花月（貼著白子、又跟第 1 手斜對）；白間接 → 浦月（同時貼著第 1、2 手）
// 這兩個是自由規則下黑棋最強的開局。純函式：只回傳「棋譜上可以下的幾個點」，挑哪個由呼叫的人用亂數決定。
import { toXY, type GomokuState } from './rules'

/** 棋譜上的下一手（可能有好幾個一樣好的點，都朝棋盤中央）；沒有就是空陣列 */
export function bookMoves(state: GomokuState): number[] {
  const { size, moves, board } = state
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < size && y < size && board[y * size + x] === 0 ? y * size + x : -1)
  const c = (size - 1) / 2
  /** 留下最靠近中央的點 */
  const central = (pts: number[]) => {
    const ok = pts.filter((i) => i >= 0)
    if (!ok.length) return []
    const d = (i: number) => {
      const [x, y] = toXY(i, size)
      return Math.abs(x - c) + Math.abs(y - c)
    }
    const best = Math.min(...ok.map(d))
    return ok.filter((i) => d(i) === best)
  }
  if (moves.length === 1 && state.turn === 2) {
    const [bx, by] = toXY(moves[0], size)
    // 黑子在中央附近才照棋譜；直接、間接兩種都可以
    if (Math.abs(bx - c) > 2 || Math.abs(by - c) > 2) return []
    const direct = [at(bx, by - 1), at(bx, by + 1), at(bx - 1, by), at(bx + 1, by)]
    const indirect = [at(bx - 1, by - 1), at(bx + 1, by - 1), at(bx - 1, by + 1), at(bx + 1, by + 1)]
    return [...central(direct), ...central(indirect)]
  }
  if (moves.length === 2 && state.turn === 1) {
    const [bx, by] = toXY(moves[0], size)
    const [wx, wy] = toXY(moves[1], size)
    const dx = wx - bx
    const dy = wy - by
    // 花月：白貼著黑 → 黑下在白子旁邊、跟第 1 手斜對
    if (Math.abs(dx) + Math.abs(dy) === 1) return central([at(wx - dy, wy + dx), at(wx + dy, wy - dx)])
    // 浦月：白斜對黑 → 黑下在同時貼著兩顆子的點
    if (Math.abs(dx) === 1 && Math.abs(dy) === 1) return central([at(bx + dx, by), at(bx, by + dy)])
  }
  return []
}
