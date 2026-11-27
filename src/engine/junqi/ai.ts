// 軍棋的電腦。只看得到自己的子（viewFor 的局面），對方的子是什麼要用公開的資訊推測：
//   - 動過的不是地雷、軍旗；不在大本營的不是軍旗；沒動過又在前四列的不是地雷；沒動過又在第一列的不是炸彈。
//   - 跟我的子碰過還活著：贏過我的子＝比它大（或是地雷）；吃掉我的地雷＝工兵。
//   - 司令陣亡（軍旗亮出來）：對方剩下的子裡沒有司令。
// 然後「猜幾次」：每次照可能性把對方的子都填上（剩下幾個司令、幾個地雷…都照數量），
// 在猜好的局面上往後算（alpha-beta），每一步的分數取幾次的平均。越早奪旗越好。
//   低：猜 3 次、只看自己這一步、常亂挑；中：猜 8 次、看到對方回一步、偶爾亂挑；
//   高：猜 8 次、往後算三步（自己、對方、自己）、局面分數更細（逼近對方軍旗、守自己的軍旗）、不失誤。
//   最後一層只算「這一步讓分數變多少」（delta），不整盤重算，快很多。
//   實測（電腦互下 16 局）：高對中 13 勝 3 負、中對低 12 勝 3 負 1 和；高一步平均約 0.16 秒、最久約 0.4 秒（電腦上）。
import { nextRandom, shuffle, type RngState } from '../common/rng'
import type { CardLevel } from '../common/difficulty'
import {
  ARMY, BOMB, CAMPS, CELLS, COLS, COMMANDER, COMPANY, CORPS, depthOf, DIVISION, ENGINEER, FLAG, fight, HOME, HQS, legalMoves, MINE, RAIL, RAIL_ADJ, RAIL_RAYS, ROAD_ADJ,
  PER_SIDE, PLATOON, BATTALION, BRIGADE, REGIMENT, colOf, rowOf, sideOfId, UNKNOWN, type JunqiAction, type JunqiState, type Side, viewFor, applyJunqi,
} from './rules'

/** 每種子值多少 */
const VALUE: Record<number, number> = {
  [ENGINEER]: 4, [PLATOON]: 2, [COMPANY]: 3, [BATTALION]: 4.5, [REGIMENT]: 6, [BRIGADE]: 8, [DIVISION]: 11, [CORPS]: 15, [COMMANDER]: 20,
  [BOMB]: 10, [MINE]: 4, [FLAG]: 0,
}
const WIN = 10000
const other = (s: Side): Side => (s === 0 ? 1 : 0)

interface Style {
  samples: number
  /** 2＝看到對方回一步 */
  depth: 1 | 2 | 3
  /** 亂挑的機率、從前幾名挑 */
  whim: number
  pool: number
  /** 分數加的雜訊 */
  noise: number
  /** 細的局面分數（守軍旗、逼近對方軍旗） */
  fine: boolean
}
export const JUNQI_STYLE: Record<CardLevel, Style> = {
  low: { samples: 3, depth: 1, whim: 0.3, pool: 5, noise: 2, fine: false },
  mid: { samples: 8, depth: 2, whim: 0.08, pool: 3, noise: 0.6, fine: false },
  high: { samples: 8, depth: 3, whim: 0, pool: 1, noise: 0.15, fine: true },
}

// ── 推測對方的子 ──

