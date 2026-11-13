// 撿紅點規則引擎：純函式，不依賴 UI。
// 牌沿用大老二的編碼（0～51，花色 0 梅花、1 方塊、2 紅心、3 黑桃）。
//
// 規則（台灣常見玩法，和使用者確認過）：
//   - 4 人，每人 6 張，桌上翻開 4 張，其餘 24 張是牌堆。
//   - 輪到你：從手上出一張。能和桌上的牌配對就一定要吃（兩張一起收回來）；配不到就留在桌上。
//     能配到兩張以上時，自己選吃哪一張。
//   - 接著從牌堆翻一張：能配就吃、配不到就留在桌上（能配兩張以上時自己選）。
//   - 配對：A～9 兩張加起來等於 10（5 配 5）；10、J、Q、K 要同點數。
//   - 計分只算紅牌（紅心、方塊）：A 20 分、2～9 照點數、10～K 10 分，全副共 208 分。
//   - 手牌出完、牌堆翻完就結束，分數最高的人贏。
import { nextInt, seedRng, shuffle } from '../common/rng'
import type { Result } from '../common/types'
import { fullDeck, isRed, rankOf, type Card } from '../bigtwo/cards'

export const PLAYERS = 4
export const HAND_SIZE = 6
export const TABLE_START = 4

/** 大老二編碼的點數順序（3…K、A、2）對應到牌面數字 */
const FACE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 1, 2]

/** 牌面數字：A = 1 … K = 13 */
export const faceOf = (card: Card): number => FACE[rankOf(card)]

export function matches(a: Card, b: Card): boolean {
  const x = faceOf(a)
  const y = faceOf(b)
  if (x <= 9 && y <= 9) return x + y === 10
  return x >= 10 && x === y
}

export function cardPoints(card: Card): number {
  if (!isRed(card)) return 0
  const f = faceOf(card)
  if (f === 1) return 20
  if (f >= 10) return 10
  return f
}

export interface RedPointState {
  hands: Card[][]
  table: Card[]
  /** 牌堆，pile[0] 是最上面那張 */
  pile: Card[]
  captured: Card[][]
  turn: number
  phase: 'play' | 'flip' | 'over'
}

export type RedPointAction = { type: 'play'; player: number; card: Card; target?: Card } | { type: 'flip'; player: number; target?: Card }

export type RedPointError = 'over' | 'notYourTurn' | 'wrongPhase' | 'notInHand' | 'chooseTarget' | 'badTarget' | 'mustTake'

/** 發牌。同一個 seed 會發出同一副牌，也決定誰先出。 */
export function dealRedPoint(seed: number): RedPointState {
  let rng = seedRng(seed)
  let deck: Card[]
  ;[deck, rng] = shuffle(fullDeck(), rng)
  const [starter] = nextInt(rng, PLAYERS)
  const table = deck.slice(0, TABLE_START)
  const hands = Array.from({ length: PLAYERS }, (_, p) => deck.slice(TABLE_START + p * HAND_SIZE, TABLE_START + (p + 1) * HAND_SIZE))
  const pile = deck.slice(TABLE_START + PLAYERS * HAND_SIZE)
  return createRedPoint(hands, table, pile, starter)
}

/** 用指定的牌開局（測試與教學用） */
export function createRedPoint(hands: Card[][], table: Card[], pile: Card[], turn = 0): RedPointState {
  return { hands: hands.map((h) => h.slice()), table: table.slice(), pile: pile.slice(), captured: hands.map(() => []), turn, phase: 'play' }
}

/** 桌上能和這張牌配對的牌 */
export const targetsFor = (state: RedPointState, card: Card): Card[] => state.table.filter((t) => matches(card, t))

/** 這一張牌放下去會怎樣：吃哪張（null = 留在桌上）；需要自己選時回傳錯誤 */
function resolve(state: RedPointState, card: Card, target: Card | undefined): Result<Card | null, RedPointError> {
  const options = targetsFor(state, card)
  if (target !== undefined) {
    if (!state.table.includes(target) || !matches(card, target)) return { ok: false, reason: 'badTarget' }
    return { ok: true, state: target }
  }
  if (options.length === 0) return { ok: true, state: null }
  if (options.length === 1) return { ok: true, state: options[0] }
  return { ok: false, reason: 'chooseTarget' }
}

function place(state: RedPointState, player: number, card: Card, take: Card | null): Pick<RedPointState, 'table' | 'captured'> {
  if (take === null) return { table: [...state.table, card], captured: state.captured }
  return {
    table: state.table.filter((t) => t !== take),
    captured: state.captured.map((c, p) => (p === player ? [...c, card, take] : c)),
  }
}

function finishTurn(state: RedPointState): RedPointState {
  const next = (state.turn + 1) % PLAYERS
  const done = state.hands.every((h) => h.length === 0) && state.pile.length === 0
  return { ...state, turn: done ? state.turn : next, phase: done ? 'over' : 'play' }
}

export function applyRedPoint(state: RedPointState, action: RedPointAction): Result<RedPointState, RedPointError> {
  if (state.phase === 'over') return { ok: false, reason: 'over' }
  if (action.player !== state.turn) return { ok: false, reason: 'notYourTurn' }

  if (action.type === 'play') {
    if (state.phase !== 'play') return { ok: false, reason: 'wrongPhase' }
    const hand = state.hands[action.player]
    if (!hand.includes(action.card)) return { ok: false, reason: 'notInHand' }
    const r = resolve(state, action.card, action.target)
    if (!r.ok) return r
    const placed = place(state, action.player, action.card, r.state)
    const hands = state.hands.map((h, p) => (p === action.player ? h.filter((c) => c !== action.card) : h))
    const after: RedPointState = { ...state, ...placed, hands, phase: 'flip' }
    // 牌堆已經翻完（只會在自訂開局時發生）就直接換下一位
    return { ok: true, state: after.pile.length ? after : finishTurn(after) }
  }

  if (state.phase !== 'flip') return { ok: false, reason: 'wrongPhase' }
  const [top, ...rest] = state.pile
  const r = resolve(state, top, action.target)
  if (!r.ok) return r
  const placed = place(state, action.player, top, r.state)
  return { ok: true, state: finishTurn({ ...state, ...placed, pile: rest }) }
}

/** 檢查一張手牌能不能這樣出（給 UI 提示用） */
export function checkPlay(state: RedPointState, player: number, card: Card, target?: Card): RedPointError | null {
  const r = applyRedPoint(state, { type: 'play', player, card, target })
  return r.ok ? null : r.reason
}

export interface RedPointScore {
  points: number
  /** 收回來的紅牌 */
  reds: Card[]
}

export function scoreRedPoint(state: RedPointState): RedPointScore[] {
  return state.captured.map((cards) => {
    const reds = cards.filter(isRed)
    return { points: reds.reduce((s, c) => s + cardPoints(c), 0), reds }
  })
}

/** 分數最高的人（可能同分） */
export function winners(state: RedPointState): number[] {
  const scores = scoreRedPoint(state).map((s) => s.points)
  const best = Math.max(...scores)
  return scores.flatMap((s, p) => (s === best ? [p] : []))
}
