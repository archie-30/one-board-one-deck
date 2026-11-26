// 海克斯的電腦。只看棋盤（海克斯沒有藏起來的資訊）。
//   - 每一級都會：能一步連通就直接贏；對方下一步就能連通就擋（低偶爾漏看）。
//   - 低：算「離連通還差幾格」（最短路，自己的子不用錢、空格 1、對方的子不能走），只看這一步，常亂下。
//   - 中：同樣只看一步，但挑得認真，偶爾失誤。
//   - 高：「隨機下滿」很多次（把空格亂數分給兩邊直到下滿，看誰連通），統計每一格是自己的時候贏的比例，挑最高的；
//         再加上「保橋」：自己兩顆子之間有兩個共同的空格（橋），對方佔了其中一格就補另一格。
//   - 挑戰：「電阻評估」——把棋盤當電路（自己的子是導線、空格是電阻、對方的子斷路），算兩邊各自連通有多容易；
//         看自己前 8 名的步、每一步再看對方最好的 12 個回應，挑最壞情況最好的（往後想兩步），不失誤。
//   實測（電腦互下 20 局，第一手隨機下在外圈、同一個開局換邊各下一次）：挑戰對高 13 勝、高對中 20 勝、中對低 14 勝；挑戰一步最久約 0.2 秒（電腦上）。
//   試過但沒變強的：隨機下滿次數加倍、樹搜尋（MCTS＋RAVE）、只看一步的電阻評估（都約 50%）。
// 交換規則：電腦當藍方時，紅方第一手下在外圈以外（中間的好點）就交換；電腦當紅方時，第一手不下太好的中間點（下靠邊的位置）。
import { nextRandom, type RngState } from '../common/rng'
import type { Level } from '../common/difficulty'
import { applyHex, canSwap, connection, emptyCells, neighbors, type HexAction, type HexState, type Side } from './rules'

const other = (s: Side): Side => (s === 0 ? 1 : 0)

/**
 * 離連通還差幾格：自己的子 0、空格 1、對方的子走不過去（0-1 BFS）。走不通回傳很大的數。
 * 也順便算「兩邊的距離加起來最小」的格子是哪些（最短路經過的空格），候選用。
 */
export function distance(n: number, cells: readonly number[], side: Side): number {
  const nb = neighbors(n)
  const INF = 1e6
  const dist = new Int32Array(n * n).fill(INF)
  const dq: number[] = []
  let head = 0
  // 用兩段陣列模擬雙向佇列：front（0 費用）往前塞
  const front: number[] = []
  for (let k = 0; k < n; k++) {
    const i = side === 0 ? k : k * n
    const v = cells[i]
    if (v === other(side)) continue
    const d = v === side ? 0 : 1
    if (d < dist[i]) {
      dist[i] = d
      if (d === 0) front.push(i)
      else dq.push(i)
    }
  }
  let best = INF
  for (;;) {
    let i: number
    if (front.length) i = front.pop()!
    else if (head < dq.length) i = dq[head++]
    else break
    const d = dist[i]
    if (d >= best) continue
    if (side === 0 ? Math.floor(i / n) === n - 1 : i % n === n - 1) {
      best = Math.min(best, d)
      continue
    }
    for (const j of nb[i]) {
      const v = cells[j]
      if (v === other(side)) continue
      const nd = d + (v === side ? 0 : 1)
      if (nd < dist[j]) {
        dist[j] = nd
        if (v === side) front.push(j)
        else dq.push(j)
      }
    }
  }
  return best
}

/**
 * 電阻評估：把棋盤想成電路，自己的子幾乎是導線（電阻 0.01）、空格電阻 1、對方的子斷路；
 * 從自己的起點邊通電到終點邊，算出整片的等效電阻（共軛梯度法解電位）。電阻越小＝越容易連通。
 */
