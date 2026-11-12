// 大老二對局流程：(state, action) → newState
import { nextInt, seedRng, shuffle, type RngState } from '../common/rng'
import type { Result } from '../common/types'
import { CLUB_THREE, RANK_2, fullDeck, rankOf, sortCards, type Card } from './cards'
import { canBeat, identifyCombo, type Combo } from './combos'
import { DEFAULT_BIGTWO_OPTIONS, type BigTwoOptions } from './options'

export const PLAYER_COUNT = 4

export interface TablePlay {
  player: number
  combo: Combo
}

export interface BigTwoState {
  options: BigTwoOptions
  /** 四位玩家的手牌（已由小到大排序），0 號是真人玩家 */
  hands: Card[][]
  turn: number
  /** 桌上目前要壓過的牌；null 表示輪到的人可以自由出牌 */
  table: TablePlay | null
  /** 這一輪每位玩家最後的動作（給畫面顯示） */
  lastMoves: (Card[] | 'pass' | null)[]
  passCount: number
  /** 是否為整局第一手（必須包含梅花 3） */
  firstTurn: boolean
  /** -1 = 進行中 */
  winner: number
}

export type BigTwoAction = { type: 'play'; player: number; cards: Card[] } | { type: 'pass'; player: number }

export type BigTwoError =
  | 'finished'
  | 'notYourTurn'
  | 'notInHand'
  | 'invalidCombo'
  | 'needClubThree'
  | 'wrongType'
  | 'tooSmall'
  | 'mustLead'

/** 發牌開局。同一個 seed 會發出同一副牌。 */
export function dealBigTwo(seed: number, options: Partial<BigTwoOptions> = {}): BigTwoState {
  const opts = { ...DEFAULT_BIGTWO_OPTIONS, ...options }
  const [deck] = shuffle(fullDeck(), seedRng(seed))
  const hands: Card[][] = []
  for (let p = 0; p < PLAYER_COUNT; p++) {
    hands.push(sortCards(deck.slice(p * 13, p * 13 + 13), opts.suitOrder))
  }
  return createBigTwo(hands, opts)
}

/** 用指定的手牌開局（測試與教學用）。有梅花 3 的人先出，沒有梅花 3 時由 0 號先出且不限首手。 */
export function createBigTwo(hands: Card[][], options: Partial<BigTwoOptions> = {}): BigTwoState {
  const opts = { ...DEFAULT_BIGTWO_OPTIONS, ...options }
  const starter = hands.findIndex((h) => h.includes(CLUB_THREE))
  return {
    options: opts,
    hands: hands.map((h) => sortCards(h, opts.suitOrder)),
    turn: starter < 0 ? 0 : starter,
    table: null,
    lastMoves: hands.map(() => null),
    passCount: 0,
    firstTurn: starter >= 0,
    winner: -1,
  }
}

/** 檢查一手牌能不能出；可以的話回傳牌型 */
export function checkPlay(state: BigTwoState, player: number, cards: readonly Card[]): Result<Combo, BigTwoError> {
  if (state.winner >= 0) return { ok: false, reason: 'finished' }
  if (player !== state.turn) return { ok: false, reason: 'notYourTurn' }
  const hand = state.hands[player]
  if (cards.length === 0 || new Set(cards).size !== cards.length || !cards.every((c) => hand.includes(c))) {
    return { ok: false, reason: 'notInHand' }
  }
  const combo = identifyCombo(cards, state.options)
  if (!combo) return { ok: false, reason: 'invalidCombo' }
  if (state.firstTurn && !cards.includes(CLUB_THREE)) return { ok: false, reason: 'needClubThree' }
  if (state.table && !canBeat(combo, state.table.combo, state.options)) {
    const prev = state.table.combo
    const sameShape = combo.type === prev.type || (combo.cards.length === 5 && prev.cards.length === 5)
    return { ok: false, reason: sameShape ? 'tooSmall' : 'wrongType' }
  }
  return { ok: true, state: combo }
}

export function applyBigTwo(state: BigTwoState, action: BigTwoAction): Result<BigTwoState, BigTwoError> {
  if (state.winner >= 0) return { ok: false, reason: 'finished' }
  if (action.player !== state.turn) return { ok: false, reason: 'notYourTurn' }
  const next = (state.turn + 1) % PLAYER_COUNT

  if (action.type === 'pass') {
    if (!state.table) return { ok: false, reason: 'mustLead' }
    const passCount = state.passCount + 1
    // 其他三家都過牌：桌面清空，由最後出牌的人自由出牌
    if (passCount >= PLAYER_COUNT - 1) {
      return {
        ok: true,
        state: {
          ...state,
          turn: state.table.player,
          table: null,
          passCount: 0,
          lastMoves: state.lastMoves.map(() => null),
        },
      }
    }
    const lastMoves = state.lastMoves.slice()
    lastMoves[action.player] = 'pass'
    return { ok: true, state: { ...state, turn: next, passCount, lastMoves } }
  }

  const check = checkPlay(state, action.player, action.cards)
  if (!check.ok) return check
  const combo = check.state
  const hands = state.hands.map((h, p) => (p === action.player ? h.filter((c) => !combo.cards.includes(c)) : h))
  const lastMoves = state.lastMoves.slice()
  lastMoves[action.player] = combo.cards
  const won = hands[action.player].length === 0
  return {
    ok: true,
    state: {
      ...state,
      hands,
      table: { player: action.player, combo },
      lastMoves,
      passCount: 0,
      firstTurn: false,
      winner: won ? action.player : -1,
      turn: won ? action.player : next,
    },
  }
}

export interface PlayerScore {
  /** 剩餘張數 */
  cards: number
  /** 剩餘的 2 有幾張 */
  twos: number
  /** 加倍後的倍數 */
  multiplier: number
  /** 本局得分（贏家為正，輸家為負） */
  points: number
}

/**
 * 結算：有人出完就結束。
 * 輸家每剩 1 張扣 1 分；剩 10 張以上 ×2；每剩一張 2 再 ×2（兩種加倍可在規則選項關閉）。
 * 贏家得到所有輸家扣分的總和。
 */
export function scoreBigTwo(state: BigTwoState): PlayerScore[] {
  const scores = state.hands.map((hand) => {
    const cards = hand.length
    const twos = hand.filter((c) => rankOf(c) === RANK_2).length
    let multiplier = 1
    if (state.options.doubleOverTen && cards >= 10) multiplier *= 2
    if (state.options.doubleTwos) multiplier *= 2 ** twos
    return { cards, twos, multiplier, points: -cards * multiplier }
  })
  if (state.winner >= 0) {
    const total = scores.reduce((sum, s) => sum - s.points, 0)
    scores[state.winner].points = total
  }
  return scores
}

/** 給 UI 用的隨機 seed 來源（引擎本身不產生隨機 seed） */
export function nextSeed(rng: RngState): [number, RngState] {
  return nextInt(rng, 0x7fffffff)
}
