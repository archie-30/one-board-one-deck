// 點格棋的電腦。只看棋盤（點格棋沒有藏起來的資訊）。
// 低：能吃常常不吃、常亂畫第三邊送格子給對方。
// 中：能吃就吃；有「安全的線」（畫了不會讓任何一格變三邊）就畫安全的；沒得躲了就送最少格子的那一串。
// 高：中的全部，再加上「鏈的控制」：
//   - 沒安全線時，把剩下的格子看成一串一串的鏈（兩頭開口）和圈（頭尾相接），
//     用遞迴算出開哪一串最划算（endgame）；
//   - 吃對方送來的鏈時，最後兩格可以「不吃」：畫遠端那條線把兩格送回去（留兩格），
//     逼對方再開下一串，搶回控制權（double-dealing）；
//   - 剩下的安全線不多時，往後算到沒有安全線為止，挑對自己有利的那一條（爭奇偶）。
import { nextRandom, type RngState } from '../common/rng'
import { applyDots, boxesOf, captures, edgesOf, isSafe, openLines, sidesDrawn, type DotsAction, type DotsState } from './rules'

export type DotsLevel = 'low' | 'mid' | 'high'

/** 還沒圍住的格子分成一塊一塊：鏈（chain）或圈（loop），大小是格子數 */
export interface Part {
  loop: boolean
  size: number
  boxes: number[]
}

/** 把還沒圍住的格子照「沒畫的線」連成一塊一塊（畫面外圍不算連通） */
export function partsOf(s: Pick<DotsState, 'n' | 'lines' | 'boxes'>): Part[] {
  const n = s.n
  const seen = new Set<number>()
  const parts: Part[] = []
  for (let b0 = 0; b0 < n * n; b0++) {
    if (s.boxes[b0] >= 0 || seen.has(b0)) continue
    const stack = [b0]
    seen.add(b0)
    const boxes: number[] = []
    let toGround = 0
    let junction = false
    while (stack.length) {
      const b = stack.pop()!
      boxes.push(b)
      const open = edgesOf(n, b).filter((e) => !s.lines[e])
      if (open.length !== 2) junction = true
      for (const e of open) {
        const nb = boxesOf(n, e).find((x) => x !== b)
        if (nb === undefined) toGround++
        else if (s.boxes[nb] < 0 && !seen.has(nb)) {
          seen.add(nb)
          stack.push(nb)
        }
      }
    }
    parts.push({ loop: !junction && toGround === 0 && boxes.length >= 4, size: boxes.length, boxes })
  }
  return parts
}

/**
 * 只剩鏈和圈、輪到的人一定要開一串時：輪到的人最後能比對方多拿幾格（照雙方都下得最好）。
 * 開一串鏈（k 格）：對方可以全吃（k 格，然後換他開下一串），或吃到剩 2 格送回來（k ≥ 2，逼你再開）；
 * 開一個圈（k 格）：全吃，或吃到剩 4 格送回來。
 */
const memo = new Map<string, number>()
export function endgame(parts: readonly Pick<Part, 'loop' | 'size'>[]): number {
  if (!parts.length) return 0
  const key = parts
    .map((p) => (p.loop ? 'L' : 'C') + p.size)
    .sort()
    .join(',')
  const hit = memo.get(key)
  if (hit !== undefined) return hit
  let best = -Infinity
  const tried = new Set<string>()
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]
    const id = (p.loop ? 'L' : 'C') + p.size
    if (tried.has(id)) continue
    tried.add(id)
    const rest = endgame(parts.filter((_, j) => j !== i))
    best = Math.max(best, -reply(p, rest))
  }
  if (memo.size > 50000) memo.clear()
  memo.set(key, best)
  return best
}
/** 對方開了 p 這一串、剩下的價值是 rest（對「接下來要開的人」而言）：接手的人最多能淨賺幾格 */
function reply(p: Pick<Part, 'loop' | 'size'>, rest: number): number {
  const k = p.size
  const takeAll = k + rest
  if (p.loop) return k >= 4 ? Math.max(takeAll, k - 8 - rest) : takeAll
  return k >= 2 ? Math.max(takeAll, k - 4 - rest) : takeAll
}

const pick = <T>(list: readonly T[], rng: RngState): [T, RngState] => {
  const [r, next] = nextRandom(rng)
  return [list[Math.floor(r * list.length)], next]
}
const line = (l: number): DotsAction => ({ type: 'line', line: l })

/**
 * 「留兩格」的時機：a 這格三邊（e1 是它最後一條邊），隔著 e1 的 b 格兩邊，
 * b 的另一條沒畫的邊 e2 通到外面（或通到一格不會因此變三邊的格子）——
 * 這時畫 e2 就把 a、b 兩格一起送給對方（對方畫 e1 一次拿兩格）。回傳 e2，不是這種情況回 -1。
 */
function declineEdge(s: DotsState, e1: number): number {
  const bs = boxesOf(s.n, e1)
  const a = bs.find((x) => s.boxes[x] < 0 && sidesDrawn(s, x) === 3)
  const b = bs.find((x) => x !== a)
  if (a === undefined || b === undefined || s.boxes[b] >= 0 || sidesDrawn(s, b) !== 2) return -1
  const e2 = edgesOf(s.n, b).find((e) => e !== e1 && !s.lines[e])
  if (e2 === undefined) return -1
  const c = boxesOf(s.n, e2).find((x) => x !== b)
  if (c !== undefined && (s.boxes[c] >= 0 || sidesDrawn(s, c) >= 2)) return -1
  return e2
}

