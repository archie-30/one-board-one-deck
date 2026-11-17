// 西洋跳棋電腦：alpha-beta 往後算幾步（有子可吃時多看一層，免得在吃子途中停下來誤判）。
// 局面看：子力（王比一般子值錢）、一般子往前走多遠、守住自己的底線、中間的格子、能動的步數。
// 打法（CheckersStyle）由難度決定算幾步、亂挑、手滑。純函式，不碰畫面。
import { nextRandom, type RngState } from '../common/rng'
import { applyCheckers, colOf, crownRow, isKing, legalMoves, ownerOf, rowOf, type CheckersMove, type CheckersState, type Side } from './rules'

export interface CheckersStyle {
  /** 往後算幾步 */
  depth: number
  /** 0～1：在差不多好的步裡隨便挑的程度 */
  noise: number
  /** 0～1：手滑（隨便走一步）的機率 */
  blunder: number
  /** 最多想幾個局面（手機上一步不要太久） */
  nodes: number
}

const WIN = 100000

/** 從 side 的角度看局面 */
export function evaluate(s: CheckersState, side: Side): number {
  let v = 0
  for (let i = 0; i < s.board.length; i++) {
    const c = s.board[i]
    const o = ownerOf(c)
    if (o < 0) continue
    const sign = o === side ? 1 : -1
    let p: number
    if (isKing(c)) {
      // 王：值錢，待在中間比較好
      const r = rowOf(i)
      const col = colOf(i)
      p = 175 - (Math.abs(3.5 - r) + Math.abs(3.5 - col)) * 2
    } else {
      // 一般子：越往前越好；守底線
      const ahead = o === 0 ? 7 - rowOf(i) : rowOf(i)
      p = 100 + ahead * 4
      if (rowOf(i) === crownRow(o === 0 ? 1 : 0)) p += 9
      const col = colOf(i)
      if (col === 0 || col === 7) p -= 3
    }
    v += sign * p
  }
  return v
}

interface Ctx {
  nodes: number
  limit: number
}

function negamax(ctx: Ctx, s: CheckersState, depth: number, alpha: number, beta: number, ply: number): number {
  if (s.status !== 'playing') return s.winner === null ? 0 : s.winner === s.turn ? WIN - ply : -(WIN - ply)
  const moves = legalMoves(s)
  const capturing = moves.length > 0 && moves[0].captured.length > 0
  // 吃子途中不停下來：有子可吃就多看一層
  if ((depth <= 0 && !capturing) || ++ctx.nodes > ctx.limit || depth < -4) return evaluate(s, s.turn) + moves.length
  let best = -Infinity
  for (const m of order(moves)) {
    const r = applyCheckers(s, { type: 'move', path: m.path })
    if (!r.ok) continue
    const v = -negamax(ctx, r.state, depth - 1, -beta, -alpha, ply + 1)
    if (v > best) best = v
    if (v > alpha) alpha = v
    if (alpha >= beta) break
  }
  return best
}

/** 吃得多的、會升王的先看（剪枝比較有效） */
const order = (moves: CheckersMove[]) => moves.slice().sort((a, b) => b.captured.length - a.captured.length)

/** 選一步。回傳 [這一步, 新的亂數狀態]；沒有步可走回傳 null */
export function chooseCheckersMove(s: CheckersState, st: CheckersStyle, rng: RngState): [CheckersMove | null, RngState] {
  const moves = legalMoves(s)
  if (!moves.length) return [null, rng]
  if (moves.length === 1) return [moves[0], rng]
  let r: number
  ;[r, rng] = nextRandom(rng)
  if (r < st.blunder) {
    ;[r, rng] = nextRandom(rng)
    return [moves[Math.floor(r * moves.length)], rng]
  }
  // 不亂挑（挑戰）：一層一層加深（每一層都在局面數用完前算完才算數），第一層也剪枝，同樣的時間算得最深
  if (!st.noise) {
    let best = order(moves)[0]
    for (let d = 2; d <= st.depth; d++) {
      const ctx: Ctx = { nodes: 0, limit: st.nodes }
      let alpha = -Infinity
      let pick = best
      // 上一層最好的那步先看
      for (const m of [best, ...moves.filter((x) => x !== best)]) {
        const after = applyCheckers(s, { type: 'move', path: m.path })
        if (!after.ok) continue
        const v = -negamax(ctx, after.state, d - 1, -Infinity, -alpha, 1)
        if (v > alpha) ((alpha = v), (pick = m))
      }
      if (ctx.nodes > ctx.limit) break
      best = pick
      if (alpha >= WIN / 2) break
    }
    return [best, rng]
  }
  const ctx: Ctx = { nodes: 0, limit: st.nodes }
  const scored = order(moves).map((m) => {
    const after = applyCheckers(s, { type: 'move', path: m.path })
    const v = after.ok ? -negamax(ctx, after.state, st.depth - 1, -Infinity, Infinity, 1) : -Infinity
    return { m, v }
  })
  scored.sort((a, b) => b.v - a.v)
  // 差不多好的幾步裡挑：noise 越大範圍越寬（必勝、必輸的差距不會被亂挑蓋過）
  const floor = scored[0].v - st.noise * 60
  const pool = scored.filter((x) => x.v >= floor && x.v > -WIN / 2)
  const pick = pool.length ? pool : scored
  ;[r, rng] = nextRandom(rng)
  return [pick[Math.floor(r * pick.length)].m, rng]
}
