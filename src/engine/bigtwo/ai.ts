// 大老二 AI：啟發式。輸入狀態，輸出動作，不碰 UI。
import { nextRandom, type RngState } from '../common/rng'
import type { Difficulty } from '../common/types'
import { CLUB_THREE, RANK_2, RANK_A, rankOf, suitOf, type Card } from './cards'
import { canBeat, comboStrength, identifyCombo, isBomb, type Combo } from './combos'
import type { BigTwoAction, BigTwoState } from './game'
import type { BigTwoOptions } from './options'

function subsets<T>(items: readonly T[], k: number): T[][] {
  if (k === 0) return [[]]
  if (items.length < k) return []
  const [head, ...rest] = items
  return [...subsets(rest, k - 1).map((s) => [head, ...s]), ...subsets(rest, k)]
}

/** 順子可能的點數組合（含 A2345、23456） */
const STRAIGHT_RANKS: number[][] = [
  [RANK_A, RANK_2, 0, 1, 2],
  [RANK_2, 0, 1, 2, 3],
  ...Array.from({ length: 8 }, (_, i) => [i, i + 1, i + 2, i + 3, i + 4]),
]

/** 列出手牌能組出的所有合法牌型 */
export function listCombos(hand: readonly Card[], opts: BigTwoOptions): Combo[] {
  const byRank = new Map<number, Card[]>()
  for (const c of hand) byRank.set(rankOf(c), [...(byRank.get(rankOf(c)) ?? []), c])
  const out: Combo[] = []
  const push = (cards: Card[]) => {
    const combo = identifyCombo(cards, opts)
    if (combo) out.push(combo)
  }

  for (const c of hand) push([c])
  for (const group of byRank.values()) {
    for (const pair of subsets(group, 2)) push(pair)
    if (opts.allowTriple) for (const t of subsets(group, 3)) push(t)
  }
  // 葫蘆、鐵支
  for (const [rank, group] of byRank) {
    for (const triple of subsets(group, 3)) {
      for (const [r2, g2] of byRank) {
        if (r2 === rank) continue
        for (const pair of subsets(g2, 2)) push([...triple, ...pair])
      }
    }
    if (group.length === 4) for (const kicker of hand) if (rankOf(kicker) !== rank) push([...group, kicker])
  }
  // 順子、同花順
  for (const ranks of STRAIGHT_RANKS) {
    const groups = ranks.map((r) => byRank.get(r) ?? [])
    if (groups.some((g) => g.length === 0)) continue
    let partial: Card[][] = [[]]
    for (const g of groups) partial = partial.flatMap((p) => g.map((c) => [...p, c]))
    for (const cards of partial) push(cards)
  }
  // 同花
  if (opts.allowFlush) {
    for (let suit = 0; suit < 4; suit++) {
      const same = hand.filter((c) => suitOf(c) === suit)
      for (const five of subsets(same, 5)) {
        const combo = identifyCombo(five, opts)
        if (combo?.type === 'flush') out.push(combo)
      }
    }
  }
  return out
}

/** 輪到的玩家現在能出的所有牌（不含過牌） */
export function legalPlays(state: BigTwoState): Combo[] {
  if (state.winner >= 0) return []
  let combos = listCombos(state.hands[state.turn], state.options)
  if (state.firstTurn) combos = combos.filter((c) => c.cards.includes(CLUB_THREE))
  const table = state.table
  if (table) combos = combos.filter((c) => canBeat(c, table.combo, state.options))
  return combos
}

/** 出這手牌會拆掉多少原本成組的牌（越大越可惜） */
function breakCost(combo: Combo, hand: readonly Card[]): number {
  if (combo.cards.length >= 5) return 0
  const same = hand.filter((c) => rankOf(c) === rankOf(combo.cards[0])).length
  return same > combo.cards.length ? (same - combo.cards.length) * 6 : 0
}

