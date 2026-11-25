// 蜘蛛接龍的解題器：給一個局面，找一串能過關的步（找不到或試太多就放棄）。
// 用在「只發解得開的牌」：2 種、4 種花色的牌事先用這個找出一批解得開的發牌（scripts/find-spider-deals.ts），
// 存在 data/spiderDeals.ts；遊戲從裡面挑一副、再把花色隨機換一換（換花色不影響解不解得開）。
// 做法：深度優先，好的步先試（接到同花色、翻開蓋著的牌、空出一疊），走過的局面不再走；沒步了才發牌。
import { applySpider, cardsAt, canPlace, COLS, createSpider, spiderFaces, suitAt, valueAt, type SpiderAction, type SpiderState, type SuitCount } from './rules'
import { nextInt, seedRng, type RngState } from '../common/rng'

function keyOf(s: SpiderState): string {
  // 很多局面要記：只存一個 53 位元的雜湊（FNV），撞到的機率可以忽略（真的撞到也只是少試一條路，找到的解會照實重播驗證）
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  const mix = (x: number) => {
    h1 = Math.imul(h1 ^ x, 0x01000193)
    h2 = Math.imul(h2 ^ x, 0x5bd1e995)
  }
  mix(s.stock.length)
  mix(s.done.length)
  for (const c of s.tableau) {
    mix(500 + c.down.length)
    for (const x of c.up) mix(s.faces[x])
  }
  return `${h1 >>> 0}:${h2 >>> 0}`
}

/** 某一疊最上面那一整串（同花色連續）從第幾張開始 */
function runStartOf(s: SpiderState, col: number): number {
  const up = s.tableau[col].up
  let k = up.length - 1
  while (k > 0 && suitAt(s, up[k - 1]) === suitAt(s, up[k]) && valueAt(s, up[k - 1]) === valueAt(s, up[k]) + 1) k--
  return k
}

/** 露出 card 之後，別疊最上面那一串的開頭有沒有同花色、點數小 1 的牌可以接上來 */
function wanted(s: SpiderState, card: number, except: number): boolean {
  for (let j = 0; j < COLS; j++) {
    if (j === except || !s.tableau[j].up.length) continue
    const first = s.tableau[j].up[runStartOf(s, j)]
    if (suitAt(s, first) === suitAt(s, card) && valueAt(s, first) === valueAt(s, card) - 1) return true
  }
  return false
}

/** 這個局面可以試的步（白搬的先拿掉） */
function candidates(s: SpiderState): SpiderAction[] {
  const out: SpiderAction[] = []
  const empty = s.tableau.findIndex((c) => !c.up.length && !c.down.length)
  for (let i = 0; i < COLS; i++) {
    const c = s.tableau[i]
    if (!c.up.length) continue
    const start = runStartOf(s, i)
    for (let k = start; k < c.up.length; k++) {
      const cards = cardsAt(s, { col: i, index: k })
      const under = k > 0 ? c.up[k - 1] : undefined
      const reveals = k === 0 && c.down.length > 0
      const empties = k === 0 && !c.down.length
      const sitsWell = under !== undefined && valueAt(s, under) === valueAt(s, cards[0]) + 1
      const sitsSuited = sitsWell && suitAt(s, under!) === suitAt(s, cards[0])
      for (let j = 0; j < COLS; j++) {
        if (j === i || !canPlace(s, cards, { col: j })) continue
        const t = s.tableau[j]
        const toEmpty = !t.up.length && !t.down.length
        if (toEmpty) {
          // 空位只試第一個；整疊搬到空位白搬
          if (j !== empty || empties) continue
          // 搬到空位：只搬整串（不拆同花色的串）
          if (k !== start) continue
          out.push({ type: 'move', from: { col: i, index: k }, to: { col: j } })
          continue
        }
        const natural = suitAt(s, t.up[t.up.length - 1]) === suitAt(s, cards[0])
        // 拆開同花色的串：只有接到同花色上才值得
        if (sitsSuited && !natural) continue
        // 已經接在點數剛好的牌上、換到另一張不同花色上：只有底下那張露出來後、別疊有同花色的牌接得上才值得
        if (sitsWell && !natural && !reveals && !empties && !wanted(s, under!, i)) continue
        out.push({ type: 'move', from: { col: i, index: k }, to: { col: j } })
      }
    }
  }
  if (s.stock.length) out.push({ type: 'deal' })
  return out
}

