// 步步為營電腦：局面分數＝對方離終點的步數 − 自己離終點的步數（再加一點剩下的牆），用 alpha-beta 往後算。
//   要試的步：棋子能走的每一格，加上「擋在對方最短路上」的牆（不會亂放離對方很遠的牆）。
//   難度（quoridorAt）：低只看一步、常亂挑、偶爾隨手走；中看兩步；高看三步；挑戰一層一層往深算到四步（局面數用完為止）、不失誤，還會看「自己的路好不好被擋」。
//   不會亂晃：隨手走只走離終點最近的格子；橫移、往回走要明顯比較好才走（SIDEWAYS_COST），兩邊都留著牆時也不會互相等到和棋。
//   不亂丟牆：對方還很遠（6 步以上）時，只擋一步的牆不放。
// 棋盤全部公開，沒有偷看的問題。純函式，不碰畫面。
import { nextRandom, type RngState } from '../common/rng'
import {
  applyQuoridor,
  colOf,
  distMap,
  openNeighbors,
  pawnMoves,
  rowOf,
  W,
  wallOverlaps,
  distTo,
  type Orient,
  type QuoridorAction,
  type QuoridorState,
  type Side,
} from './rules'

export interface QuoridorStyle {
  /** 往後算幾步（挑戰用 nodes 一層一層加深） */
  depth: number
  /** 0～1：差不多好的步裡隨便挑的程度 */
  noise: number
  /** 0～1：隨手走一步的機率 */
  blunder: number
  /** 最多試幾個局面（挑戰一層一層加深時用） */
  nodes: number
  /** 0～1：愛放牆的程度（越大越早開始擋人） */
  walls: number
  /** 往後算時每個局面最多試幾道牆（越多看得越廣，也越慢）；沒填是 6 */
  width?: number
  /** 手上一道牆值幾分（一步路是 10 分）；沒填照「愛放牆的程度」算 */
  wallValue?: number
  /** 0～1：這一步會不會考慮放牆（低難度常常想不到要放牆；沒填＝每一步都考慮） */
  wallRate?: number
  /** 牆的價值跟著局勢變：對方還遠的時候牆比較值錢（先留著），對方快到了牆就該用了 */
  wallTempo?: number
  /** 沉得住氣：對方還沒追上（比自己遠超過 1 步）、離終點也還遠（超過 4 步）時先不放牆，留著關鍵時刻用 */
  patient?: boolean
  /** 0～1：會不會看「路有多好擋」（最短路上只剩一條縫的地方，對方一道牆就能讓你繞很遠） */
  narrow?: number
}

/** side 的路有多好擋：從棋子沿著最短路往終點走，每一步「同樣近的格子」只有一格的次數（越多越危險） */
function chokes(s: QuoridorState, side: Side): number {
  const dist = distMap(s, side)
  let layer = [s.pawns[side]]
  let n = 0
  while (layer.length && dist[layer[0]] > 0) {
    const next = new Set<number>()
    for (const a of layer) for (const b of openNeighbors(s, a)) if (dist[b] === dist[a] - 1) next.add(b)
    if (next.size === 1) n++
    layer = [...next]
  }
  return n
}

const other = (s: Side): Side => (s === 0 ? 1 : 0)
const WIN = 10000
/** 橫移、往回走要扣的分數（一步路是 10 分） */
const SIDEWAYS_COST = 6

/** 局面分數（從 me 的角度）：雙方離終點的差，加上剩下的牆；輪到誰也算一點（先走的人等於快半步） */
function evaluate(s: QuoridorState, me: Side, st: QuoridorStyle): number {
  if (s.status !== 'playing') return s.winner === null ? 0 : s.winner === me ? WIN - s.plies : -WIN + s.plies
  const op = other(me)
  const dMe = distTo(s, me, s.pawns[me])
  const dOp = distTo(s, op, s.pawns[op])
  // 牆越多越好，但快到終點時牆就沒那麼值錢了；愛放牆的人比較捨得用
  let wallW = st.wallValue ?? (0.6 - st.walls * 0.3) * 10
  // 對方離終點越遠，手上的牆越值錢（不要一開局就把牆用光）
  if (st.wallTempo) wallW += Math.max(0, dOp - 3) * st.wallTempo
  let v = (dOp - dMe) * 10 + (s.wallsLeft[me] - s.wallsLeft[op]) * wallW
  // 自己越接近終點越好（不然兩邊都等對方先走，會一直來回晃）
  v -= dMe * 2
  // 路好不好擋：對方還有牆時，自己的路只剩一條縫很危險；反過來對方的路好擋就是機會
  if (st.narrow) {
    if (s.wallsLeft[op] > 0) v -= chokes(s, me) * st.narrow * 2
    if (s.wallsLeft[me] > 0) v += chokes(s, op) * st.narrow * 2
  }
  v += s.turn === me ? 3 : -3
  return v
}

