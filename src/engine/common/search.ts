// 西洋棋、象棋共用的電腦思考：往後算幾步（alpha-beta 剪枝）＋吃子延伸，
// 再依對手的個性（算幾步、隨機程度、手滑機率）從好的幾步裡挑一步。純函式，不碰 UI。
import type { ChessStyle } from './personas'
import { nextInt, nextRandom, type RngState } from './rng'

export interface SearchGame<S, M> {
  /** 輪到的一方所有合法的步 */
  moves(s: S): M[]
  /** 走一步（不必判斷結束） */
  play(s: S, m: M): S
  /** 局面分數：從輪到的一方來看，越大越好（單位約等於「一個兵 = 100」） */
  evaluate(s: S, style: ChessStyle): number
  /** 這步吃到的子值多少（不是吃子回傳 0）：用來排序、吃子延伸 */
  captureValue(s: S, m: M): number
  /** 沒有步可走時的分數（從輪到的一方來看） */
  noMoves(s: S): number
}

export const MATE = 100000

interface Ctx<S, M> {
  g: SearchGame<S, M>
  style: ChessStyle
  nodes: number
  limit: number
}

function order<S, M>(ctx: Ctx<S, M>, s: S, ms: M[]): M[] {
  return ms
    .map((m) => ({ m, v: ctx.g.captureValue(s, m) }))
    .sort((a, b) => b.v - a.v)
    .map((x) => x.m)
}

/** 吃子延伸：算到最後一層時，把還能吃的子吃完再評分，避免「下一步就被吃」的誤判 */
function quiesce<S, M>(ctx: Ctx<S, M>, s: S, alpha: number, beta: number, depth: number): number {
  ctx.nodes++
  const stand = ctx.g.evaluate(s, ctx.style)
  if (stand >= beta) return stand
  if (stand > alpha) alpha = stand
  if (depth <= 0 || ctx.nodes > ctx.limit) return stand
  const caps = ctx.g
    .moves(s)
    .map((m) => ({ m, v: ctx.g.captureValue(s, m) }))
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v)
  for (const { m } of caps) {
    const v = -quiesce(ctx, ctx.g.play(s, m), -beta, -alpha, depth - 1)
    if (v >= beta) return v
    if (v > alpha) alpha = v
  }
  return alpha
}

function negamax<S, M>(ctx: Ctx<S, M>, s: S, depth: number, alpha: number, beta: number, ply: number): number {
  ctx.nodes++
  const ms = ctx.g.moves(s)
  if (!ms.length) return ctx.g.noMoves(s) + (ctx.g.noMoves(s) < 0 ? ply : -ply)
  if (depth <= 0) return quiesce(ctx, s, alpha, beta, 3)
  let best = -Infinity
  for (const m of order(ctx, s, ms)) {
    const v = -negamax(ctx, ctx.g.play(s, m), depth - 1, -beta, -alpha, ply + 1)
    if (v > best) best = v
    if (v > alpha) alpha = v
    if (alpha >= beta || ctx.nodes > ctx.limit) break
  }
  return best
}

/** 依個性挑一步；沒有步可走時回傳 null */
export function chooseMove<S, M>(g: SearchGame<S, M>, s: S, style: ChessStyle, rng: RngState, limit = 60000): [M | null, RngState] {
  const ms = g.moves(s)
  if (!ms.length) return [null, rng]
  let r: number
  ;[r, rng] = nextRandom(rng)
  // 手滑：隨便走一步
  if (r < style.blunder) {
    let k: number
    ;[k, rng] = nextInt(rng, ms.length)
    return [ms[k], rng]
  }
  const ctx: Ctx<S, M> = { g, style, nodes: 0, limit }
  const depth = Math.max(1, Math.min(3, Math.round(style.depth)))
  const margin = 15 + style.noise * 90
  const scored: { m: M; v: number }[] = []
  let best = -Infinity
  for (const m of order(ctx, s, ms)) {
    // 只要知道「比目前最好的差多少」就夠了，比最好的差太多的步不必算準
    const v = -negamax(ctx, g.play(s, m), depth - 1, -Infinity, -(best - margin), 1)
    scored.push({ m, v })
    if (v > best) best = v
  }
  const good = scored.filter((x) => x.v >= best - margin)
  let k: number
  ;[k, rng] = nextInt(rng, good.length)
  // 越不隨機的人，越常直接選最好的那步
  ;[r, rng] = nextRandom(rng)
  const pick = r < 1 - style.noise ? good.reduce((a, b) => (b.v > a.v ? b : a)) : good[k]
  return [pick.m, rng]
}