/** 每顆看不到的子可能是什麼（照公開的資訊） */
export function possibleRanks(v: JunqiState, me: Side): Map<number, Set<number>> {
  const foe = other(me)
  const kinds = [...new Set(ARMY)]
  const out = new Map<number, Set<number>>()
  for (let at = 0; at < CELLS; at++) {
    const id = v.board[at]
    if (id < 0 || sideOfId(id) !== foe || v.rank[id] !== UNKNOWN) continue
    const k = id - foe * PER_SIDE
    const set = new Set(kinds)
    if (v.moved[id]) {
      set.delete(MINE)
      set.delete(FLAG)
    } else {
      if (depthOf(k) < 4) set.delete(MINE)
      if (depthOf(k) === 0) set.delete(BOMB)
    }
    if (!HQS.has(at)) set.delete(FLAG)
    if (v.flagShown[foe]) {
      set.delete(COMMANDER)
      set.delete(FLAG)
    }
    out.set(id, set)
  }
  // 跟我的子碰過還活著
  for (const f of v.fights) {
    const mineIsA = sideOfId(f.a) === me
    const myId = mineIsA ? f.a : f.d
    const foeId = mineIsA ? f.d : f.a
    const set = out.get(foeId)
    if (!set || !v.alive[foeId]) continue
    const m = v.rank[myId]
    if (m === UNKNOWN) continue
    // 他活下來了：我攻他輸（out lose），或他攻我贏（out win）
    const survived = mineIsA ? f.out === 'lose' : f.out === 'win'
    if (!survived) continue
    for (const r of [...set]) {
      const ok = mineIsA ? fight(m, r) === 'lose' : fight(r, m) === 'win'
      if (!ok) set.delete(r)
    }
  }
  for (const set of out.values()) if (!set.size) for (const r of kinds) if (r !== FLAG) set.add(r)
  return out
}

/** 對方剩下的子大概還有哪些（全部扣掉看得到的、確定死掉的） */
function remainingPool(v: JunqiState, me: Side): number[] {
  const foe = other(me)
  const pool = [...ARMY]
  const drop = (r: number) => {
    const i = pool.indexOf(r)
    if (i >= 0) pool.splice(i, 1)
  }
  for (let id = foe * PER_SIDE; id < (foe + 1) * PER_SIDE; id++) if (v.rank[id] !== UNKNOWN && v.alive[id]) drop(v.rank[id])
  if (v.flagShown[foe]) drop(COMMANDER)
  // 我的工兵吃掉的一定是地雷；我的子跟他同歸於盡的，多半跟我的一樣大
  for (const f of v.fights) {
    const mineIsA = sideOfId(f.a) === me
    const m = v.rank[mineIsA ? f.a : f.d]
    if (m === UNKNOWN) continue
    if (mineIsA && f.out === 'win' && m === ENGINEER) drop(MINE)
    else if (f.out === 'tie' && m !== BOMB) drop(m)
  }
  return pool
}

/** 照可能性把對方看不到的子都填上（一次猜測） */
export function determinize(v: JunqiState, me: Side, rng: RngState, poss = possibleRanks(v, me)): [number[], RngState] {
  const rank = v.rank.slice()
  const pool = remainingPool(v, me)
  let ids = [...poss.keys()]
  ;[ids, rng] = shuffle(ids, rng)
  // 選擇少的先填
  ids.sort((a, b) => poss.get(a)!.size - poss.get(b)!.size)
  for (const id of ids) {
    const set = poss.get(id)!
    const cands = pool.filter((r) => set.has(r))
    let r: number
    ;[r, rng] = nextRandom(rng)
    let pick: number
    if (cands.length) {
      pick = cands[Math.floor(r * cands.length)]
      pool.splice(pool.indexOf(pick), 1)
    } else {
      const list = [...set]
      pick = list[Math.floor(r * list.length)]
    }
    rank[id] = pick
  }
  return [rank, rng]
}

// ── 在猜好的局面上算 ──

export interface Sim {
  board: number[]
  rank: number[]
  over: Side | -1
}

function sim(s: Sim, from: number, to: number): Sim {
  const board = s.board.slice()
  const a = board[from]
  const d = board[to]
  board[from] = -1
  if (d < 0) {
    board[to] = a
    return { board, rank: s.rank, over: -1 }
  }
  const out = fight(s.rank[a], s.rank[d])
  if (out === 'win') board[to] = a
  else if (out === 'tie') board[to] = -1
  return { board, rank: s.rank, over: s.rank[d] === FLAG ? sideOfId(a) : -1 }
}