export function resistance(n: number, cells: readonly number[], side: Side): number {
  const N = n * n
  const nb = neighbors(n)
  const r = new Float64Array(N)
  const alive = new Uint8Array(N)
  for (let i = 0; i < N; i++) {
    const v = cells[i]
    if (v === other(side)) continue
    alive[i] = 1
    r[i] = v === side ? 0.01 : 1
  }
  // 對角項 diag 與右手邊 b（起點邊接 1 伏特、終點邊接地）
  const diag = new Float64Array(N)
  const b = new Float64Array(N)
  for (let i = 0; i < N; i++) {
    if (!alive[i]) continue
    let d = 0
    for (const j of nb[i]) if (alive[j]) d += 1 / (r[i] + r[j])
    if (onStartSide(n, side, i)) {
      const g = 1 / r[i]
      d += g
      b[i] += g
    }
    if (onEndSide(n, side, i)) d += 1 / r[i]
    diag[i] = d
  }
  const mul = (x: Float64Array, out: Float64Array) => {
    for (let i = 0; i < N; i++) {
      if (!alive[i]) {
        out[i] = 0
        continue
      }
      let v = diag[i] * x[i]
      for (const j of nb[i]) if (alive[j]) v -= x[j] / (r[i] + r[j])
      out[i] = v
    }
  }
  // 共軛梯度（加上對角前處理）
  const x = new Float64Array(N)
  const res = b.slice()
  const z = new Float64Array(N)
  for (let i = 0; i < N; i++) z[i] = alive[i] && diag[i] ? res[i] / diag[i] : 0
  const p = z.slice()
  const Ap = new Float64Array(N)
  let rz = 0
  for (let i = 0; i < N; i++) rz += res[i] * z[i]
  for (let it = 0; it < 200 && rz > 1e-12; it++) {
    mul(p, Ap)
    let pAp = 0
    for (let i = 0; i < N; i++) pAp += p[i] * Ap[i]
    if (pAp <= 0) break
    const alpha = rz / pAp
    for (let i = 0; i < N; i++) {
      x[i] += alpha * p[i]
      res[i] -= alpha * Ap[i]
    }
    let rz2 = 0
    for (let i = 0; i < N; i++) {
      z[i] = alive[i] && diag[i] ? res[i] / diag[i] : 0
      rz2 += res[i] * z[i]
    }
    const beta = rz2 / rz
    rz = rz2
    for (let i = 0; i < N; i++) p[i] = z[i] + beta * p[i]
  }
  // 從起點邊流進來的電流
  let current = 0
  for (let i = 0; i < N; i++) if (alive[i] && onStartSide(n, side, i)) current += (1 - x[i]) / r[i]
  return current > 1e-9 ? 1 / current : 1e6
}
const onStartSide = (n: number, side: Side, i: number) => (side === 0 ? i < n : i % n === 0)
const onEndSide = (n: number, side: Side, i: number) => (side === 0 ? i >= n * (n - 1) : i % n === n - 1)

/** 電阻評估：log(對方電阻／自己電阻)，越大對自己越有利 */
export function resistEval(n: number, cells: readonly number[], side: Side): number {
  return Math.log(resistance(n, cells, other(side)) / resistance(n, cells, side))
}

/** 下在 cell 之後：對方的距離 − 自己的距離（越大越好） */
function evalMove(s: HexState, cell: number, side: Side): number {
  const cells = s.cells.slice()
  cells[cell] = side
  const mine = distance(s.n, cells, side)
  const theirs = distance(s.n, cells, other(side))
  return theirs - mine * 1.05
}

/** 一步就連通的空格 */
function winningCells(s: HexState, side: Side): number[] {
  const out: number[] = []
  const cells = s.cells.slice()
  for (const i of emptyCells(s)) {
    cells[i] = side
    if (connection(s.n, cells, side)) out.push(i)
    cells[i] = -1
  }
  return out
}

