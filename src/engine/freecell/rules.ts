// 新接龍（FreeCell）規則引擎。純函式，狀態可序列化成 JSON。
//   一副 52 張全部翻開發成 8 疊（前 4 疊 7 張、後 4 疊 6 張）。
//   左上 4 個暫存格：每格放一張任何牌。右上 4 個收牌區：每格固定一種花色，從 A 收到 K。
//   桌面往下接：紅黑交錯、點數少 1；空的一疊什麼牌都能放。
//   一次只能搬一張；但有空的暫存格、空的一疊時，可以一次搬一串（等於借空位一張張搬）：
//     最多 (空暫存格 + 1) × 2^(空的疊數) 張；搬到空的那一疊時，那一疊不算在空的疊數裡。
//   全部收完就過關。比的是步數：過關用的步數越少越好；按「返回」也算一步。
import { isRed, suitOf, type Card } from '@/engine/bigtwo/cards'
import { shuffle, type RngState } from '@/engine/common/rng'
import type { Result } from '@/engine/common/types'
import { valueOf } from '@/engine/solitaire/rules'

export type { Card }

export interface FreeCellState {
  /** 4 個暫存格（null＝空的） */
  cells: (Card | null)[]
  /** 收牌區：第 n 格就是花色 n（梅花、方塊、紅心、黑桃） */
  foundations: Card[][]
  /** 8 疊桌面（最後一張在最上面） */
  tableau: Card[][]
  moves: number
  won: boolean
}

export type Source = { pile: 'cell'; slot: number } | { pile: 'tableau'; col: number; index: number }
export type Target = { pile: 'cell'; slot: number } | { pile: 'foundation'; slot: number } | { pile: 'tableau'; col: number }
export type FreeCellAction = { type: 'move'; from: Source; to: Target }
export type FreeCellError = 'won' | 'badSource' | 'illegal' | 'tooMany'

export const COLS = 8

export function createFreeCell(deck: readonly Card[]): FreeCellState {
  const tableau: Card[][] = Array.from({ length: COLS }, () => [])
  deck.forEach((c, i) => tableau[i % COLS].push(c))
  return { cells: [null, null, null, null], foundations: [[], [], [], []], tableau, moves: 0, won: false }
}

export function dealFreeCell(rng: RngState): [FreeCellState, RngState] {
  const [deck, next] = shuffle(Array.from({ length: 52 }, (_, i) => i), rng)
  return [createFreeCell(deck), next]
}

const clone = (s: FreeCellState): FreeCellState => ({
  ...s,
  cells: s.cells.slice(),
  foundations: s.foundations.map((f) => f.slice()),
  tableau: s.tableau.map((c) => c.slice()),
})

/** 紅黑交錯、點數一張張往下的一串（第一張在最下面） */
export function isRun(cards: readonly Card[]): boolean {
  for (let i = 1; i < cards.length; i++) if (isRed(cards[i]) === isRed(cards[i - 1]) || valueOf(cards[i]) !== valueOf(cards[i - 1]) - 1) return false
  return cards.length > 0
}

/** 從來源拿起來的牌（第一張在最下面）；不是一串就拿不起來 */
export function cardsAt(s: FreeCellState, from: Source): Card[] {
  if (from.pile === 'cell') {
    const c = s.cells[from.slot]
    return c === null || c === undefined ? [] : [c]
  }
  const col = s.tableau[from.col]
  if (!col || from.index < 0 || from.index >= col.length) return []
  const cards = col.slice(from.index)
  return isRun(cards) ? cards : []
}

/** 一次最多能搬幾張（toEmpty：要搬到空的一疊） */
export function maxMove(s: FreeCellState, toEmpty: boolean): number {
  const cells = s.cells.filter((c) => c === null).length
  const empties = s.tableau.filter((c) => !c.length).length - (toEmpty ? 1 : 0)
  return (cells + 1) * 2 ** Math.max(0, empties)
}

/** 能不能放（不檢查張數上限） */
function fits(s: FreeCellState, cards: readonly Card[], to: Target): boolean {
  if (!cards.length) return false
  const first = cards[0]
  if (to.pile === 'cell') return cards.length === 1 && s.cells[to.slot] === null
  if (to.pile === 'foundation') {
    const f = s.foundations[to.slot]
    if (cards.length !== 1 || !f || suitOf(first) !== to.slot) return false
    return valueOf(first) === f.length + 1
  }
  const col = s.tableau[to.col]
  if (!col) return false
  if (!col.length) return true
  const top = col[col.length - 1]
  return isRed(top) !== isRed(first) && valueOf(top) === valueOf(first) + 1
}

/** 這串牌能不能放到目標上（含一次能搬幾張的限制） */
export function canPlace(s: FreeCellState, cards: readonly Card[], to: Target): boolean {
  if (!fits(s, cards, to)) return false
  if (to.pile !== 'tableau') return true
  return cards.length <= maxMove(s, !s.tableau[to.col].length)
}

const same = (from: Source, to: Target) =>
  (from.pile === 'cell' && to.pile === 'cell' && from.slot === to.slot) || (from.pile === 'tableau' && to.pile === 'tableau' && from.col === to.col)

