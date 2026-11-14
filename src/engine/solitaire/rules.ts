// 接龍（單人 Klondike）規則引擎。純函式，狀態可序列化成 JSON。
//   桌面 7 疊：第 i 疊有 i+1 張，最上面一張翻開。其餘 24 張是牌堆。
//   桌面往下接：顏色紅黑交錯、點數少 1；空的一疊只能放 K。
//   收牌區 4 疊：每疊固定一種花色（第 n 疊就是花色 n：梅花、方塊、紅心、黑桃），從 A 收到 K。全部收完就過關。
//   計分（標準計分）：牌堆→桌面 +5、收一張 +10、翻開桌面的牌 +5、收牌區拿回桌面 -15、
//   牌堆重翻：翻 1 張時第 1 輪之後每次 -100；翻 3 張時前 3 輪免費、之後每次 -20；分數不會低於 0。
//   時間扣分與過關獎勵見 finalScore；復原、提示的扣分記在 penalty。
import { fullDeck, isRed, rankOf, suitOf, type Card } from '@/engine/bigtwo/cards'
import { shuffle, type RngState } from '@/engine/common/rng'
import type { Result } from '@/engine/common/types'

export type { Card }
export type DrawCount = 1 | 3

export interface Column {
  /** 蓋著的牌（最後一張在最上面） */
  down: Card[]
  /** 翻開的牌（第一張在最下面） */
  up: Card[]
}

export interface SolitaireState {
  /** 牌堆（最後一張在最上面） */
  stock: Card[]
  /** 翻出來的牌（最後一張在最上面，可以拿） */
  waste: Card[]
  foundations: Card[][]
  tableau: Column[]
  draw: DrawCount
  score: number
  moves: number
  recycles: number
  /** 按「復原」累積扣掉的分數 */
  penalty: number
  won: boolean
}

export type Source =
  | { pile: 'waste' }
  | { pile: 'tableau'; col: number; index: number }
  | { pile: 'foundation'; slot: number }
export type Target = { pile: 'tableau'; col: number } | { pile: 'foundation'; slot: number }

export type SolitaireAction = { type: 'draw' } | { type: 'move'; from: Source; to: Target }
export type SolitaireError = 'won' | 'empty' | 'badSource' | 'illegal'

export const SCORE = { wasteToTableau: 5, toFoundation: 10, flip: 5, fromFoundation: -15, recycle1: -100, recycle3: -20 } as const
/** 按一次「復原」扣的分數：簡單（翻 1 張）扣多一點，困難（翻 3 張）扣少一點 */
export const UNDO_PENALTY: Record<DrawCount, number> = { 1: 20, 3: 10 }
/** 看一次「提示」扣的分數 */
export const HINT_PENALTY: Record<DrawCount, number> = { 1: 15, 3: 10 }

/** 接龍的點數：A = 1 … K = 13 */
export function valueOf(card: Card): number {
  const r = rankOf(card)
  return r <= 10 ? r + 3 : r === 11 ? 1 : 2
}
export const suitIndex = (card: Card): number => suitOf(card)
export const redCard = (card: Card): boolean => isRed(card)

export function createSolitaire(deck: readonly Card[], draw: DrawCount): SolitaireState {
  const cards = deck.slice()
  const tableau: Column[] = []
  for (let i = 0; i < 7; i++) {
    const take = cards.splice(0, i + 1)
    tableau.push({ down: take.slice(0, -1), up: take.slice(-1) })
  }
  return { stock: cards.reverse(), waste: [], foundations: [[], [], [], []], tableau, draw, score: 0, moves: 0, recycles: 0, penalty: 0, won: false }
}

export function dealSolitaire(rng: RngState, draw: DrawCount): [SolitaireState, RngState] {
  const [deck, next] = shuffle(fullDeck(), rng)
  return [createSolitaire(deck, draw), next]
}

const clone = (s: SolitaireState): SolitaireState => ({
  ...s,
  stock: s.stock.slice(),
  waste: s.waste.slice(),
  foundations: s.foundations.map((f) => f.slice()),
  tableau: s.tableau.map((c) => ({ down: c.down.slice(), up: c.up.slice() })),
})