/** 一直吃到不能吃為止（模擬用） */
function eatAll(s: DotsState): DotsState {
  let cur = s
  for (let guard = 0; guard < 200; guard++) {
    const l = openLines(cur).find((x) => captures(cur, x))
    if (l === undefined) return cur
    const r = applyDots(cur, line(l))
    if (!r.ok) return cur
    cur = r.state
  }
  return cur
}

/** 剩下的安全線不多時：往後算到沒有安全線，回傳輪到的人的淨賺格數 */
function safeSearch(s: DotsState, budget: { left: number }, memoS: Map<string, number>): number {
  const key = s.lines.join('')
  const hit = memoS.get(key)
  if (hit !== undefined) return hit
  budget.left--
  const safe = openLines(s).filter((l) => isSafe(s, l))
  let v: number
  if (!safe.length || budget.left <= 0) v = endgame(partsOf(s))
  else {
    v = -Infinity
    for (const l of safe) {
      const r = applyDots(s, line(l))
      if (!r.ok) continue
      v = Math.max(v, -safeSearch(r.state, budget, memoS))
      if (budget.left <= 0) break
    }
  }
  memoS.set(key, v)
  return v
}

/** 沒安全線時要開哪一串：回傳要畫的線 */
function openPart(s: DotsState, parts: Part[], level: DotsLevel, rng: RngState): [number, RngState] {
  let chosen: Part
  if (level === 'high') {
    let best = -Infinity
    chosen = parts[0]
    parts.forEach((p, i) => {
      const v = -reply(p, endgame(parts.filter((_, j) => j !== i)))
      if (v > best || (v === best && p.size < chosen.size)) ((best = v), (chosen = p))
    })
  } else chosen = parts.reduce((a, b) => (b.size < a.size ? b : a))
  const inside = new Set(chosen.boxes)
  const edges = [...new Set(chosen.boxes.flatMap((b) => edgesOf(s.n, b)))].filter((e) => !s.lines[e])
  // 兩格的鏈：畫中間那條（兩格各自三邊，對方沒辦法留兩格送回來）
  if (chosen.size === 2 && !chosen.loop) {
    const mid = edges.find((e) => boxesOf(s.n, e).every((b) => inside.has(b)))
    if (mid !== undefined) return [mid, rng]
  }
  // 其他：從一頭開（通到外面的那條，或隨便一條）
  const end = edges.filter((e) => boxesOf(s.n, e).length === 1)
  return pick(end.length ? end : edges, rng)
}

export function chooseDotsAction(s: DotsState, level: DotsLevel, rng: RngState): [DotsAction, RngState] {
  const open = openLines(s)
  if (!open.length) return [{ type: 'timeout' }, rng]
  let r: number
  const caps = open.filter((l) => captures(s, l))
  const safe = open.filter((l) => !captures(s, l) && isSafe(s, l))

  // ── 有格子可以吃 ──
  if (caps.length) {
    if (level === 'low') {
      ;[r, rng] = nextRandom(rng)
      if (r < 0.65 || !safe.length) {
        const [l, n2] = pick(caps, rng)
        return [line(l), n2]
      }
      const [l, n2] = pick(safe, rng)
      return [line(l), n2]
    }
    // 一次拿兩格的先拿
    const double = caps.find((l) => boxesOf(s.n, l).filter((b) => s.boxes[b] < 0 && sidesDrawn(s, b) === 3).length === 2)
    if (double !== undefined) return [line(double), rng]
    if (level === 'high') {
      // 不是「最後兩格」的先吃；只剩最後兩格時才決定要不要留兩格
      const plain = caps.filter((l) => declineEdge(s, l) < 0)
      if (plain.length) return [line(plain[0]), rng]
      const e1 = caps[0]
      const e2 = declineEdge(s, e1)
      // 全吃完之後：還有安全線就全吃；只剩鏈和圈就比「全吃（然後我開）」和「留兩格（對方開）」
      const after = eatAll(s)
      const restSafe = openLines(after).some((l) => isSafe(after, l))
      if (!restSafe && openLines(after).length) {
        const v = endgame(partsOf(after))
        if (-2 - v > 2 + v) return [line(e2), rng]
      }
      return [line(e1), rng]
    }
    return [line(caps[0]), rng]
  }

  // ── 沒得吃：有安全線就畫安全的 ──
  if (safe.length) {
    if (level === 'low') {
      ;[r, rng] = nextRandom(rng)
      if (r < 0.3) {
        const [l, n2] = pick(open, rng)
        return [line(l), n2]
      }
    }
    if (level === 'high' && safe.length <= 12) {
      const budget = { left: 6000 }
      const memoS = new Map<string, number>()
      let best = -Infinity
      let bestL: number[] = []
      for (const l of safe) {
        const res = applyDots(s, line(l))
        if (!res.ok) continue
        const v = -safeSearch(res.state, budget, memoS)
        if (v > best) ((best = v), (bestL = [l]))
        else if (v === best) bestL.push(l)
      }
      if (budget.left > 0 && bestL.length) {
        const [l, n2] = pick(bestL, rng)
        return [line(l), n2]
      }
    }
    const [l, n2] = pick(safe, rng)
    return [line(l), n2]
  }

  // ── 沒有安全線：一定要送格子給對方 ──
  if (level === 'low') {
    const [l, n2] = pick(open, rng)
    return [line(l), n2]
  }
  const [l, n2] = openPart(s, partsOf(s), level, rng)
  return [line(l), n2]
}
