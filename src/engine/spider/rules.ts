// 蜘蛛接龍規則引擎（兩副牌 104 張）。純函式，狀態可序列化成 JSON。
//   桌面 10 疊：前 4 疊各 6 張、後 6 疊各 5 張，只有最上面一張翻開；其餘 50 張是牌堆（分 5 次發，每次每疊一張）。
//   往下接：點數少 1 就能接（不看花色）；空的一疊什麼都能放。
//   一起搬：同花色、點數連續往下的一串可以整串搬；不同花色接在一起的只能拆開搬。
//   同花色從 K 排到 A 的一整串會自動收走；收滿 8 串就過關。
//   發牌：每疊發一張，空的一疊也照發（使用者要的；Windows 版是有空疊不能發）。
//   花色數（難度）：1 種＝全部黑桃、2 種＝黑桃＋紅心、4 種＝四種花色。
//   計分（Windows 的算法）：開局 500 分、每動一步（含發牌）-1、收走一串 +100；按「返回」另外扣 5 分（記在 penalty）。
//
// 牌：每張牌有自己的編號（0～103，畫面上每張牌是獨立的物件），faces[編號] 是它的牌面（跟大老二同一套牌面編號）。
import { makeCard, suitOf, type Card, type Suit } from '@/engine/bigtwo/cards'
import { nextInt, shuffle, type RngState } from '@/engine/common/rng'
import type { Result } from '@/engine/common/types'
import { DEAD_END_BUDGET, provedDeadEnd } from '@/engine/common/deadEnd'
import { valueOf } from '@/engine/solitaire/rules'

export type { Card }
export type SuitCount = 1 | 2 | 4

export interface SpiderColumn {
  /** 蓋著的牌（最後一張在最上面） */
  down: Card[]
  /** 翻開的牌（第一張在最下面） */
  up: Card[]
}

export interface SpiderState {
  suits: SuitCount
  /** 每張牌的牌面 */
  faces: Card[]
  /** 牌堆（最後一張在最上面） */
  stock: Card[]
  tableau: SpiderColumn[]
  /** 收走的整串（每串由 K 到 A） */
  done: Card[][]
  /** 移動得分（開局 500、每步 -1、收走一串 +100） */
  score: number
  moves: number
  /** 按「返回」累積扣掉的分數 */
  penalty: number
  won: boolean
}

export type SpiderAction = { type: 'deal' } | { type: 'move'; from: { col: number; index: number }; to: { col: number } }
export type SpiderError = 'won' | 'empty' | 'badSource' | 'illegal'

export const COLS = 10
export const START_SCORE = 500
export const RUN_SCORE = 100
export const UNDO_PENALTY = 5

/** 1 種花色＝黑桃；2 種＝黑桃、紅心；4 種＝四種都有（大老二的花色編號：0 梅花、1 方塊、2 紅心、3 黑桃） */
const SUIT_SETS: Record<SuitCount, Suit[]> = { 1: [3], 2: [3, 2], 4: [3, 2, 1, 0] }
/** 接龍點數 1～13 → 大老二的點數編號（A=11、2=12、3～K=0～10） */
const rankIndex = (v: number) => (v === 1 ? 11 : v === 2 ? 12 : v - 3)

/** 兩副牌的牌面：8 組 A～K，依花色數分配花色 */
export function spiderFaces(suits: SuitCount): Card[] {
  const set = SUIT_SETS[suits]
  return Array.from({ length: 104 }, (_, id) => makeCard(rankIndex((id % 13) + 1), set[Math.floor(id / 13) % set.length]))
}

export const valueAt = (s: SpiderState, c: Card): number => valueOf(s.faces[c])
export const suitAt = (s: SpiderState, c: Card): number => suitOf(s.faces[c])

export function createSpider(order: readonly Card[], suits: SuitCount): SpiderState {
  const cards = order.slice()
  const tableau: SpiderColumn[] = []
  for (let i = 0; i < COLS; i++) {
    const take = cards.splice(0, i < 4 ? 6 : 5)
    tableau.push({ down: take.slice(0, -1), up: take.slice(-1) })
  }
  return { suits, faces: spiderFaces(suits), stock: cards.reverse(), tableau, done: [], score: START_SCORE, moves: 0, penalty: 0, won: false }
}

export function dealSpider(rng: RngState, suits: SuitCount): [SpiderState, RngState] {
  const [order, next] = shuffle(Array.from({ length: 104 }, (_, i) => i), rng)
  return [createSpider(order, suits), next]
}

/**
 * 從「保證解得開」的發牌（data/spiderDeals.ts，2 種、4 種花色用）挑一副，再隨機變化一下：
 *   換花色（例如黑桃、紅心整個對調）、同樣張數的疊互換位置（前 4 疊互換、後 6 疊互換，發牌時跟著換）。
 *   這兩種換法都不影響解不解得開。bank：每副 104 張牌的編號，每張兩位 16 進位。
 */