/** 從來源拿起來的牌（第一張在最下面） */
export function cardsAt(s: SolitaireState, from: Source): Card[] {
  if (from.pile === 'waste') return s.waste.length ? [s.waste[s.waste.length - 1]] : []
  if (from.pile === 'foundation') {
    const f = s.foundations[from.slot]
    return f && f.length ? [f[f.length - 1]] : []
  }
  const col = s.tableau[from.col]
  if (!col || from.index < 0 || from.index >= col.up.length) return []
  return col.up.slice(from.index)
}

/** 這疊牌能不能放到目標上 */
export function canPlace(s: SolitaireState, cards: readonly Card[], to: Target): boolean {
  if (!cards.length) return false
  const first = cards[0]
  if (to.pile === 'foundation') {
    if (cards.length !== 1) return false
    const f = s.foundations[to.slot]
    if (!f || suitOf(first) !== to.slot) return false
    if (!f.length) return valueOf(first) === 1
    const top = f[f.length - 1]
    return suitOf(top) === suitOf(first) && valueOf(first) === valueOf(top) + 1
  }
  const col = s.tableau[to.col]
  if (!col) return false
  if (!col.up.length && !col.down.length) return valueOf(first) === 13
  if (!col.up.length) return false
  const top = col.up[col.up.length - 1]
  return isRed(top) !== isRed(first) && valueOf(top) === valueOf(first) + 1
}

const isWon = (s: SolitaireState): boolean => s.foundations.every((f) => f.length === 13)

export function applySolitaire(state: SolitaireState, action: SolitaireAction): Result<SolitaireState, SolitaireError> {
  if (state.won) return { ok: false, reason: 'won' }
  const s = clone(state)
  if (action.type === 'draw') {
    if (s.stock.length) {
      const n = Math.min(s.draw, s.stock.length)
      for (let i = 0; i < n; i++) s.waste.push(s.stock.pop()!)
    } else if (s.waste.length) {
      s.stock = s.waste.reverse()
      s.waste = []
      s.recycles++
      const free = s.draw === 1 ? 1 : 3
      if (s.recycles > free) s.score = Math.max(0, s.score + (s.draw === 1 ? SCORE.recycle1 : SCORE.recycle3))
    } else return { ok: false, reason: 'empty' }
    s.moves++
    return { ok: true, state: s }
  }

  const { from, to } = action
  const cards = cardsAt(s, from)
  if (!cards.length) return { ok: false, reason: 'badSource' }
  if (from.pile === to.pile && (from.pile === 'tableau' ? from.col === (to as { col: number }).col : from.slot === (to as { slot: number }).slot)) return { ok: false, reason: 'illegal' }
  if (!canPlace(s, cards, to)) return { ok: false, reason: 'illegal' }

  // 拿起來
  if (from.pile === 'waste') s.waste.pop()
  else if (from.pile === 'foundation') s.foundations[from.slot].pop()
  else s.tableau[from.col].up.splice(from.index)
  // 放下去
  if (to.pile === 'foundation') s.foundations[to.slot].push(cards[0])
  else s.tableau[to.col].up.push(...cards)

  if (to.pile === 'foundation' && from.pile !== 'foundation') s.score += SCORE.toFoundation
  if (from.pile === 'waste' && to.pile === 'tableau') s.score += SCORE.wasteToTableau
  if (from.pile === 'foundation' && to.pile === 'tableau') s.score = Math.max(0, s.score + SCORE.fromFoundation)

  // 拿走後露出蓋著的牌：自動翻開
  if (from.pile === 'tableau') {
    const col = s.tableau[from.col]
    if (!col.up.length && col.down.length) {
      col.up.push(col.down.pop()!)
      s.score += SCORE.flip
    }
  }
  s.moves++
  s.won = isWon(s)
  return { ok: true, state: s }
}

/** 目前的分數（移動得分扣掉復原的扣分，最低 0） */
export const scoreOf = (s: SolitaireState): number => Math.max(0, s.score - s.penalty)

/** 復原：回到上一步的狀態，但保留累積的扣分並再扣一次；步數照算 */
export function undoTo(prev: SolitaireState, current: SolitaireState): SolitaireState {
  return { ...prev, penalty: current.penalty + UNDO_PENALTY[current.draw], moves: current.moves + 1 }
}