/** 保橋：對方剛下的那一格是不是插進自己的橋（兩顆子、或子和自己的邊，共同的兩個空格之一），是的話回傳另一格 */
export function bridgeSave(s: HexState, side: Side): number | null {
  const last = s.last
  if (!last || last.side === side || last.cell < 0 || last.from !== undefined) return null
  const n = s.n
  const nb = neighbors(n)
  const L = last.cell
  // 自己的「點」：鄰近的自己的子，以及兩條邊（-1 起點邊、-2 終點邊）
  const nodes: number[] = nb[L].filter((j) => s.cells[j] === side)
  if (side === 0 ? Math.floor(L / n) === 0 : L % n === 0) nodes.push(-1)
  if (side === 0 ? Math.floor(L / n) === n - 1 : L % n === n - 1) nodes.push(-2)
  const nbOf = (a: number): number[] => {
    if (a >= 0) return nb[a]
    const out: number[] = []
    for (let k = 0; k < n; k++) {
      const edgeIdx = a === -1 ? 0 : n - 1
      out.push(side === 0 ? edgeIdx * n + k : k * n + edgeIdx)
    }
    return out
  }
  for (let x = 0; x < nodes.length; x++) {
    for (let y = x + 1; y < nodes.length; y++) {
      const A = nodes[x]
      const B = nodes[y]
      if (A >= 0 && B >= 0 && nb[A].includes(B)) continue
      const setB = new Set(nbOf(B))
      const common = nbOf(A).filter((c) => setB.has(c))
      if (common.length !== 2 || !common.includes(L)) continue
      const o = common[0] === L ? common[1] : common[0]
      if (s.cells[o] < 0) return o
    }
  }
  return null
}

/** 小型亂數（隨機下滿用，要很快）；種子從遊戲的亂數來，所以照樣能重播 */
function xorshift(seed: number) {
  let x = seed >>> 0 || 0x9e3779b9
  return () => {
    x ^= x << 13
    x >>>= 0
    x ^= x >>> 17
    x ^= x << 5
    x >>>= 0
    return x / 4294967296
  }
}

/** 隨機下滿 k 次：每一格「是自己的時候贏了幾次／是自己的幾次」 */
function fillStats(s: HexState, side: Side, k: number, rand: () => number): Float64Array {
  const n = s.n
  const empties = emptyCells(s)
  const m = empties.length
  const wins = new Float64Array(n * n)
  const owns = new Float64Array(n * n)
  const cells = s.cells.slice()
  const order = empties.slice()
  const mineCount = Math.ceil(m / 2)
  for (let t = 0; t < k; t++) {
    // 洗牌：前一半（輪到的人多一顆）給自己
    for (let i = m - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      const tmp = order[i]
      order[i] = order[j]
      order[j] = tmp
    }
    for (let i = 0; i < m; i++) cells[order[i]] = i < mineCount ? side : other(side)
    const won = connection(n, cells, side) !== null
    for (let i = 0; i < mineCount; i++) {
      owns[order[i]]++
      if (won) wins[order[i]]++
    }
  }
  const rate = new Float64Array(n * n).fill(-1)
  for (const i of empties) rate[i] = owns[i] ? wins[i] / owns[i] : 0
  return rate
}

/** 電阻評估挑一步：先看自己每一步（1 步）；depth 2 時前 8 名再看對方最好的 8 個回應（取最壞的） */
function resistPick(s: HexState, side: Side, depth: number): number {
  const n = s.n
  const cells = s.cells.slice()
  const score = (c: number[], who: Side) => resistEval(n, c, who)
  const first = emptyCells(s).map((cell) => {
    cells[cell] = side
    const v = score(cells, side)
    cells[cell] = -1
    return { cell, v }
  })
  first.sort((a, b) => b.v - a.v)
  if (depth < 2) return first[0].cell
  let best = first[0].cell
  let bestV = -Infinity
  for (const f of first.slice(0, 8)) {
    cells[f.cell] = side
    // 對方的回應只看最短路分數前 12 名（全部都算電阻太慢）
    const after: HexState = { ...s, cells: cells.slice(), turn: other(side) }
    const cand = emptyCells(after)
      .map((cell) => ({ cell, v: evalMove(after, cell, other(side)) }))
      .sort((a, b) => b.v - a.v)
      .slice(0, 12)
      .map((x) => x.cell)
    const replies = cand.map((cell) => {
      cells[cell] = other(side)
      const v = score(cells, side)
      cells[cell] = -1
      return v
    })
    cells[f.cell] = -1
    const worst = Math.min(...replies)
    if (worst > bestV) {
      bestV = worst
      best = f.cell
    }
  }
  return best
}

