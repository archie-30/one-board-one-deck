// 五子棋「連續衝四取勝」（VCF）：一直做出「四」逼對手擋，最後連成五或做出兩個四（擋不完）。
// 挑戰難度的電腦用它找必勝的下法，也用它檢查對手是不是已經有必勝的下法、先去破壞。純函式。
import { DIRECTIONS, toXY, type GomokuState, type Player, type Stone } from './rules'

/** player 下在 index 會不會連成五（長連依規則選項） */
function makesFive(board: readonly Stone[], size: number, index: number, player: Player, overline: boolean): boolean {
  const [x, y] = toXY(index, size)
  for (const [dx, dy] of DIRECTIONS) {
    let n = 1
    for (const sgn of [1, -1]) {
      let cx = x + dx * sgn
      let cy = y + dy * sgn
      while (cx >= 0 && cy >= 0 && cx < size && cy < size && board[cy * size + cx] === player) {
        n++
        cx += dx * sgn
        cy += dy * sgn
      }
    }
    if (n === 5 || (n > 5 && overline)) return true
  }
  return false
}

/** 已經有子的格子附近 2 格內的空格 */
function near(board: readonly Stone[], size: number): number[] {
  const out = new Set<number>()
  for (let i = 0; i < board.length; i++) {
    if (!board[i]) continue
    const [x, y] = toXY(i, size)
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx
        const yy = y + dy
        if (xx >= 0 && yy >= 0 && xx < size && yy < size && !board[yy * size + xx]) out.add(yy * size + xx)
      }
  }
  return [...out]
}

/** 這一格旁邊（八個方向一格內）有沒有 player 的子：做得出「四」的位置一定緊貼自己的子 */
function touches(board: readonly Stone[], size: number, index: number, player: Player): boolean {
  const [x, y] = toXY(index, size)
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx
      const yy = y + dy
      if ((dx || dy) && xx >= 0 && yy >= 0 && xx < size && yy < size && board[yy * size + xx] === player) return true
    }
  return false
}

/** player 下一手就能連成五的位置 */
export function winPoints(board: readonly Stone[], size: number, player: Player, overline = true): number[] {
  return near(board, size).filter((i) => makesFive(board, size, i, player, overline))
}

/** 一次最多想多少個局面（手機上也要在一下子內算完） */
const LIMIT = 450

interface Ctx {
  size: number
  overline: boolean
  nodes: number
}

/** 輪到 me：有沒有連續衝四取勝的第一手（沒有回傳 -1） */
function search(ctx: Ctx, board: Stone[], me: Player, depth: number): number {
  if (++ctx.nodes > LIMIT || depth <= 0) return -1
  const opp: Player = me === 1 ? 2 : 1
  const mine = winPoints(board, ctx.size, me, ctx.overline)
  if (mine.length) return mine[0]
  // 對手已經有四：這一手一定要擋，就不是「衝四」了
  if (winPoints(board, ctx.size, opp, ctx.overline).length) return -1
  for (const p of near(board, ctx.size)) {
    if (!touches(board, ctx.size, p, me)) continue
    board[p] = me
    const threats = winPoints(board, ctx.size, me, ctx.overline)
    if (threats.length >= 2) {
      board[p] = 0
      return p
    }
    if (threats.length === 1) {
      const block = threats[0]
      board[block] = opp
      const ok = search(ctx, board, me, depth - 1) >= 0
      board[block] = 0
      if (ok) {
        board[p] = 0
        return p
      }
    }
    board[p] = 0
    if (ctx.nodes > LIMIT) return -1
  }
  return -1
}

/** 輪到 who 的話，有沒有連續衝四取勝；有就回傳第一手 */
export function findVcf(state: GomokuState, who: Player = state.turn, depth = 8): number {
  const ctx: Ctx = { size: state.size, overline: state.options.overlineWins, nodes: 0 }
  return search(ctx, state.board.slice(), who, depth)
}