/** 看提示：記一次扣分 */
export const chargeHint = (s: SolitaireState): SolitaireState => ({ ...s, penalty: s.penalty + HINT_PENALTY[s.draw] })

/** 收牌區每一疊固定的花色 */
export const foundationSlot = (card: Card): number => suitOf(card)

/**
 * 自動收牌的整套步驟：只用「收到收牌區」和「翻牌堆」就能把牌全部收完時，回傳步驟；做不到就回傳 null。
 * 只有在桌面已經沒有蓋著的牌時才算（也就是不需要再動腦了）。
 */
export function finishPlan(start: SolitaireState): SolitaireAction[] | null {
  if (start.won || start.tableau.some((c) => c.down.length)) return null
  let s = start
  const plan: SolitaireAction[] = []
  let idle = 0
  for (let guard = 0; guard < 2000 && !s.won; guard++) {
    let moved = false
    const sources: Source[] = []
    if (s.waste.length) sources.push({ pile: 'waste' })
    s.tableau.forEach((c, col) => c.up.length && sources.push({ pile: 'tableau', col, index: c.up.length - 1 }))
    for (const from of sources) {
      const card = cardsAt(s, from)[0]
      const a: SolitaireAction = { type: 'move', from, to: { pile: 'foundation', slot: foundationSlot(card) } }
      const r = applySolitaire(s, a)
      if (r.ok) {
        s = r.state
        plan.push(a)
        moved = true
        idle = 0
        break
      }
    }
    if (moved) continue
    if (!s.stock.length && !s.waste.length) return null
    const r = applySolitaire(s, { type: 'draw' })
    if (!r.ok) return null
    s = r.state
    plan.push({ type: 'draw' })
    // 牌堆整整轉兩圈都收不到任何牌：做不到
    if (++idle > (s.stock.length + s.waste.length + 2) * 2) return null
  }
  return s.won ? plan : null
}

/** 從牌堆一直翻（不做別的事）會輪到最上面的那些牌 */
function cycleTops(s: SolitaireState): Card[] {
  const out = new Set<Card>()
  let t = s
  if (t.waste.length) out.add(t.waste[t.waste.length - 1])
  const total = s.stock.length + s.waste.length
  for (let i = 0; i < total * 2 + 2; i++) {
    const r = applySolitaire(t, { type: 'draw' })
    if (!r.ok) break
    t = r.state
    if (t.waste.length) out.add(t.waste[t.waste.length - 1])
  }
  return [...out]
}

/**
 * 卡關判斷：已經沒有任何能讓局面前進的步。
 * 前進 = 收牌、翻開蓋著的牌、把牌堆的牌放上桌面、搬開一串讓下面的牌能收。
 * 只在桌面之間搬來搬去（不會翻開任何牌）不算前進。
 */
export function isStuck(s: SolitaireState): boolean {
  if (s.won) return false
  const fits = (cards: Card[], except = -1) => {
    if (canPlace(s, cards, { pile: 'foundation', slot: foundationSlot(cards[0]) })) return true
    for (let col = 0; col < 7; col++) if (col !== except && canPlace(s, cards, { pile: 'tableau', col })) return true
    return false
  }
  // 牌堆裡輪得到的牌：能收或能放上桌面
  for (const c of cycleTops(s)) if (fits([c])) return false
  for (let col = 0; col < 7; col++) {
    const c = s.tableau[col]
    if (!c.up.length) continue
    // 最上面那張能收
    const top = c.up[c.up.length - 1]
    if (canPlace(s, [top], { pile: 'foundation', slot: foundationSlot(top) })) return false
    for (let i = 0; i < c.up.length; i++) {
      const run = c.up.slice(i)
      let movable = false
      for (let to = 0; to < 7; to++) {
        if (to === col || !canPlace(s, run, { pile: 'tableau', col: to })) continue
        const target = s.tableau[to]
        // 整串 K 從空位搬到另一個空位，沒有意義
        if (i === 0 && !c.down.length && !target.up.length && !target.down.length) continue
        movable = true
      }
      if (!movable) continue
      // 搬走整串會翻開蓋著的牌
      if (i === 0 && c.down.length) return false
      // 搬走一部分，下面露出來的那張能收
      if (i > 0) {
        const below = c.up[i - 1]
        if (canPlace(s, [below], { pile: 'foundation', slot: foundationSlot(below) })) return false
      }
    }
  }
  return true
}

