// 排七（接龍、牌七）：四個人，每人 13 張。拿黑桃 7 的人先出黑桃 7。
// 之後每種花色要先有人出那個花色的 7，才能從 7 往上（8、9…K）或往下（6、5…A）一張一張接。
// 輪到你時有牌可以接就一定要出一張；完全沒有牌可以接，才從手上挑一張蓋起來（當罰分）。
// 所有人的牌都出完或蓋完就結束：蓋起來的牌點數加總是罰分（A=1、J=11、Q=12、K=13），罰分最少的人贏。
// 純函式，狀態可序列化成 JSON。
import { seedRng, shuffle } from '../common/rng'
import type { Result } from '../common/types'

export const PLAYERS = 4
/** 牌：0～51。花色 = card / 13（0 梅花、1 方塊、2 紅心、3 黑桃），點數 = card % 13 + 1（1 = A … 13 = K） */
export type Card = number
export const suitOf = (c: Card) => Math.floor(c / 13)
export const rankOf = (c: Card) => (c % 13) + 1
export const makeCard = (suit: number, rank: number): Card => suit * 13 + rank - 1
export const SPADE_SEVEN = makeCard(3, 7)
export const RANK_LABELS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const

/** 每種花色桌上排到哪裡：還沒出 7 是 null，否則是 [最小, 最大] 點數 */
export type Row = [number, number] | null

export interface SevensState {
  hands: Card[][]
  /** 每個人蓋起來的牌（罰分） */
  covered: Card[][]
  /** 四種花色排到哪裡 */
  rows: Row[]
  turn: number
  /** 整局第一手：一定要出黑桃 7 */
  first: boolean
  moves: number
  lastMove: { player: number; card: Card; covered: boolean } | null
  over: boolean
}

export type SevensAction = { type: 'play'; player: number; card: Card } | { type: 'cover'; player: number; card: Card } | { type: 'timeout'; player: number }
export type SevensError = 'over' | 'notYourTurn' | 'notInHand' | 'cantPlay' | 'mustPlay' | 'needSpadeSeven'

const sortHand = (h: Card[]) => h.slice().sort((a, b) => suitOf(a) - suitOf(b) || rankOf(a) - rankOf(b))

/** 發牌開局（同一個 seed 會發出同一副牌） */
export function dealSevens(seed: number): SevensState {
  const [deck] = shuffle(
    Array.from({ length: 52 }, (_, i) => i),
    seedRng(seed),
  )
  return createSevens(Array.from({ length: PLAYERS }, (_, p) => deck.slice(p * 13, p * 13 + 13)))
}

/** 用指定的手牌開局（測試、教學用）：拿黑桃 7 的人先出；沒人拿就由 0 號先、不限第一手 */
export function createSevens(hands: Card[][]): SevensState {
  const starter = hands.findIndex((h) => h.includes(SPADE_SEVEN))
  return {
    hands: hands.map(sortHand),
    covered: hands.map(() => []),
    rows: [null, null, null, null],
    turn: starter < 0 ? 0 : starter,
    first: starter >= 0,
    moves: 0,
    lastMove: null,
    over: false,
  }
}

/** 這張牌現在能不能接上桌 */
export function canPlay(state: SevensState, c: Card): boolean {
  if (state.first) return c === SPADE_SEVEN
  const row = state.rows[suitOf(c)]
  const r = rankOf(c)
  if (!row) return r === 7
  return r === row[0] - 1 || r === row[1] + 1
}

/** player 現在能接的牌 */
export const legalPlays = (state: SevensState, player = state.turn): Card[] => state.hands[player].filter((c) => canPlay(state, c))

/** 換下一個手上還有牌的人；都沒牌了就結束 */
function advance(s: SevensState, from: number): SevensState {
  for (let k = 1; k <= PLAYERS; k++) {
    const p = (from + k) % PLAYERS
    if (s.hands[p].length) return { ...s, turn: p }
  }
  return { ...s, over: true }
}

export function applySevens(state: SevensState, action: SevensAction): Result<SevensState, SevensError> {
  if (state.over) return { ok: false, reason: 'over' }
  if (action.player !== state.turn) return { ok: false, reason: 'notYourTurn' }
  const p = action.player
  const legal = legalPlays(state, p)
  let act = action
  if (act.type === 'timeout') {
    // 時間到：有牌可以接就幫他接第一張能接的；沒有就蓋點數最小的那張
    act = legal.length ? { type: 'play', player: p, card: legal[0] } : { type: 'cover', player: p, card: lowestCover(state.hands[p]) }
  }
  const card = act.card
  if (!state.hands[p].includes(card)) return { ok: false, reason: 'notInHand' }
  const hand = state.hands[p].filter((c) => c !== card)
  const hands = state.hands.map((h, i) => (i === p ? hand : h))
  if (act.type === 'play') {
    if (!canPlay(state, card)) return { ok: false, reason: state.first ? 'needSpadeSeven' : 'cantPlay' }
    const rows = state.rows.slice()
    const row = rows[suitOf(card)]
    const r = rankOf(card)
    rows[suitOf(card)] = row ? [Math.min(row[0], r), Math.max(row[1], r)] : [7, 7]
    return { ok: true, state: advance({ ...state, hands, rows, first: false, moves: state.moves + 1, lastMove: { player: p, card, covered: false } }, p) }
  }
  // 蓋牌：只有完全沒有牌可以接時才可以
  if (legal.length) return { ok: false, reason: 'mustPlay' }
  const covered = state.covered.map((h, i) => (i === p ? [...h, card] : h))
  return { ok: true, state: advance({ ...state, hands, covered, moves: state.moves + 1, lastMove: { player: p, card, covered: true } }, p) }
}

/** 點數最小的牌（蓋它罰分最少） */
export const lowestCover = (hand: readonly Card[]): Card => hand.reduce((a, b) => (rankOf(b) < rankOf(a) ? b : a))

/** 每個人的罰分（蓋起來的牌點數加總） */
export const penalties = (s: SevensState): number[] => s.covered.map((h) => h.reduce((t, c) => t + rankOf(c), 0))
/** 罰分最少的人（可能不只一個） */
export function winners(s: SevensState): number[] {
  const p = penalties(s)
  const min = Math.min(...p)
  return p.map((v, i) => (v === min ? i : -1)).filter((i) => i >= 0)
}
