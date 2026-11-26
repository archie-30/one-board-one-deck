// 金字塔接龍規則引擎（一副牌 52 張）。純函式，狀態可序列化成 JSON。
//   金字塔：7 排共 28 張，全部翻開；第 r 排有 r+1 張。一張牌下面那排左右兩張都拿走了，它才「露出來」能用。
//   其餘 24 張是牌堆（蓋著）。點牌堆翻一張到旁邊的翻牌堆，翻牌堆最上面那張能用。
//   兩張能用的牌點數加起來是 13 就一起拿走（A=1、J=11、Q=12）；K 是 13，自己一張就能拿走。
//   牌堆翻完可以把翻牌堆翻回去再翻（重翻）：簡單不限次數、困難只能重翻 2 次（共 3 輪）。
//   （只有 1 輪的話隨便洗 60 副只有 1 副解得開，太難，所以困難是 3 輪。）
//   金字塔 28 張全部拿走就過關（牌堆剩多少不管）。
//   計分：每拿走一張牌 +5；金字塔清空一整排 +25；按「返回」另外扣 5 分（記在 penalty）。分數最低 0。
//   過關時另加快速過關獎勵 30000÷秒數（30 秒以上才給；全部拿光時大家都是 435 分，靠這個分出高下）。
//
// 牌：跟大老二同一套牌面編號（Card），一副牌每張只有一張，編號就是它自己。
import { fullDeck, type Card } from '@/engine/bigtwo/cards'
import { shuffle, type RngState } from '@/engine/common/rng'
import type { Result } from '@/engine/common/types'
import { DEAD_END_BUDGET, provedDeadEnd } from '@/engine/common/deadEnd'
import { valueOf } from '@/engine/solitaire/rules'

export type { Card }
export { valueOf }

export const ROWS = 7
export const PYRAMID = 28
export const CARD_SCORE = 5
export const ROW_SCORE = 25
export const UNDO_PENALTY = 5
/** 難度＝能重翻幾次：簡單不限（-1）、困難 2 次（共 3 輪） */
export type PyramidLevel = 'easy' | 'hard'
export const RECYCLES: Record<PyramidLevel, number> = { easy: -1, hard: 2 }

export interface PyramidState {
  /** 金字塔 28 格（第 r 排第 c 張在 r*(r+1)/2 + c），拿走的是 null */
  pyramid: (Card | null)[]
  /** 牌堆（最後一張在最上面） */
  stock: Card[]
  /** 翻牌堆（最後一張在最上面，能用） */
  waste: Card[]
  /** 拿走的牌（照拿走的順序） */
  gone: Card[]
  /** 還能重翻幾次（-1＝不限） */
  recyclesLeft: number
  score: number
  moves: number
  /** 按「返回」累積扣掉的分數 */
  penalty: number
  won: boolean
}

/** 能用的牌在哪：金字塔第 i 格，或翻牌堆最上面那張 */
export type Spot = { pile: 'pyramid'; i: number } | { pile: 'waste' }
export type PyramidAction = { type: 'draw' } | { type: 'remove'; spots: Spot[] }
export type PyramidError = 'won' | 'empty' | 'blocked' | 'notThirteen'

export const rowOf = (i: number): number => {
  let r = 0
  while (((r + 1) * (r + 2)) / 2 <= i) r++
  return r
}
export const indexOf = (r: number, c: number): number => (r * (r + 1)) / 2 + c
export const colOf = (i: number): number => i - indexOf(rowOf(i), 0)

/** 第 i 格下面壓著它的兩格（最下面一排沒有） */
export function coveredBy(i: number): number[] {
  const r = rowOf(i)
  if (r === ROWS - 1) return []
  const c = colOf(i)
  return [indexOf(r + 1, c), indexOf(r + 1, c + 1)]
}

/** 金字塔第 i 格有牌，而且下面兩張都拿走了 */
export const exposed = (s: PyramidState, i: number): boolean => s.pyramid[i] !== null && coveredBy(i).every((j) => s.pyramid[j] === null)