export function dealFromBank(bank: readonly string[], rng: RngState, suits: SuitCount): [SpiderState, RngState] {
  let pick: number
  ;[pick, rng] = nextInt(rng, bank.length)
  const raw = bank[pick]
  const order = Array.from({ length: 104 }, (_, i) => parseInt(raw.slice(i * 2, i * 2 + 2), 16))
  // 換花色：牌編號每 13 張一組（一組＝一種花色的 A～K），同一種花色的組換到另一種花色
  const len = SUIT_SETS[suits].length
  let perm: number[]
  ;[perm, rng] = shuffle(Array.from({ length: len }, (_, i) => i), rng)
  const relabel = (id: number) => {
    const b = Math.floor(id / 13)
    return (b - (b % len) + perm[b % len]) * 13 + (id % 13)
  }
  // 疊互換：前 4 疊（6 張）之間、後 6 疊（5 張）之間；牌堆每一輪發給第幾疊也跟著換
  let big: number[]
  let small: number[]
  ;[big, rng] = shuffle([0, 1, 2, 3], rng)
  ;[small, rng] = shuffle([4, 5, 6, 7, 8, 9], rng)
  const from = [...big, ...small]
  const starts = [0, 6, 12, 18, 24, 29, 34, 39, 44, 49]
  const sizes = [6, 6, 6, 6, 5, 5, 5, 5, 5, 5]
  const next: number[] = []
  for (let j = 0; j < COLS; j++) next.push(...order.slice(starts[from[j]], starts[from[j]] + sizes[from[j]]))
  for (let r = 0; r < 5; r++) for (let j = 0; j < COLS; j++) next.push(order[54 + r * COLS + from[j]])
  return [createSpider(next.map(relabel), suits), rng]
}

const clone = (s: SpiderState): SpiderState => ({
  ...s,
  stock: s.stock.slice(),
  tableau: s.tableau.map((c) => ({ down: c.down.slice(), up: c.up.slice() })),
  done: s.done.map((d) => d.slice()),
})

/** 這一串（第一張在最下面）是不是同花色、點數一張張往下 */
export function isRun(s: SpiderState, cards: readonly Card[]): boolean {
  for (let i = 1; i < cards.length; i++) {
    if (suitAt(s, cards[i]) !== suitAt(s, cards[0]) || valueAt(s, cards[i]) !== valueAt(s, cards[i - 1]) - 1) return false
  }
  return cards.length > 0
}

/** 從某一疊的第 index 張（翻開的牌裡）拿起來的牌；拿不起來（不是同花色連續的一串）就是空的 */
export function cardsAt(s: SpiderState, from: { col: number; index: number }): Card[] {
  const col = s.tableau[from.col]
  if (!col || from.index < 0 || from.index >= col.up.length) return []
  const cards = col.up.slice(from.index)
  return isRun(s, cards) ? cards : []
}

/** 這串牌能不能放到那一疊 */
export function canPlace(s: SpiderState, cards: readonly Card[], to: { col: number }): boolean {
  const col = s.tableau[to.col]
  if (!col || !cards.length) return false
  if (!col.up.length) return !col.down.length
  return valueAt(s, col.up[col.up.length - 1]) === valueAt(s, cards[0]) + 1
}

/** 最上面同花色 K～A 排好的一整串：收走（+100），露出蓋著的牌就翻開 */
function collect(s: SpiderState, col: number) {
  const c = s.tableau[col]
  if (c.up.length >= 13) {
    const tail = c.up.slice(-13)
    if (valueAt(s, tail[0]) === 13 && isRun(s, tail)) {
      c.up.splice(-13)
      s.done.push(tail)
      s.score += RUN_SCORE
    }
  }
  if (!c.up.length && c.down.length) c.up.push(c.down.pop()!)
}

export function applySpider(state: SpiderState, action: SpiderAction): Result<SpiderState, SpiderError> {
  if (state.won) return { ok: false, reason: 'won' }
  const s = clone(state)
  if (action.type === 'deal') {
    if (!s.stock.length) return { ok: false, reason: 'empty' }
    for (let i = 0; i < COLS && s.stock.length; i++) s.tableau[i].up.push(s.stock.pop()!)
    for (let i = 0; i < COLS; i++) collect(s, i)
  } else {
    const { from, to } = action
    const cards = cardsAt(s, from)
    if (!cards.length) return { ok: false, reason: 'badSource' }
    if (from.col === to.col || !canPlace(s, cards, to)) return { ok: false, reason: 'illegal' }
    s.tableau[from.col].up.splice(from.index)
    s.tableau[to.col].up.push(...cards)
    collect(s, to.col)
    collect(s, from.col)
  }
  s.score -= 1
  s.moves++
  s.won = s.done.length === 8
  return { ok: true, state: s }
}

/** 目前的分數（最低 0） */
export const scoreOf = (s: SpiderState): number => Math.max(0, s.score - s.penalty)

