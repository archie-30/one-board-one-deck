// 黑白棋電腦對手：往後算幾步（alpha-beta），局面分數看「位置（角最好、角旁邊最危險）＋能下的地方多寡＋子數」，
// 依個性（算幾步、看重位置還是子數、亂挑、手滑）挑一步。挑戰在剩下的空格不多時直接算到底。純函式，不碰 UI。
import type { OthelloStyle } from '../common/personas'
import { nextInt, nextRandom, type RngState } from '../common/rng'
import { applyOthello, countDiscs, legalMoves, other, type Disc, type OthelloState, type Player } from './rules'

/** 每一格的位置價值：角 100、角旁邊的 X 位 -50、C 位 -20、邊 10 */
const W = [
  100, -20, 10, 5, 5, 10, -20, 100,
  -20, -50, -2, -2, -2, -2, -50, -20,
  10, -2, 1, 1, 1, 1, -2, 10,
  5, -2, 1, 0, 0, 1, -2, 5,
  5, -2, 1, 0, 0, 1, -2, 5,
  10, -2, 1, 1, 1, 1, -2, 10,
  -20, -50, -2, -2, -2, -2, -50, -20,
  100, -20, 10, 5, 5, 10, -20, 100,
]
const CORNERS = [0, 7, 56, 63]
/** 角已經被佔了：旁邊的格子就不危險了 */
const NEAR: Record<number, number[]> = { 0: [1, 8, 9], 7: [6, 14, 15], 56: [48, 49, 57], 63: [54, 55, 62] }

function weightOf(board: readonly Disc[], i: number): number {
  for (const c of CORNERS) if (board[c] !== 0 && NEAR[c].includes(i)) return 6
  return W[i]
}

/** 從 me 的角度看局面 */
export function evaluateOthello(board: readonly Disc[], me: Player, st: OthelloStyle): number {
  const opp = other(me)
  let pos = 0
  for (let i = 0; i < 64; i++) {
    if (board[i] === me) pos += weightOf(board, i)
    else if (board[i] === opp) pos -= weightOf(board, i)
  }
  const { black, white } = countDiscs(board)
  const empties = 64 - black - white
  const discs = me === 1 ? black - white : white - black
  const mob = legalMoves(board, me).length - legalMoves(board, opp).length
  // 越接近終局，子數越重要
  const late = empties < 14 ? 1 : 0.15
  return pos * (0.3 + st.corner) + mob * 6 * (0.3 + st.mobility) + discs * (late * 8 + st.greed * 6)
}

interface Ctx {
  st: OthelloStyle
  nodes: number
  limit: number
}

function search(ctx: Ctx, s: OthelloState, me: Player, depth: number, alpha: number, beta: number, exact: boolean): number {
  ctx.nodes++
  if (s.over) {
    const { black, white } = countDiscs(s.board)
    const d = me === 1 ? black - white : white - black
    return d * 10000
  }
  if ((!exact && depth <= 0) || ctx.nodes > ctx.limit) return evaluateOthello(s.board, me, ctx.st)
  const sign = s.turn === me ? 1 : -1
  const ms = legalMoves(s.board, s.turn).sort((a, b) => W[b] - W[a])
  let best = sign > 0 ? -Infinity : Infinity
  for (const m of ms) {
    const r = applyOthello(s, { type: 'play', index: m })
    if (!r.ok) continue
    const v = search(ctx, r.state, me, depth - 1, alpha, beta, exact)
    if (sign > 0) {
      if (v > best) best = v
      if (v > alpha) alpha = v
    } else {
      if (v < best) best = v
      if (v < beta) beta = v
    }
    if (alpha >= beta) break
  }
  return best
}

/** 選一步；沒地方下時回傳 -1 */
export function chooseOthelloMove(state: OthelloState, st: OthelloStyle, rng: RngState): [number, RngState] {
  const me = state.turn
  const ms = legalMoves(state.board, me)
  if (!ms.length || state.over) return [-1, rng]
  if (ms.length === 1) return [ms[0], rng]
  let r: number
  ;[r, rng] = nextRandom(rng)
  if (r < st.blunder) {
    let k: number
    ;[k, rng] = nextInt(rng, ms.length)
    return [ms[k], rng]
  }
  const empties = state.board.filter((d) => d === 0).length
  const exact = (st.solve ?? 0) >= empties
  const ctx: Ctx = { st, nodes: 0, limit: st.nodes ?? 40000 }
  const depth = Math.max(1, Math.round(st.depth))
  const scored = ms.map((m) => {
    const after = applyOthello(state, { type: 'play', index: m })
    return { m, v: after.ok ? search(ctx, after.state, me, depth - 1, -Infinity, Infinity, exact) : -Infinity }
  })
  const best = Math.max(...scored.map((x) => x.v))
  const margin = exact ? 0 : 4 + st.noise * 60
  const good = scored.filter((x) => x.v >= best - margin)
  ;[r, rng] = nextRandom(rng)
  if (r < 1 - st.noise) return [scored.find((x) => x.v === best)!.m, rng]
  let k: number
  ;[k, rng] = nextInt(rng, good.length)
  return [good[k].m, rng]
}