export const cardAt = (s: PyramidState, spot: Spot): Card | null =>
  spot.pile === 'waste' ? (s.waste.length ? s.waste[s.waste.length - 1] : null) : spot.i >= 0 && spot.i < PYRAMID ? s.pyramid[spot.i] : null

/** 這個位置的牌現在能不能用 */
export const usable = (s: PyramidState, spot: Spot): boolean => (spot.pile === 'waste' ? s.waste.length > 0 : exposed(s, spot.i))

/** 現在能用的所有位置 */
export function usableSpots(s: PyramidState): Spot[] {
  const out: Spot[] = []
  for (let i = 0; i < PYRAMID; i++) if (exposed(s, i)) out.push({ pile: 'pyramid', i })
  if (s.waste.length) out.push({ pile: 'waste' })
  return out
}

const sameSpot = (a: Spot, b: Spot) => a.pile === b.pile && (a.pile === 'waste' || a.i === (b as { i: number }).i)

/** 這幾張能不能一起拿走：K 一張、或兩張加起來 13 */
export function canRemove(s: PyramidState, spots: readonly Spot[]): boolean {
  if (spots.length < 1 || spots.length > 2) return false
  if (spots.length === 2 && sameSpot(spots[0], spots[1])) return false
  if (!spots.every((p) => usable(s, p))) return false
  const sum = spots.reduce((t, p) => t + valueOf(cardAt(s, p)!), 0)
  return sum === 13
}

export function createPyramid(deck: readonly Card[], level: PyramidLevel): PyramidState {
  const pyramid = deck.slice(0, PYRAMID)
  return {
    pyramid,
    stock: deck.slice(PYRAMID).reverse(),
    waste: [],
    gone: [],
    recyclesLeft: RECYCLES[level],
    score: 0,
    moves: 0,
    penalty: 0,
    won: false,
  }
}

export function dealPyramid(rng: RngState, level: PyramidLevel): [PyramidState, RngState] {
  const [deck, next] = shuffle(fullDeck(), rng)
  return [createPyramid(deck, level), next]
}

const clone = (s: PyramidState): PyramidState => ({ ...s, pyramid: s.pyramid.slice(), stock: s.stock.slice(), waste: s.waste.slice(), gone: s.gone.slice() })

/** 牌堆還能不能翻（牌堆有牌，或翻完了但還能重翻） */
export const canDraw = (s: PyramidState): boolean => s.stock.length > 0 || (s.waste.length > 0 && s.recyclesLeft !== 0)

export function applyPyramid(state: PyramidState, action: PyramidAction): Result<PyramidState, PyramidError> {
  if (state.won) return { ok: false, reason: 'won' }
  if (action.type === 'draw') {
    if (!canDraw(state)) return { ok: false, reason: 'empty' }
    const s = clone(state)
    if (s.stock.length) s.waste.push(s.stock.pop()!)
    else {
      // 重翻：翻牌堆整疊翻回去當牌堆（原本先翻出來的又在最上面）
      s.stock = s.waste.reverse()
      s.waste = []
      if (s.recyclesLeft > 0) s.recyclesLeft--
    }
    s.moves++
    return { ok: true, state: s }
  }
  const spots = action.spots
  if (!spots.every((p) => usable(state, p))) return { ok: false, reason: 'blocked' }
  if (!canRemove(state, spots)) return { ok: false, reason: 'notThirteen' }
  const s = clone(state)
  const rowsBefore = clearedRows(s)
  // 先拿金字塔的（不影響翻牌堆），翻牌堆最上面那張最後拿
  for (const p of spots) {
    if (p.pile === 'pyramid') {
      s.gone.push(s.pyramid[p.i]!)
      s.pyramid[p.i] = null
    }
  }
  if (spots.some((p) => p.pile === 'waste')) s.gone.push(s.waste.pop()!)
  s.score += CARD_SCORE * spots.length + ROW_SCORE * (clearedRows(s) - rowsBefore)
  s.moves++
  s.won = s.pyramid.every((c) => c === null)
  return { ok: true, state: s }
}