/** 返回：回到上一步的狀態，保留累積的扣分並再扣 5 分；步數照算 */
export function undoTo(prev: SpiderState, current: SpiderState): SpiderState {
  return { ...prev, penalty: current.penalty + UNDO_PENALTY, moves: current.moves + 1 }
}

/** 某一疊最上面能一起拿起來的那串從第幾張開始 */
export function runStart(s: SpiderState, col: number): number {
  const up = s.tableau[col].up
  let i = up.length - 1
  while (i > 0 && suitAt(s, up[i - 1]) === suitAt(s, up[i]) && valueAt(s, up[i - 1]) === valueAt(s, up[i]) + 1) i--
  return i
}

/** 點兩下時要送去哪一疊：先找同花色接得上的、再找接得上的、最後才找空的（整疊搬到空位沒意義就不搬） */
export function autoTarget(s: SpiderState, from: { col: number; index: number }): { col: number } | null {
  const cards = cardsAt(s, from)
  if (!cards.length) return null
  const src = s.tableau[from.col]
  let any: { col: number } | null = null
  let empty: { col: number } | null = null
  for (let col = 0; col < COLS; col++) {
    if (col === from.col || !canPlace(s, cards, { col })) continue
    const t = s.tableau[col]
    if (!t.up.length) {
      if (!empty && !(from.index === 0 && !src.down.length)) empty = { col }
      continue
    }
    if (suitAt(s, t.up[t.up.length - 1]) === suitAt(s, cards[0])) return { col }
    any ??= { col }
  }
  return any ?? empty
}

/**
 * 卡關判斷：牌堆發完了，而且沒有能讓局面前進的步。
 * 前進 = 翻開蓋著的牌、空出一疊、把一串接到同花色上面（原本不是接在同花色上）。
 * 只是把牌在不同花色之間搬來搬去不算前進。
 */
export function isStuck(s: SpiderState): boolean {
  if (s.won || s.stock.length) return false
  for (let i = 0; i < COLS; i++) {
    const c = s.tableau[i]
    for (let k = 0; k < c.up.length; k++) {
      const cards = cardsAt(s, { col: i, index: k })
      if (!cards.length) continue
      for (let j = 0; j < COLS; j++) {
        if (j === i || !canPlace(s, cards, { col: j })) continue
        const t = s.tableau[j]
        if (k === 0 && c.down.length) return false
        if (!t.up.length) continue
        const sameSuit = suitAt(s, t.up[t.up.length - 1]) === suitAt(s, cards[0])
        if (!sameSuit) continue
        if (k === 0) return false
        const under = c.up[k - 1]
        const natural = suitAt(s, under) === suitAt(s, cards[0]) && valueAt(s, under) === valueAt(s, cards[0]) + 1
        if (!natural) return false
      }
    }
  }
  return true
}

/**
 * 真的卡關了嗎（電腦算過）：從目前局面試遍所有走得到的局面（連發牌都算），沒有一個能過關才算。
 * 試太多（budget）還沒試完就當成沒卡關，不會誤判。牌面一樣的牌（兩副牌）當成同一張，局面才不會重複試。
 */
export function isDeadEnd(start: SpiderState, budget = DEAD_END_BUDGET): boolean {
  if (start.won) return false
  const face = (s: SpiderState, c: Card) => s.faces[c]
  const key = (s: SpiderState) =>
    `${s.done.length}|${s.stock.length}|${s.tableau.map((c) => `${c.down.map((x) => face(s, x)).join(',')}:${c.up.map((x) => face(s, x)).join(',')}`).sort().join('/')}`
  const moves = (s: SpiderState): SpiderAction[] => {
    const out: SpiderAction[] = []
    if (s.stock.length) out.push({ type: 'deal' })
    let empty = -1
    for (let j = 0; j < COLS; j++) if (!s.tableau[j].up.length && !s.tableau[j].down.length) ((empty = empty < 0 ? j : empty))
    for (let i = 0; i < COLS; i++) {
      const c = s.tableau[i]
      for (let k = 0; k < c.up.length; k++) {
        const cards = cardsAt(s, { col: i, index: k })
        if (!cards.length) continue
        for (let j = 0; j < COLS; j++) {
          if (j === i || !canPlace(s, cards, { col: j })) continue
          const t = s.tableau[j]
          // 空位都一樣：只試第一個；整疊搬到空位、底下也沒牌：白搬
          if (!t.up.length && !t.down.length && (j !== empty || (k === 0 && !c.down.length))) continue
          out.push({ type: 'move', from: { col: i, index: k }, to: { col: j } })
        }
      }
    }
    return out
  }
  return provedDeadEnd(
    start,
    {
      key,
      moves,
      apply: (s, a) => {
        const r = applySpider(s, a)
        return r.ok ? r.state : null
      },
      done: (s) => s.won,
    },
    budget,
  )
}
