// 九子棋的電腦。只看棋盤（九子棋沒有藏起來的資訊）。
// 往後算幾步（alpha-beta），局面分數看：子數（棋盤上＋手上）、已經成三的線、差一顆就成三的線（兩顆自己的＋一個空點）、
// 走子階段能走的步數（被堵住的子越多越糟）。成三、拿子的步先算（剪枝比較快）。
//   低：只看這一步，常從前幾名亂挑；中：看兩步，偶爾亂挑；高：看四步；挑戰：看四步＋吃子延伸（算到底時還有成三拿子的步，就只算那些步再多看兩層），不失誤。
//   實測（電腦互下 30 局）：挑戰對高 16 勝 5 負 9 和；高對中 8 勝 1 負 1 和、中對低 8 勝 1 負 1 和（10 局）。
//   試過但沒變強的：一層一層算到 6 步（7 勝 12 負，而且一步要 1 秒）、照 Petcu & Holban 權重的細局面分數（8 勝 10 負）。
import { nextRandom, type RngState } from '../common/rng'
import type { Level } from '../common/difficulty'
import { applyMorris, countOf, legalActions, MILLS, targetsOf, type MorrisAction, type MorrisState, type Side } from './rules'

const other = (s: Side): Side => (s === 0 ? 1 : 0)
const WIN = 100000

/** 局面分數（side 的角度，越大越好） */
export function evaluate(s: MorrisState, side: Side): number {
  if (s.status !== 'playing') return s.winner === null ? 0 : s.winner === side ? WIN : -WIN
  const foe = other(side)
  const b = s.board
  const placing = s.hand[0] > 0 || s.hand[1] > 0
  let v = 0
  // 子數
  v += (countOf(b, side) + s.hand[side] - countOf(b, foe) - s.hand[foe]) * 100
  // 成三、差一顆成三
  for (const [x, y, z] of MILLS) {
    let mine = 0
    let theirs = 0
    let empty = 0
    for (const p of [x, y, z]) {
      if (b[p] === side) mine++
      else if (b[p] === foe) theirs++
      else empty++
    }
    if (mine === 3) v += 10
    else if (theirs === 3) v -= 10
    else if (mine === 2 && empty === 1) v += placing ? 14 : 8
    else if (theirs === 2 && empty === 1) v -= placing ? 14 : 8
  }
  // 能走的步數（走子階段；能飛的人不算）
  if (!placing) {
    const moves = (who: Side) => {
      let n = 0
      for (let p = 0; p < b.length; p++) if (b[p] === who) n += targetsOf(s, p).length
      return n
    }
    v += (moves(side) - moves(foe)) * 4
  }
  return v
}

/** 先算成三拿子的步 */
function ordered(s: MorrisState): MorrisAction[] {
  const acts = legalActions(s)
  return acts.sort((a, b) => Number('remove' in b && b.remove !== undefined) - Number('remove' in a && a.remove !== undefined))
}

let nodes = 0
/** 吃子延伸最多幾層（0＝不延伸） */
let qext = 0
const score = evaluate
function search(s: MorrisState, depth: number, alpha: number, beta: number, side: Side, ply: number, budget: number): number {
  nodes++
  if (s.status !== 'playing') {
    const e = evaluate(s, side)
    return e > 0 ? e - ply : e < 0 ? e + ply : 0
  }
  if (nodes > budget) return score(s, side)
  if (depth <= 0) {
    // 吃子延伸：算到底了，但還有成三拿子的步，就只算那些步，最多再兩層（不然剛好在拿子前停下來會看錯）
    if (depth <= -qext) return score(s, side)
    const caps = legalActions(s).filter((a) => a.type !== 'timeout' && a.type !== 'resign' && a.remove !== undefined)
    const stand = score(s, side)
    if (!caps.length) return stand
    const max = s.turn === side
    // 不拿子也可以（站著不動的分數當底）
    let best = stand
    if (max) alpha = Math.max(alpha, best)
    else beta = Math.min(beta, best)
    if (alpha >= beta) return best
    for (const a of caps) {
      const r = applyMorris(s, a)
      if (!r.ok) continue
      const v = search(r.state, depth - 1, alpha, beta, side, ply + 1, budget)
      if (max) {
        if (v > best) best = v
        if (best > alpha) alpha = best
      } else {
        if (v < best) best = v
        if (best < beta) beta = best
      }
      if (alpha >= beta) break
    }
    return best
  }
  const max = s.turn === side
  let best = max ? -Infinity : Infinity
  for (const a of ordered(s)) {
    const r = applyMorris(s, a)
    if (!r.ok) continue
    const v = search(r.state, depth - 1, alpha, beta, side, ply + 1, budget)
    if (max) {
      if (v > best) best = v
      if (best > alpha) alpha = best
    } else {
      if (v < best) best = v
      if (best < beta) beta = best
    }
    if (alpha >= beta) break
  }
  return best
}

interface Style {
  depth: number
  /** 最多算幾個局面（保險，避免手機上卡太久） */
  budget: number
  whim: number
  pool: number
  /** 吃子延伸幾層（算到底了還有成三拿子的步，就只算那些步再多看幾層） */
  qext: number
}
export const MORRIS_STYLE: Record<Level, Style> = {
  low: { depth: 1, budget: 1e9, whim: 0.4, pool: 5, qext: 0 },
  mid: { depth: 2, budget: 1e9, whim: 0.1, pool: 3, qext: 0 },
  high: { depth: 4, budget: 200000, whim: 0, pool: 1, qext: 0 },
  master: { depth: 4, budget: 200000, whim: 0, pool: 1, qext: 2 },
}

/** 根這一層每一步的分數（看 depth 步） */
function rootScores(s: MorrisState, depth: number, budget: number): { a: MorrisAction; v: number }[] {
  const side = s.turn
  nodes = 0
  const out: { a: MorrisAction; v: number }[] = []
  let alpha = -Infinity
  for (const a of ordered(s)) {
    const r = applyMorris(s, a)
    if (!r.ok) continue
    const v = search(r.state, depth - 1, alpha, Infinity, side, 1, budget)
    out.push({ a, v })
    if (v > alpha) alpha = v
  }
  return out
}

export function chooseMorrisAction(s: MorrisState, level: Level, rng: RngState): [MorrisAction, RngState] {
  const st = MORRIS_STYLE[level]
  let r: number
  const rand = () => {
    ;[r, rng] = nextRandom(rng)
    return r
  }
  const acts = legalActions(s)
  if (!acts.length) return [{ type: 'timeout' }, rng]
  qext = st.qext
  const scored = rootScores(s, st.depth, st.budget)
  // 一樣好的步隨機挑一個（不會每局都下一樣）
  for (const x of scored) x.v += rand() * 0.5
  scored.sort((a, b) => b.v - a.v)
  if (st.whim > 0 && rand() < st.whim) return [scored[Math.floor(rand() * Math.min(st.pool, scored.length))].a, rng]
  return [scored[0].a, rng]
}

/** 測試、模擬用：照兩邊的難度下到結束 */
export function playOut(s: MorrisState, levels: [Level, Level], rng: RngState): [MorrisState, RngState] {
  let st = s
  while (st.status === 'playing') {
    let a: MorrisAction
    ;[a, rng] = chooseMorrisAction(st, levels[st.turn], rng)
    const res = applyMorris(st, a)
    if (!res.ok) throw new Error(res.reason)
    st = res.state
  }
  return [st, rng]
}