/** 已經清空的排數 */
export function clearedRows(s: PyramidState): number {
  let n = 0
  for (let r = 0; r < ROWS; r++) {
    let empty = true
    for (let c = 0; c <= r; c++) if (s.pyramid[indexOf(r, c)] !== null) empty = false
    if (empty) n++
  }
  return n
}

/** 目前的分數（最低 0） */
export const scoreOf = (s: PyramidState): number => Math.max(0, s.score - s.penalty)

/** 快速過關獎勵（過關時才給） */
export const timeBonus = (seconds: number): number => (seconds >= 30 ? Math.floor(30000 / seconds) : 0)

/** 返回：回到上一步的狀態，保留累積的扣分並再扣 5 分；步數照算 */
export function undoTo(prev: PyramidState, current: PyramidState): PyramidState {
  return { ...prev, penalty: current.penalty + UNDO_PENALTY, moves: current.moves + 1 }
}

/** 現在能拿走的每一組（K 一張、加起來 13 的兩張） */
export function removals(s: PyramidState): Spot[][] {
  const spots = usableSpots(s)
  const out: Spot[][] = []
  for (let a = 0; a < spots.length; a++) {
    const va = valueOf(cardAt(s, spots[a])!)
    if (va === 13) out.push([spots[a]])
    for (let b = a + 1; b < spots.length; b++) if (va + valueOf(cardAt(s, spots[b])!) === 13) out.push([spots[a], spots[b]])
  }
  return out
}

/** 所有能走的步（拿牌在前、翻牌在後） */
export function legalActions(s: PyramidState): PyramidAction[] {
  if (s.won) return []
  const out: PyramidAction[] = removals(s).map((spots) => ({ type: 'remove', spots }))
  if (canDraw(s)) out.push({ type: 'draw' })
  return out
}

/** 局面的鑰匙：金字塔剩哪幾張、牌堆、翻牌堆、還能重翻幾次（分數、步數不算） */
export function stateKey(s: PyramidState): string {
  let mask = 0
  for (let i = 0; i < PYRAMID; i++) if (s.pyramid[i] !== null) mask |= 1 << i
  return `${mask}|${s.recyclesLeft}|${s.stock.join(',')}|${s.waste.join(',')}`
}

/** 卡關：沒有能拿的牌，牌堆也翻不了 */
export const isStuck = (s: PyramidState): boolean => !s.won && !canDraw(s) && removals(s).length === 0

/**
 * 真的卡關了嗎（電腦算過）：從目前局面試遍所有走得到的局面，沒有一個能過關才算。
 * 試太多（budget）還沒試完就當成沒卡關，不會誤判。
 */
export function isDeadEnd(start: PyramidState, budget = DEAD_END_BUDGET): boolean {
  if (start.won) return false
  return provedDeadEnd(
    start,
    {
      key: stateKey,
      moves: legalActions,
      apply: (s, a) => {
        const r = applyPyramid(s, a)
        return r.ok ? r.state : null
      },
      done: (s) => s.won,
    },
    budget,
  )
}

/** 點一下就拿得走的（K），或點兩下時要配的那張：先配金字塔裡的、再配翻牌堆 */
export function partnerFor(s: PyramidState, spot: Spot): Spot[] | null {
  const card = cardAt(s, spot)
  if (card === null || !usable(s, spot)) return null
  if (valueOf(card) === 13) return [spot]
  const want = 13 - valueOf(card)
  const others = usableSpots(s).filter((p) => !sameSpot(p, spot) && valueOf(cardAt(s, p)!) === want)
  const pick = others.find((p) => p.pile === 'pyramid') ?? others[0]
  return pick ? [spot, pick] : null
}
