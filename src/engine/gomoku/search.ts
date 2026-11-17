// 五子棋往後算（挑戰難度用）：alpha-beta 往後看幾手，每個局面看「整個棋盤」的形勢，不只看下的那一點。
//   形勢：棋盤上每一段連續 5 格（橫、直、兩條斜線）裡，只有一方的棋子時，子越多分數越高（2 子、3 子、4 子越來越值錢）。
//         這樣跳三、跳四、還沒連起來的潛力都算得到，而且是整盤一起看。
//   每一步：自己能連五就贏；對手已經有四一定要擋（只看擋的點）；其他照「攻＋守」排好只看前幾名。
// 純函式：不碰 UI。
import { winPoints } from './vcf'
import { DIRECTIONS, type GomokuState, type Player, type Stone } from './rules'

const WIN = 10_000_000
/** 一段 5 格裡有 1～4 顆同色子的分數 */
const W = [0, 1, 14, 180, 2600]

/** 每一段 5 格的格子編號（依棋盤大小算一次就記住） */
const windowsCache = new Map<number, Int16Array>()
function windows(size: number): Int16Array {
  const hit = windowsCache.get(size)
  if (hit) return hit
  const out: number[] = []
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      for (const [dx, dy] of DIRECTIONS) {
        const ex = x + dx * 4
        const ey = y + dy * 4
        if (ex < 0 || ey < 0 || ex >= size || ey >= size) continue
        for (let k = 0; k < 5; k++) out.push((y + dy * k) * size + (x + dx * k))
      }
  const arr = Int16Array.from(out)
  windowsCache.set(size, arr)
  return arr
}

/** 整盤形勢（輪到 me 的角度；輪到的人多一點優勢） */
export function evaluate(board: readonly Stone[], size: number, me: Player): number {
  const win = windows(size)
  let mine = 0
  let theirs = 0
  for (let i = 0; i < win.length; i += 5) {
    let a = 0
    let b = 0
    for (let k = 0; k < 5; k++) {
      const v = board[win[i + k]]
      if (v === me) a++
      else if (v) b++
    }
    if (a && !b) mine += W[a]
    else if (b && !a) theirs += W[b]
  }
  return mine * 1.15 - theirs
}

export interface SearchOptions {
  /** 往後看幾手 */
  depth: number
  /** 每一步只看前幾名 */
  width: number
  /** 最多想幾個局面 */
  nodes: number
  /** 排序候選：輪到 state.turn 時，好棋排前面 */
  order: (state: GomokuState) => number[]
}

interface Ctx extends SearchOptions {
  count: number
  size: number
  overline: boolean
}

function negamax(ctx: Ctx, s: GomokuState, depth: number, alpha: number, beta: number, ply: number): number {
  const me = s.turn
  const opp: Player = me === 1 ? 2 : 1
  const board = s.board as Stone[]
  if (winPoints(board, ctx.size, me, ctx.overline).length) return WIN - ply
  if (depth <= 0 || ++ctx.count > ctx.nodes) return evaluate(board, ctx.size, me)
  const threats = winPoints(board, ctx.size, opp, ctx.overline)
  // 對手兩個四：擋不完
  if (threats.length >= 2) return -(WIN - ply - 1)
  const moves = threats.length ? threats : ctx.order(s).slice(0, ctx.width)
  if (!moves.length) return 0
  let best = -Infinity
  for (const m of moves) {
    board[m] = me
    const v = -negamax(ctx, { ...s, board, turn: opp }, depth - 1, -beta, -alpha, ply + 1)
    board[m] = 0
    if (v > best) best = v
    if (v > alpha) alpha = v
    if (alpha >= beta) break
  }
  return best
}

/** 從 candidates 裡挑往後算最好的一手（candidates 已經照好壞排好） */
export function searchBest(state: GomokuState, candidates: readonly number[], opt: SearchOptions): number {
  const ctx: Ctx = { ...opt, count: 0, size: state.size, overline: state.options.overlineWins }
  const board = state.board.slice()
  const me = state.turn
  const opp: Player = me === 1 ? 2 : 1
  let pick = candidates[0]
  let alpha = -Infinity
  for (const m of candidates) {
    board[m] = me
    const v = -negamax(ctx, { ...state, board, turn: opp }, opt.depth - 1, -Infinity, -alpha, 1)
    board[m] = 0
    if (v > alpha) {
      alpha = v
      pick = m
    }
  }
  return pick
}