/** 擋在 side 最短路上的牆（所有最短路經過的通道，兩道牆都可能擋到） */
function blockingWalls(s: QuoridorState, side: Side): { at: number; o: Orient }[] {
  const dist = distMap(s, side)
  const start = s.pawns[side]
  const seen = new Set<number>([start])
  const q = [start]
  const out = new Map<string, { at: number; o: Orient }>()
  const add = (at: number, o: Orient) => at >= 0 && at < W * W && out.set(`${o}${at}`, { at, o })
  for (let k = 0; k < q.length; k++) {
    const a = q[k]
    for (const b of openNeighbors(s, a)) {
      if (dist[b] !== dist[a] - 1) continue
      // 擋住 a→b 這條通道的牆
      const ra = rowOf(a)
      const ca = colOf(a)
      if (colOf(b) === ca) {
        const r = Math.min(ra, rowOf(b))
        if (ca < W) add(r * W + ca, 'h')
        if (ca > 0) add(r * W + ca - 1, 'h')
      } else {
        const c = Math.min(ca, colOf(b))
        if (ra < W) add(ra * W + c, 'v')
        if (ra > 0) add((ra - 1) * W + c, 'v')
      }
      if (!seen.has(b)) {
        seen.add(b)
        q.push(b)
      }
    }
  }
  return [...out.values()]
}

/** 要試的步：棋子的每一步＋擋對方的牆（排好序：好的先試，剪枝比較快） */
function candidates(s: QuoridorState, maxWalls: number, root = false): QuoridorAction[] {
  const me = s.turn
  const op = other(me)
  const myDist = distMap(s, me)
  const out = pawnMoves(s).map((to) => ({ a: { type: 'move', to } as QuoridorAction, k: -myDist[to] * 10 }))
  if (s.wallsLeft[me] > 0) {
    const before = distTo(s, op, s.pawns[op])
    const myNow = myDist[s.pawns[me]]
    const walls: { a: QuoridorAction; k: number }[] = []
    for (const w of blockingWalls(s, op)) {
      if (wallOverlaps(s, w.at, w.o)) continue
      const t = { h: w.o === 'h' ? withFlag(s.h, w.at) : s.h, v: w.o === 'v' ? withFlag(s.v, w.at) : s.v }
      // 放了之後兩個人都還走得到（走不到＝不能放）
      const gain = distTo(t, op, s.pawns[op]) - before
      const hurt = distTo(t, me, s.pawns[me]) - myNow
      if (!Number.isFinite(gain) || !Number.isFinite(hurt) || gain - hurt <= 0) continue
      // 這一步真的要放的牆：對方還很遠時，只擋一步的牆不划算，先留著（不然一開局就把牆用光）
      if (root && gain - hurt < (before >= 6 ? 2 : 1)) continue
      walls.push({ a: { type: 'wall', at: w.at, o: w.o }, k: (gain - hurt) * 10 - 5 })
    }
    walls.sort((x, y) => y.k - x.k)
    out.push(...walls.slice(0, maxWalls))
  }
  out.sort((x, y) => y.k - x.k)
  return out.map((x) => x.a)
}
const withFlag = (arr: boolean[], i: number) => {
  const c = arr.slice()
  c[i] = true
  return c
}

/** alpha-beta：回傳從 me 角度的分數；局面數用完時丟出 'budget' */
function search(s: QuoridorState, depth: number, me: Side, st: QuoridorStyle, alpha: number, beta: number, budget: { n: number }): number {
  if (depth <= 0 || s.status !== 'playing') return evaluate(s, me, st)
  if (--budget.n < 0) throw new Error('budget')
  const mine = s.turn === me
  let best = mine ? -Infinity : Infinity
  // 越深的地方牆試得越少（只試擋得最多的幾道），不然局面數爆炸
  for (const a of candidates(s, depth >= 2 ? (st.width ?? 6) : (st.width ?? 6) + 4)) {
    const r = applyQuoridor(s, a)
    if (!r.ok) continue
    const v = search(r.state, depth - 1, me, st, alpha, beta, budget)
    if (mine) {
      if (v > best) best = v
      alpha = Math.max(alpha, v)
    } else {
      if (v < best) best = v
      beta = Math.min(beta, v)
    }
    if (alpha >= beta) break
  }
  return best
}

/** 每一個要試的步算一次分數（往後 depth 步） */
function scoreAll(s: QuoridorState, depth: number, st: QuoridorStyle, budget: { n: number }, walls = 16) {
  const me = s.turn
  return candidates(s, walls, true).map((a) => {
    const r = applyQuoridor(s, a)
    return { a, v: r.ok ? search(r.state, depth - 1, me, st, -Infinity, Infinity, budget) : -Infinity }
  })
}

