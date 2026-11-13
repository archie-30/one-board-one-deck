// 隨機試下（蒙地卡羅）：從目前的局面亂下到底很多次，統計每一點最後屬於誰。
// 用來在終局時判斷死棋，也給 AI 估計形勢。為了速度用陣列直接操作，不經過 rules.ts 的物件。
import { nextRandom, type RngState } from '../common/rng'
import { groupAt, type GoState, type Point } from './rules'

interface Board {
  size: number
  n: number
  cells: Int8Array
  adj: Int16Array
  mark: Int32Array
  stamp: number
  /** 最近一次只提一顆子時，那顆子的位置 */
  lastCap: number
}

function makeBoard(state: GoState): Board {
  const size = state.size
  const n = size * size
  const adj = new Int16Array(n * 4).fill(-1)
  for (let i = 0; i < n; i++) {
    const x = i % size
    const y = (i - x) / size
    if (x > 0) adj[i * 4] = i - 1
    if (x < size - 1) adj[i * 4 + 1] = i + 1
    if (y > 0) adj[i * 4 + 2] = i - size
    if (y < size - 1) adj[i * 4 + 3] = i + size
  }
  return { size, n, cells: Int8Array.from(state.board), adj, mark: new Int32Array(n), stamp: 1, lastCap: -1 }
}

/** 這塊棋有沒有氣（找到一口就停） */
function hasLiberty(b: Board, start: number, stones: number[] | null): boolean {
  const color = b.cells[start]
  const stamp = ++b.stamp
  const stack = [start]
  b.mark[start] = stamp
  let free = false
  while (stack.length) {
    const i = stack.pop()!
    if (stones) stones.push(i)
    for (let k = 0; k < 4; k++) {
      const m = b.adj[i * 4 + k]
      if (m < 0) continue
      const v = b.cells[m]
      if (v === 0) {
        free = true
        if (!stones) return true
      } else if (v === color && b.mark[m] !== stamp) {
        b.mark[m] = stamp
        stack.push(m)
      }
    }
  }
  return free
}

function isEyeOf(b: Board, i: number, color: number): boolean {
  for (let k = 0; k < 4; k++) {
    const m = b.adj[i * 4 + k]
    if (m >= 0 && b.cells[m] !== color) return false
  }
  return true
}

/** 下一手（隨機試下用）：成功回傳提子數，不合法回傳 -1 並還原 */
function place(b: Board, i: number, color: number, ko: number): number {
  if (b.cells[i] !== 0 || i === ko) return -1
  b.cells[i] = color
  const opp = 3 - color
  let taken = 0
  for (let k = 0; k < 4; k++) {
    const m = b.adj[i * 4 + k]
    if (m < 0 || b.cells[m] !== opp) continue
    // 先用「找到一口氣就停」的快速檢查，真的沒氣才去收整塊棋
    if (hasLiberty(b, m, null)) continue
    const stones: number[] = []
    if (!hasLiberty(b, m, stones)) {
      for (const s of stones) b.cells[s] = 0
      taken += stones.length
      b.lastCap = stones[0]
    }
  }
  if (taken === 0 && !hasLiberty(b, i, null)) {
    b.cells[i] = 0
    return -1
  }
  return taken
}

/** 跑 playouts 次，回傳每一點的「黑方擁有率」（-1 全白 … +1 全黑） */
export function ownership(state: GoState, playouts: number, rng: RngState, first: number = state.turn): [Float32Array, RngState] {
  const base = makeBoard(state)
  const own = new Float32Array(base.n)
  const empties: number[] = []
  for (let p = 0; p < playouts; p++) {
    const b: Board = { ...base, cells: base.cells.slice(), mark: base.mark, stamp: base.stamp }
    let color = first
    let passes = 0
    let ko = -1
    const limit = b.n * 3
    for (let move = 0; move < limit && passes < 2; move++) {
      empties.length = 0
      for (let i = 0; i < b.n; i++) if (b.cells[i] === 0 && !isEyeOf(b, i, color)) empties.push(i)
      let r: number
      ;[r, rng] = nextRandom(rng)
      let played = false
      const start = Math.floor(r * empties.length)
      for (let k = 0; k < empties.length; k++) {
        const i = empties[(start + k) % empties.length]
        const taken = place(b, i, color, ko)
        if (taken < 0) continue
        ko = -1
        if (taken === 1) {
          // 只提一顆、而且下的這顆是只剩一口氣的單子 → 對方下一手不能馬上提回來（簡化的打劫）
          let libs = 0
          let friends = 0
          for (let j = 0; j < 4; j++) {
            const m = b.adj[i * 4 + j]
            if (m < 0) continue
            if (b.cells[m] === 0) libs++
            else if (b.cells[m] === color) friends++
          }
          if (libs === 1 && friends === 0) ko = b.lastCap
        }
        played = true
        break
      }
      passes = played ? 0 : passes + 1
      color = 3 - color
    }
    base.stamp = b.stamp
    for (let i = 0; i < b.n; i++) {
      let v = b.cells[i]
      if (v === 0) {
        if (isEyeOf(b, i, 1)) v = 1
        else if (isEyeOf(b, i, 2)) v = 2
      }
      if (v === 1) own[i] += 1
      else if (v === 2) own[i] -= 1
    }
  }
  for (let i = 0; i < base.n; i++) own[i] /= playouts
  return [own, rng]
}

/** 終局判斷死棋：一塊棋在隨機試下裡被吃掉的次數比活下來多，就當作死棋 */
export function estimateDead(state: GoState, rng: RngState, playouts?: number): [number[], RngState] {
  const count = playouts ?? (state.size <= 9 ? 160 : state.size <= 13 ? 100 : 60)
  // 一半先讓黑下、一半先讓白下，避免「誰先下」的優勢影響判斷
  let a: Float32Array
  let b: Float32Array
  ;[a, rng] = ownership(state, Math.ceil(count / 2), rng, 1)
  ;[b, rng] = ownership(state, Math.ceil(count / 2), rng, 2)
  const own = a.map((v, i) => (v + b[i]) / 2)
  const dead: number[] = []
  const seen = new Set<number>()
  state.board.forEach((v: Point, i: number) => {
    if (v === 0 || seen.has(i)) return
    const g = groupAt(state.board, state.size, i)
    g.stones.forEach((s) => seen.add(s))
    const sign = v === 1 ? 1 : -1
    const avg = g.stones.reduce((t, s) => t + own[s] * sign, 0) / g.stones.length
    // 這塊棋的位置被對方佔走的次數比自己多 → 死棋
    if (avg < 0) dead.push(...g.stones)
  })
  return [dead.sort((a, b) => a - b), rng]
}