export function applyFreeCell(state: FreeCellState, action: FreeCellAction): Result<FreeCellState, FreeCellError> {
  if (state.won) return { ok: false, reason: 'won' }
  const { from, to } = action
  const cards = cardsAt(state, from)
  if (!cards.length) return { ok: false, reason: 'badSource' }
  if (same(from, to) || !fits(state, cards, to)) return { ok: false, reason: 'illegal' }
  if (!canPlace(state, cards, to)) return { ok: false, reason: 'tooMany' }
  const s = clone(state)
  if (from.pile === 'cell') s.cells[from.slot] = null
  else s.tableau[from.col].splice(from.index)
  if (to.pile === 'cell') s.cells[to.slot] = cards[0]
  else if (to.pile === 'foundation') s.foundations[to.slot].push(cards[0])
  else s.tableau[to.col].push(...cards)
  s.moves++
  s.won = s.foundations.every((f) => f.length === 13)
  return { ok: true, state: s }
}

/**
 * 拖一串牌去某一疊時，實際要搬的是哪一段（跟 Windows 新接龍一樣）：
 *   搬到有牌的一疊：從拿起來的這串裡找「接得上」的那一張開始，多拿的不用管；
 *   搬到空的一疊：張數超過一次能搬的上限，就只搬最上面能搬的那幾張；
 *   搬到暫存格、收牌區：只拿最上面那一張。
 * 只調整從哪一張開始搬；調整不了就原樣回傳（交給 applyFreeCell 判斷）。
 */
export function fitSource(s: FreeCellState, from: Source, to: Target): Source {
  if (from.pile !== 'tableau') return from
  const cards = cardsAt(s, from)
  if (!cards.length) return from
  // 拖一串到暫存格或收牌區：只放最上面那一張
  if (to.pile !== 'tableau') return { ...from, index: from.index + cards.length - 1 }
  if (from.col === to.col) return from
  if (!s.tableau[to.col]?.length) {
    const max = maxMove(s, true)
    return cards.length > max ? { ...from, index: from.index + cards.length - max } : from
  }
  for (let k = 0; k < cards.length; k++) if (fits(s, cards.slice(k), to)) return { ...from, index: from.index + k }
  return from
}

/** 返回：回到上一步的狀態；返回也算一步 */
export function undoTo(prev: FreeCellState, current: FreeCellState): FreeCellState {
  return { ...prev, moves: current.moves + 1 }
}

/** 點兩下時要送去哪裡：能收就收，再找接得上的一疊，再找空的一疊，最後放暫存格 */
export function autoTarget(s: FreeCellState, from: Source): Target | null {
  const cards = cardsAt(s, from)
  if (!cards.length) return null
  if (cards.length === 1) {
    const f: Target = { pile: 'foundation', slot: suitOf(cards[0]) }
    if (canPlace(s, cards, f)) return f
  }
  const fromCol = from.pile === 'tableau' ? from.col : -1
  // 整疊從最底下搬到另一個空位：白搬
  const whole = from.pile === 'tableau' && from.index === 0
  let empty: Target | null = null
  for (let col = 0; col < COLS; col++) {
    if (col === fromCol) continue
    const t: Target = { pile: 'tableau', col }
    if (!canPlace(s, cards, t)) continue
    if (s.tableau[col].length) return t
    if (!empty && !whole) empty = t
  }
  if (empty) return empty
  if (cards.length === 1 && from.pile === 'tableau') {
    const slot = s.cells.indexOf(null)
    if (slot >= 0) return { pile: 'cell', slot }
  }
  return null
}

/**
 * 自動收牌的整套步驟：每一疊都已經由大到小排好（最上面是最小的），剩下的只要一張張收上去。
 * 做不到（還有牌壓著比它小的牌）就回傳 null。
 */
export function finishPlan(start: FreeCellState): FreeCellAction[] | null {
  if (start.won) return null
  if (start.tableau.some((c) => c.some((card, i) => i > 0 && valueOf(card) > valueOf(c[i - 1])))) return null
  let s = start
  const plan: FreeCellAction[] = []
  for (let guard = 0; guard < 60 && !s.won; guard++) {
    const srcs: Source[] = []
    s.cells.forEach((c, slot) => c !== null && srcs.push({ pile: 'cell', slot }))
    s.tableau.forEach((c, col) => c.length && srcs.push({ pile: 'tableau', col, index: c.length - 1 }))
    let moved = false
    for (const from of srcs) {
      const card = cardsAt(s, from)[0]
      const a: FreeCellAction = { type: 'move', from, to: { pile: 'foundation', slot: suitOf(card) } }
      const r = applyFreeCell(s, a)
      if (r.ok) {
        s = r.state
        plan.push(a)
        moved = true
        break
      }
    }
    if (!moved) return null
  }
  return s.won ? plan : null
}

/**
 * 卡關判斷：已經沒有任何步可以走（暫存格滿了、沒有空的一疊、收不了、也沒有能接的地方）。
 */
export function isStuck(s: FreeCellState): boolean {
  if (s.won) return false
  if (s.cells.includes(null) || s.tableau.some((c) => !c.length)) return false
  const srcs: Source[] = s.cells.map((_, slot) => ({ pile: 'cell', slot }) as Source)
  s.tableau.forEach((c, col) => c.forEach((_, index) => srcs.push({ pile: 'tableau', col, index })))
  for (const from of srcs) {
    const cards = cardsAt(s, from)
    if (!cards.length) continue
    if (cards.length === 1 && canPlace(s, cards, { pile: 'foundation', slot: suitOf(cards[0]) })) return false
    for (let col = 0; col < COLS; col++) {
      if (from.pile === 'tableau' && from.col === col) continue
      if (canPlace(s, cards, { pile: 'tableau', col })) return false
    }
  }
  return true
}