/** 評分的權重（scripts/find-spider-deals.ts 試出來的） */
export const W = { done: 400, down: 25, empty: 40, suited: 30, seq: 0, dealt: 0, runSq: 0, near: 0 }
/** 局面好不好：收走的串、翻開的牌、同花色接好的（越長越好）、空出的一疊越多越好 */
function score(s: SpiderState): number {
  let v = s.done.length * W.done + (50 - s.stock.length) * W.dealt
  for (const c of s.tableau) {
    v -= c.down.length * W.down
    if (!c.up.length && !c.down.length) v += W.empty
    // 蓋著的牌快翻完的那疊：快空出來了
    else if (c.down.length <= 1) v += W.near * (2 - c.down.length)
    let run = 1
    for (let k = 1; k < c.up.length; k++) {
      const a = c.up[k - 1]
      const b = c.up[k]
      if (valueAt(s, a) !== valueAt(s, b) + 1) {
        run = 1
        continue
      }
      if (suitAt(s, a) === suitAt(s, b)) {
        run++
        v += W.suited + W.runSq * run
      } else {
        run = 1
        v += W.seq
      }
    }
  }
  return v
}

/** 找一串能過關的步；試的局面超過 budget 就放棄（回傳 null）。最好的局面先展開（best-first） */
export function solveSpider(start: SpiderState, budget = 200000): SpiderAction[] | null {
  // 展開過的局面就把 s 丟掉（只留走法與上一步），不然記憶體會爆
  type Node = { s: SpiderState | null; v: number; prev: Node | null; a: SpiderAction | null }
  const seen = new Set<string>([keyOf(start)])
  // 二元堆：分數高的先拿
  const heap: Node[] = [{ s: start, v: score(start), prev: null, a: null }]
  const push = (n: Node) => {
    heap.push(n)
    let i = heap.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (heap[p].v >= heap[i].v) break
      ;[heap[p], heap[i]] = [heap[i], heap[p]]
      i = p
    }
  }
  const pop = (): Node => {
    const top = heap[0]
    const last = heap.pop()!
    if (heap.length) {
      heap[0] = last
      let i = 0
      for (;;) {
        const l = i * 2 + 1
        const r = l + 1
        let m = i
        if (l < heap.length && heap[l].v > heap[m].v) m = l
        if (r < heap.length && heap[r].v > heap[m].v) m = r
        if (m === i) break
        ;[heap[m], heap[i]] = [heap[i], heap[m]]
        i = m
      }
    }
    return top
  }
  let nodes = 0
  while (heap.length) {
    const n = pop()
    const cur = n.s!
    n.s = null
    if (cur.won) {
      const path: SpiderAction[] = []
      for (let x: Node | null = n; x && x.a; x = x.prev) path.push(x.a)
      return path.reverse()
    }
    if (++nodes > budget) return null
    for (const a of candidates(cur)) {
      const r = applySpider(cur, a)
      if (!r.ok) continue
      const k = keyOf(r.state)
      if (seen.has(k)) continue
      seen.add(k)
      push({ s: r.state, v: score(r.state), prev: n, a })
    }
  }
  return null
}

/**
 * 做一副「保證解得開」的發牌（4 種花色光靠解題器很難解出隨機發的牌，所以反過來做）：
 *   先擺好牌的位置但蓋著的牌先不決定是什麼；一邊玩、每翻開一張（或發牌）才從還沒用到的牌裡隨機抽一張當它，
 *   搜尋的時候同一次翻牌可以試幾種不同的隨機抽法（DRAWS）；玩到過關，每個位置是什麼牌就都定了 → 一副發牌＋它的解法。
 *   抽法都是隨機的，所以發出來的牌跟一般洗牌看起來一樣，只是保證有解。最後用真的規則從頭照解法重玩一次驗證。
 * 回傳發牌順序（給 createSpider）；試太多（budget）還沒做出來回傳 null。
 */