const IS_CAMP = Array.from({ length: CELLS }, (_, i) => CAMPS.has(i))
const IS_HQ = Array.from({ length: CELLS }, (_, i) => HQS.has(i))
const IS_RAIL = Array.from({ length: CELLS }, (_, i) => RAIL.has(i))
const mark = new Int32Array(CELLS)
const vis = new Int32Array(CELLS)
let stamp = 0
const queue = new Int32Array(CELLS)

/** 很快地列出 side 能走的步（算的時候用；規則跟 targetsOf 一樣，有測試對照） */
export function movesOf(s: Sim, side: Side): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = []
  const b = s.board
  for (let p = 0; p < CELLS; p++) {
    const id = b[p]
    if (id < 0 || (id < PER_SIDE ? 0 : 1) !== side) continue
    const r = s.rank[id]
    if (r === MINE || r === FLAG || IS_HQ[p]) continue
    stamp++
    mark[p] = stamp
    vis[p] = stamp
    const consider = (q: number) => {
      if (mark[q] === stamp) return
      mark[q] = stamp
      const t = b[q]
      if (t < 0 || ((t < PER_SIDE ? 0 : 1) !== side && !IS_CAMP[q])) out.push({ from: p, to: q })
    }
    for (const q of ROAD_ADJ[p]) consider(q)
    if (!IS_RAIL[p]) continue
    if (r === ENGINEER) {
      // 工兵：鐵路上找路（經過的點要空著）
      let head = 0
      let tail = 0
      queue[tail++] = p
      while (head < tail) {
        const x = queue[head++]
        for (const q of RAIL_ADJ[x]) {
          if (vis[q] === stamp) continue
          vis[q] = stamp
          consider(q)
          if (b[q] < 0) queue[tail++] = q
        }
      }
    } else
      for (const ray of RAIL_RAYS[p])
        for (const q of ray) {
          consider(q)
          if (b[q] >= 0) break
        }
  }
  return out
}

/** 一個點離某一方的底線有多遠（0＝在自己的底線） */
const advance = (at: number, side: Side) => (side === 0 ? 11 - rowOf(at) : rowOf(at))
const manhattan = (a: number, b: number) => Math.abs(rowOf(a) - rowOf(b)) + Math.abs(colOf(a) - colOf(b))

/** 局面裡兩邊的軍旗在哪、各剩幾個地雷（算每顆子的分數要用） */
interface Ctx {
  flags: [number, number]
  mines: [number, number]
}
function ctxOf(s: Sim): Ctx {
  const flags: [number, number] = [-1, -1]
  const mines: [number, number] = [0, 0]
  for (let p = 0; p < CELLS; p++) {
    const id = s.board[p]
    if (id < 0) continue
    const r = s.rank[id]
    if (r === FLAG) flags[sideOfId(id)] = p
    if (r === MINE) mines[sideOfId(id)]++
  }
  return { flags, mines }
}

/** 一顆子在 p 值多少（自己那一方的角度） */
function pieceScore(r: number, side: Side, p: number, c: Ctx, fine: boolean): number {
  let x = VALUE[r] ?? 0
  // 對方還有地雷：工兵比較值錢
  if (r === ENGINEER && c.mines[other(side)]) x += 1.5
  if (r === MINE || r === FLAG) return x
  // 往前推一點點
  x += advance(p, side) * 0.06
  // 進了大本營（不是奪旗）就動不了了
  if (IS_HQ[p]) x -= 2
  // 在行營裡比較安全
  if (IS_CAMP[p]) x += 0.3
  if (fine) {
    const target = c.flags[other(side)]
    if (target >= 0) {
      const d = manhattan(p, target)
      x += Math.max(0, 8 - d) * (r >= BRIGADE ? 0.12 : 0.25)
      // 逼到對方軍旗旁邊：對方很危險
      if (d <= 2) x += (3 - d) * 1.2
    }
  }
  return x
}