/** 選一步。回傳 [這一步, 新的亂數狀態]；遊戲結束回傳 null */
export function chooseQuoridorAction(s: QuoridorState, st: QuoridorStyle, rng: RngState): [QuoridorAction | null, RngState] {
  if (s.status !== 'playing') return [null, rng]
  const me = s.turn
  // 牆用完了：只能走，就照最短的路走（不會來回晃，低難度也一樣）
  if (s.wallsLeft[me] === 0) return [{ type: 'move', to: shortestStep(s, distMap(s, me)) }, rng]
  let r: number
  ;[r, rng] = nextRandom(rng)
  if (r < st.blunder) {
    // 隨手走：往終點走的一步（不會亂放牆，也不會往回走）
    const d = distMap(s, me)
    const moves = pawnMoves(s)
    const best = Math.min(...moves.map((m) => d[m]))
    // 只在離終點最近的格子裡挑（不會左右亂晃）
    const ok = moves.filter((m) => d[m] === best)
    ;[r, rng] = nextRandom(rng)
    return [{ type: 'move', to: ok[Math.floor(r * ok.length)] }, rng]
  }
  // 一定贏：一步就到終點
  const dMe = distMap(s, me)
  const finish = pawnMoves(s).find((m) => dMe[m] === 0)
  if (finish !== undefined) return [{ type: 'move', to: finish }, rng]

  // 這一步想不想得到要放牆（低、中難度常常只顧著走）；沉得住氣的人，對方還沒追上就先不放
  ;[r, rng] = nextRandom(rng)
  const op = other(me)
  const dOp = distTo(s, op, s.pawns[op])
  const holdWalls = st.patient && dOp > dMe[s.pawns[me]] + 1 && dOp > 4
  const rootWalls = r < (st.wallRate ?? 1) && !holdWalls ? 16 : 0
  let scored: { a: QuoridorAction; v: number }[] = []
  if (st.depth >= 4) {
    // 挑戰：一層一層往深算，局面數用完就用上一層算完的結果
    // 局面數是整次共用的：深的那層算不完就用淺一層的結果
    const budget = { n: st.nodes }
    for (let d = 2; d <= st.depth; d++) {
      try {
        scored = scoreAll(s, d, st, budget, rootWalls)
      } catch {
        break
      }
    }
  } else {
    try {
      scored = scoreAll(s, st.depth, st, { n: st.nodes || Infinity }, rootWalls)
    } catch {
      // 局面數用完：退一層再算
      try {
        scored = scoreAll(s, Math.max(1, st.depth - 1), st, { n: Infinity }, rootWalls)
      } catch {
        scored = []
      }
    }
  }
  if (!scored.length) {
    // 沒算出來（很少見）：往終點走
    const moves = pawnMoves(s)
    const to = moves.reduce((b, m) => (dMe[m] < dMe[b] ? m : b), moves[0])
    return [{ type: 'move', to }, rng]
  }
  // 沒有更接近終點的走棋（左右橫移、往回走）先扣分：要明顯比較好（多出半步以上）才會選它。
  // 不然兩邊都有牆時會互相等對方先走，一直來回晃到和棋
  const nowD = dMe[s.pawns[me]]
  for (const x of scored) if (x.a.type === 'move' && dMe[x.a.to] >= nowD) x.v -= SIDEWAYS_COST
  scored.sort((x, y) => y.v - x.v)
  // 一樣好的步（例如怎麼走都輸、怎麼走都贏）：走棋優先、離終點越近越好，不會原地亂晃、亂丟牆
  const after = (a: QuoridorAction) => (a.type === 'move' ? dMe[a.to] : 99)
  const floor = scored[0].v - Math.max(0.5, st.noise * 12)
  let pool = scored.filter((x) => x.v >= floor)
  // 沒有比較接近終點的走棋（左右橫移、往回走）：只有它本身就是算出來最好的那一步才走，看起來才不會亂晃
  const here = dMe[s.pawns[me]]
  pool = pool.filter((x) => x === scored[0] || x.a.type !== 'move' || dMe[x.a.to] < here)
  if (st.noise === 0) {
    const best = Math.min(...pool.map((x) => after(x.a)))
    pool = [pool.find((x) => after(x.a) === best) ?? pool[0]]
  }
  ;[r, rng] = nextRandom(rng)
  return [pool[Math.floor(r * pool.length)].a, rng]
}

/** 照最短的路走一步（同樣近的格子挑第一個） */
function shortestStep(s: QuoridorState, d: number[]): number {
  const moves = pawnMoves(s)
  return moves.reduce((b, m) => (d[m] < d[b] ? m : b), moves[0])
}