/** 點一下時要把牌送去哪裡：能收就收，否則找第一個能接的桌面（先找有牌的、再找空的） */
export function autoTarget(s: SolitaireState, from: Source): Target | null {
  const cards = cardsAt(s, from)
  if (!cards.length) return null
  if (cards.length === 1 && from.pile !== 'foundation') {
    for (let slot = 0; slot < 4; slot++) if (canPlace(s, cards, { pile: 'foundation', slot })) return { pile: 'foundation', slot }
  }
  const fromCol = from.pile === 'tableau' ? from.col : -1
  // 整疊 K 已經在空位最底下，就不要再搬到另一個空位
  const kingAtBottom = from.pile === 'tableau' && from.index === 0 && s.tableau[from.col].down.length === 0
  let empty: Target | null = null
  for (let col = 0; col < 7; col++) {
    if (col === fromCol) continue
    const t: Target = { pile: 'tableau', col }
    if (!canPlace(s, cards, t)) continue
    const c = s.tableau[col]
    if (c.up.length || c.down.length) return t
    if (!empty && !kingAtBottom) empty = t
  }
  return empty
}

/** 提示：找一步有用的移動；都沒有就建議翻牌堆，連牌堆都沒有就回傳 null */
export function hint(s: SolitaireState): SolitaireAction | null {
  if (s.won) return null
  const sources: Source[] = []
  if (s.waste.length) sources.push({ pile: 'waste' })
  s.tableau.forEach((c, col) => c.up.forEach((_, index) => sources.push({ pile: 'tableau', col, index })))

  // 1. 能收的就收
  for (const from of sources) {
    const cards = cardsAt(s, from)
    if (cards.length !== 1) continue
    for (let slot = 0; slot < 4; slot++) if (canPlace(s, cards, { pile: 'foundation', slot })) return { type: 'move', from, to: { pile: 'foundation', slot } }
  }
  // 2. 能翻開蓋著的牌、或把整疊搬去空位讓位置空出來的桌面移動
  for (const from of sources) {
    if (from.pile !== 'tableau' || from.index !== 0) continue
    const col = s.tableau[from.col]
    if (!col.down.length) continue
    const to = autoTarget(s, from)
    if (to && to.pile === 'tableau') return { type: 'move', from, to }
  }
  // 3. 牌堆的牌放到桌面
  if (s.waste.length) {
    const from: Source = { pile: 'waste' }
    for (let col = 0; col < 7; col++) if (canPlace(s, cardsAt(s, from), { pile: 'tableau', col })) return { type: 'move', from, to: { pile: 'tableau', col } }
  }
  // 4. 翻牌堆
  if (s.stock.length || s.waste.length) return { type: 'draw' }
  return null
}

/** 已經沒有蓋著的牌、牌堆也空了：剩下的可以全部自動收完 */
export const canAutoFinish = (s: SolitaireState): boolean =>
  !s.won && !s.stock.length && !s.waste.length && s.tableau.every((c) => !c.down.length)

/** 自動收牌的下一步（找最小的一張能收的牌） */
export function nextFinishMove(s: SolitaireState): SolitaireAction | null {
  let best: { from: Source; slot: number; v: number } | null = null
  s.tableau.forEach((c, col) => {
    if (!c.up.length) return
    const card = c.up[c.up.length - 1]
    for (let slot = 0; slot < 4; slot++) {
      if (canPlace(s, [card], { pile: 'foundation', slot }) && (!best || valueOf(card) < best.v)) best = { from: { pile: 'tableau', col, index: c.up.length - 1 }, slot, v: valueOf(card) }
    }
  })
  if (!best) return null
  const b = best as { from: Source; slot: number }
  return { type: 'move', from: b.from, to: { pile: 'foundation', slot: b.slot } }
}

/** 最後的分數：每 10 秒扣 2 分；過關時若超過 30 秒，加 700000 ÷ 秒數 的時間獎勵 */
export function finalScore(score: number, seconds: number, won: boolean): number {
  const timed = Math.max(0, score - Math.floor(seconds / 10) * 2)
  return won && seconds >= 30 ? timed + Math.floor(700000 / seconds) : timed
}