/** 局面分數（me 的角度） */
function evaluate(s: Sim, me: Side, fine: boolean, c = ctxOf(s)): number {
  if (s.over >= 0) return s.over === me ? WIN : -WIN
  let v = 0
  for (let p = 0; p < CELLS; p++) {
    const id = s.board[p]
    if (id < 0) continue
    const side = sideOfId(id)
    const x = pieceScore(s.rank[id], side, p, c, fine)
    v += side === me ? x : -x
  }
  return v
}

/** 走一步之後分數變多少（不用整盤重算；奪旗回 null） */
function delta(s: Sim, from: number, to: number, me: Side, c: Ctx, fine: boolean): number | null {
  const a = s.board[from]
  const d = s.board[to]
  const ra = s.rank[a]
  const sa = sideOfId(a)
  const sgn = (side: Side) => (side === me ? 1 : -1)
  let v = -sgn(sa) * pieceScore(ra, sa, from, c, fine)
  if (d < 0) return v + sgn(sa) * pieceScore(ra, sa, to, c, fine)
  const rd = s.rank[d]
  if (rd === FLAG) return null
  const sd = sideOfId(d)
  const out = fight(ra, rd)
  if (out === 'win' || out === 'tie') v -= sgn(sd) * pieceScore(rd, sd, to, c, fine)
  if (out === 'win') v += sgn(sa) * pieceScore(ra, sa, to, c, fine)
  return v
}

/** 碰子的步先算（剪枝比較快） */
function ordered(s: Sim, side: Side): { from: number; to: number }[] {
  const ms = movesOf(s, side)
  return ms.sort((a, b) => Number(s.board[b.to] >= 0) - Number(s.board[a.to] >= 0))
}