function pickLead(state: BigTwoState, plays: Combo[], difficulty: Difficulty): Combo {
  const hand = state.hands[state.turn]
  const finisher = plays.find((c) => c.cards.length === hand.length)
  if (finisher) return finisher
  if (difficulty === 'easy') {
    // 簡單：出最小的單張或對子
    const small = plays.filter((c) => c.cards.length <= 2)
    return (small.length ? small : plays).reduce((a, b) => (comboStrength(a) <= comboStrength(b) ? a : b))
  }
  const others = state.hands.filter((_, p) => p !== state.turn).map((h) => h.length)
  const danger = Math.min(...others) <= 1
  let best = plays[0]
  let bestValue = -Infinity
  for (const combo of plays) {
    const n = combo.cards.length
    const top = Math.max(...combo.cards.map(rankOf))
    let value = n === 5 ? 34 : n === 3 ? 16 : n === 2 ? 12 : 0
    value -= top * 2.2 + breakCost(combo, hand)
    if (isBomb(combo.type) && hand.length > 6) value -= 30
    // 有人只剩一張：不要出小單張讓他過關
    if (danger && n === 1) value += top * 5 - 30
    if (value > bestValue) {
      bestValue = value
      best = combo
    }
  }
  return best
}

function pickFollow(state: BigTwoState, plays: Combo[], difficulty: Difficulty, roll: number): Combo | null {
  const table = state.table
  if (!table) return null
  const hand = state.hands[state.turn]
  const finisher = plays.find((c) => c.cards.length === hand.length)
  if (finisher) return finisher
  const sameType = plays.filter((c) => !isBomb(c.type) || isBomb(table.combo.type) || table.combo.cards.length === 5)
  const bombs = plays.filter((c) => !sameType.includes(c))

  if (difficulty === 'easy') {
    if (sameType.length === 0 || roll < 0.12) return null
    return sameType.reduce((a, b) => (comboStrength(a) <= comboStrength(b) ? a : b))
  }

  const threat = state.hands[table.player].length
  const cost = (c: Combo) => comboStrength(c) + breakCost(c, hand)
  const cheapest = sameType.length ? sameType.reduce((a, b) => (cost(a) <= cost(b) ? a : b)) : null
  if (cheapest) {
    // 對手還有很多牌時，不急著用 2 或 A 去壓小牌
    const top = Math.max(...cheapest.cards.map(rankOf))
    const expensive = cheapest.cards.length <= 2 && top >= RANK_A && rankOf(table.combo.cards[0]) < 8
    if (expensive && threat > 5 && hand.length > 4 && roll < 0.7) return null
    return cheapest
  }
  if (bombs.length && (threat <= 3 || hand.length <= 6)) {
    return bombs.reduce((a, b) => (comboStrength(a) <= comboStrength(b) ? a : b))
  }
  return null
}

/** 選一個動作。回傳 [動作, 新的亂數狀態] */
export function chooseBigTwoAction(
  state: BigTwoState,
  difficulty: Difficulty,
  rng: RngState,
): [BigTwoAction, RngState] {
  const player = state.turn
  const plays = legalPlays(state)
  const [roll, next] = nextRandom(rng)
  if (!state.table) {
    const combo = pickLead(state, plays, difficulty)
    return [{ type: 'play', player, cards: combo.cards }, next]
  }
  const combo = plays.length ? pickFollow(state, plays, difficulty, roll) : null
  return [combo ? { type: 'play', player, cards: combo.cards } : { type: 'pass', player }, next]
}

/** 提示：給真人玩家一手建議的牌（沒有可出的牌回傳 null） */
export function suggestPlay(state: BigTwoState): Card[] | null {
  const [action] = chooseBigTwoAction(state, 'normal', 1)
  if (action.type === 'play') return action.cards
  const plays = legalPlays(state)
  if (!plays.length) return null
  return plays.reduce((a, b) => (comboStrength(a) <= comboStrength(b) ? a : b)).cards
}