export function buildSolvableSpider(seed: number, suits: SuitCount, budget = 150000, DRAWS = 3): { order: number[]; path: SpiderAction[] } | null {
  const real = spiderFaces(suits)
  // 每種牌面還剩幾張沒用
  const pool0 = new Array(52).fill(0)
  for (const f of real) pool0[f]++
  // 先擺好：位置 i 放的就是「第 i 個位置的牌」，牌面先空著（-1）
  const base = createSpider(Array.from({ length: 104 }, (_, i) => i), suits)
  const faces0 = new Array(104).fill(-1)
  let rng = seedRng(seed)
  const draw = (pool: number[], r: RngState): [number, RngState] => {
    const total = pool.reduce((a, b) => a + b, 0)
    let k: number
    ;[k, r] = nextInt(r, total)
    for (let f = 0; f < 52; f++) {
      if (k < pool[f]) return [f, r]
      k -= pool[f]
    }
    return [-1, r]
  }
  const pool = pool0.slice()
  for (const c of base.tableau) {
    let f: number
    ;[f, rng] = draw(pool, rng)
    faces0[c.up[0]] = f
    pool[f]--
  }
  const start: SpiderState = { ...base, faces: faces0 }
  type Node = { s: SpiderState | null; pool: number[]; rng: RngState; v: number; prev: Node | null; a: SpiderAction | null }
  const key = (st: SpiderState, pl: number[]) => keyOf(st) + '|' + pl.join('')
  const seen = new Set<string>([key(start, pool)])
  const heap: Node[] = []
  const push = (n: Node) => {
    heap.push(n)
    let i = heap.length - 1
    while (i > 0) {
      const q = (i - 1) >> 1
      if (heap[q].v >= heap[i].v) break
      ;[heap[q], heap[i]] = [heap[i], heap[q]]
      i = q
    }
  }
  const pop = (): Node => {
    const top = heap[0]
    const last = heap.pop()!
    if (heap.length) {
      heap[0] = last
      let i = 0
      for (;;) {
        const l = i * 2 + 1
        const r = l + 1
        let m = i
        if (l < heap.length && heap[l].v > heap[m].v) m = l
        if (r < heap.length && heap[r].v > heap[m].v) m = r
        if (m === i) break
        ;[heap[m], heap[i]] = [heap[i], heap[m]]
        i = m
      }
    }
    return top
  }
  push({ s: start, pool, rng, v: score(start), prev: null, a: null })
  let nodes = 0
  while (heap.length) {
    const n = pop()
    const cur = n.s!
    n.s = null
    if (cur.won) {
      const path: SpiderAction[] = []
      for (let x: Node | null = n; x && x.a; x = x.prev) path.push(x.a)
      path.reverse()
      // 每個位置定下來的牌面 → 換成真的牌編號（同牌面的牌隨便挑一張）
      const byFace = new Map<number, number[]>()
      real.forEach((f, id) => byFace.set(f, [...(byFace.get(f) ?? []), id]))
      const order = cur.faces.map((f) => byFace.get(f)!.pop()!)
      // 照解法從頭重玩一次，確定真的過關
      let t = createSpider(order, suits)
      for (const a of path) {
        const r = applySpider(t, a)
        if (!r.ok) return null
        t = r.state
      }
      return t.won ? { order, path } : null
    }
    if (++nodes > budget) return null
    let r0 = n.rng
    for (const a of candidates(cur)) {
      for (let d = 0; d < DRAWS; d++) {
        // 這一步會翻開（或發出）哪些還沒決定的牌：每一種抽法都試試
        let st = cur
        const pl = n.pool.slice()
        const faces = cur.faces.slice()
        if (a.type === 'deal') {
          const k = Math.min(COLS, cur.stock.length)
          for (let i = 0; i < k; i++) {
            const id = cur.stock[cur.stock.length - 1 - i]
            let f: number
            ;[f, r0] = draw(pl, r0)
            faces[id] = f
            pl[f]--
          }
          st = { ...cur, faces }
        }
        const r = applySpider(st, a)
        if (!r.ok) break
        let next = r.state
        const fs = a.type === 'deal' ? faces : cur.faces.slice()
        let changed = a.type === 'deal'
        for (const c of next.tableau) {
          for (const id of c.up) {
            if (fs[id] !== -1) continue
            let f: number
            ;[f, r0] = draw(pl, r0)
            fs[id] = f
            pl[f]--
            changed = true
          }
        }
        next = { ...next, faces: fs }
        const k = key(next, pl)
        if (!seen.has(k)) {
          seen.add(k)
          push({ s: next, pool: pl, rng: r0, v: score(next), prev: n, a })
        }
        // 沒有翻開任何牌的步：抽法都一樣，試一次就好
        if (!changed) break
      }
    }
  }
  return null
}