interface Style {
  /** 隨機下滿幾次（0＝只看最短路） */
  fills: number
  /** 亂挑的機率、亂挑時從前幾名裡挑 */
  whim: number
  pool: number
  /** 擋對方一步連通時漏看的機率 */
  blind: number
  /** 保橋 */
  bridge: boolean
  /** 電阻評估往後看幾步（0＝不用；2＝看自己前 8 名、再看對方最好的 12 個回應，取最壞的） */
  resist: number
}
export const HEX_STYLE: Record<Level, Style> = {
  low: { fills: 0, whim: 0.45, pool: 8, blind: 0.35, bridge: false, resist: 0 },
  mid: { fills: 0, whim: 0.12, pool: 3, blind: 0.05, bridge: false, resist: 0 },
  high: { fills: 1500, whim: 0, pool: 1, blind: 0, bridge: true, resist: 0 },
  master: { fills: 0, whim: 0, pool: 1, blind: 0, bridge: true, resist: 2 },
}

export function chooseHexAction(s: HexState, level: Level, rng: RngState): [HexAction, RngState] {
  const st = HEX_STYLE[level]
  const side = s.turn
  const n = s.n
  let r: number
  const rand = () => {
    ;[r, rng] = nextRandom(rng)
    return r
  }
  const empties = emptyCells(s)
  if (!empties.length) return [{ type: 'timeout' }, rng]
  const center = Math.floor(n / 2) * n + Math.floor(n / 2)
  const ring = (i: number) => {
    const rr = Math.floor(i / n)
    const cc = i % n
    return rr === 0 || cc === 0 || rr === n - 1 || cc === n - 1
  }

  // 交換規則
  if (canSwap(s)) {
    const first = s.cells.indexOf(0)
    const want = !ring(first)
    if (level === 'low' ? rand() < 0.5 : want) return [{ type: 'swap' }, rng]
  }
  // 第一手
  if (empties.length === n * n) {
    if (s.swapRule) {
      // 有交換規則：下在邊上（不會被換走、也不會太差）
      const c = 1 + Math.floor(rand() * (n - 2))
      return [{ type: 'place', cell: c }, rng]
    }
    if (level !== 'low') return [{ type: 'place', cell: center }, rng]
  }

  // 一步就贏
  const win = winningCells(s, side)
  if (win.length) return [{ type: 'place', cell: win[0] }, rng]
  // 擋對方一步就連通
  const threat = winningCells(s, other(side))
  if (threat.length && rand() >= st.blind) return [{ type: 'place', cell: threat[0] }, rng]
  // 保橋
  if (st.bridge) {
    const save = bridgeSave(s, side)
    if (save !== null) return [{ type: 'place', cell: save }, rng]
  }

  if (st.resist > 0) return [{ type: 'place', cell: resistPick(s, side, st.resist) }, rng]
  let scored: { cell: number; v: number }[]
  if (st.fills > 0) {
    const seedVal = Math.floor(rand() * 4294967296)
    const rate = fillStats(s, side, st.fills, xorshift(seedVal))
    scored = empties.map((cell) => ({ cell, v: rate[cell] }))
  } else {
    // 只看最短路：候選是離現有棋子近的空格（棋盤空時就中間附近）
    const nb = neighbors(n)
    const near = new Set<number>()
    for (let i = 0; i < n * n; i++) if (s.cells[i] >= 0) for (const j of nb[i]) if (s.cells[j] < 0) for (const k of [j, ...nb[j]]) if (s.cells[k] < 0) near.add(k)
    const cand = near.size ? [...near] : empties
    scored = cand.map((cell) => ({ cell, v: evalMove(s, cell, side) + rand() * 0.3 - Math.abs((cell % n) - n / 2) * 0.002 - Math.abs(Math.floor(cell / n) - n / 2) * 0.002 }))
  }
  scored.sort((a, b) => b.v - a.v)
  if (st.whim > 0 && rand() < st.whim) {
    const k = Math.floor(rand() * Math.min(st.pool, scored.length))
    return [{ type: 'place', cell: scored[k].cell }, rng]
  }
  return [{ type: 'place', cell: scored[0].cell }, rng]
}

/** 測試、模擬用：照兩邊的難度下到結束 */
export function playOut(s: HexState, levels: [Level, Level], rng: RngState): [HexState, RngState] {
  let st = s
  while (st.status === 'playing') {
    let a: HexAction
    ;[a, rng] = chooseHexAction(st, levels[st.turn], rng)
    const r = applyHex(st, a)
    if (!r.ok) throw new Error(r.reason)
    st = r.state
  }
  return [st, rng]
}