/** alpha-beta：side 走，分數一律是 me 的角度 */
function search(s: Sim, depth: number, alpha: number, beta: number, side: Side, me: Side, fine: boolean, ply = 1): number {
  // 越早贏越好（不然奪得到的旗會拖著不奪）
  if (s.over >= 0) return s.over === me ? WIN - ply : -WIN + ply
  if (depth === 0) return evaluate(s, me, fine)
  const moves = ordered(s, side)
  if (!moves.length) return side === me ? -WIN / 2 : WIN / 2
  const max = side === me
  let best = max ? -Infinity : Infinity
  if (depth === 1) {
    // 最後一層：只算這一步讓分數變多少
    const c = ctxOf(s)
    const base = evaluate(s, me, fine, c)
    for (const m of moves) {
      const dv = delta(s, m.from, m.to, me, c, fine)
      const v = dv === null ? (side === me ? WIN - ply - 1 : -WIN + ply + 1) : base + dv
      if (max ? v > best : v < best) best = v
    }
    return best
  }
  for (const m of moves) {
    const v = search(sim(s, m.from, m.to), depth - 1, alpha, beta, other(side), me, fine, ply + 1)
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

/** 在一次猜測的局面上，每一步的分數 */
function scoreMoves(base: Sim, me: Side, moves: { from: number; to: number }[], st: Style): number[] {
  return moves.map(({ from, to }) => search(sim(base, from, to), st.depth - 1, -Infinity, Infinity, other(me), me, st.fine))
}

/** 電腦的佈陣：軍旗在大本營、旁邊用地雷圍起來，炸彈放中間，工兵、大子分散 */
export function aiLayout(rng: RngState, level: CardLevel = 'mid'): [number[], RngState] {
  const out: number[] = Array(PER_SIDE).fill(0)
  const free = new Set(Array.from({ length: PER_SIDE }, (_, k) => k))
  const at = (r: number, c: number) => HOME.findIndex((p) => p === (6 + r) * COLS + c)
  let r: number
  ;[r, rng] = nextRandom(rng)
  const flagCol = r < 0.5 ? 1 : 3
  const put = (k: number, rank: number) => {
    out[k] = rank
    free.delete(k)
  }
  put(at(5, flagCol), FLAG)
  if (level === 'low') {
    // 低：地雷隨便放在最後兩列
    let list: number[]
    ;[list, rng] = shuffle([...free].filter((k) => depthOf(k) >= 4), rng)
    for (const k of list.slice(0, 3)) put(k, MINE)
  } else {
    // 軍旗左右、上面三個地雷
    put(at(5, flagCol - 1), MINE)
    put(at(5, flagCol + 1), MINE)
    put(at(4, flagCol), MINE)
  }
  // 炸彈：第二～四列
  let list: number[]
  ;[list, rng] = shuffle([...free].filter((k) => depthOf(k) >= 1 && depthOf(k) <= 3), rng)
  for (const k of list.slice(0, 2)) put(k, BOMB)
  // 工兵：放在鐵路上（第一列、第五列、左右兩邊）各一個
  const rest = ARMY.filter((x) => x !== FLAG && x !== MINE && x !== BOMB)
  ;[list, rng] = shuffle([...free], rng)
  // 大子不要放在第一列正中間太前面：把大的排在中間幾列（打散）
  const big = rest.filter((x) => x >= DIVISION)
  const small = rest.filter((x) => x < DIVISION)
  const middle = list.filter((k) => depthOf(k) >= 1 && depthOf(k) <= 4)
  for (const x of big) {
    const k = middle.find((m) => free.has(m)) ?? list.find((m) => free.has(m))!
    put(k, x)
  }
  let others: number[]
  ;[others, rng] = shuffle(small, rng)
  for (const k of list) if (free.has(k)) put(k, others.pop()!)
  return [out, rng]
}

/**
 * 電腦這一步。v 一定要是電腦自己看得到的局面（viewFor），不能偷看。
 */
export function chooseJunqiAction(v: JunqiState, level: CardLevel, rng: RngState): [JunqiAction, RngState] {
  const me = v.turn
  const st = JUNQI_STYLE[level]
  if (v.phase === 'deploy') {
    const [layout, next] = aiLayout(rng, level)
    return [{ type: 'deploy', side: me, layout }, next]
  }
  const moves = legalMoves(v, me)
  if (!moves.length) return [{ type: 'timeout' }, rng]
  const poss = possibleRanks(v, me)
  const total = moves.map(() => 0)
  for (let k = 0; k < st.samples; k++) {
    let rank: number[]
    ;[rank, rng] = determinize(v, me, rng, poss)
    const scores = scoreMoves({ board: v.board, rank, over: -1 }, me, moves, st)
    scores.forEach((x, i) => (total[i] += x / st.samples))
  }
  const scored = moves.map((m, i) => ({ m, v: total[i] }))
  for (const x of scored) {
    let r: number
    ;[r, rng] = nextRandom(rng)
    x.v += r * st.noise
  }
  scored.sort((a, b) => b.v - a.v)
  let r: number
  ;[r, rng] = nextRandom(rng)
  if (st.whim > 0 && r < st.whim) {
    ;[r, rng] = nextRandom(rng)
    const k = Math.floor(r * Math.min(st.pool, scored.length))
    return [{ type: 'move', ...scored[k].m }, rng]
  }
  return [{ type: 'move', ...scored[0].m }, rng]
}


/** 測試、模擬用：兩邊照難度下到結束（每一邊都只看自己看得到的局面） */
export function playOut(s: JunqiState, levels: [CardLevel, CardLevel], rng: RngState): [JunqiState, RngState] {
  let st = s
  while (st.status === 'playing') {
    let a: JunqiAction
    ;[a, rng] = chooseJunqiAction(viewFor(st, st.turn), levels[st.turn], rng)
    const res = applyJunqi(st, a)
    if (!res.ok) throw new Error(res.reason)
    st = res.state
  }
  return [st, rng]
}
