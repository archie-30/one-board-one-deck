// 大老二 AI：依「打法」打分。輸入狀態與打法，輸出動作，不碰 UI。
import { nextRandom, type RngState } from '../common/rng'
import { PRESET_STYLES, type BigTwoStyle } from '../common/personas'
import type { Difficulty } from '../common/types'
import { CLUB_THREE, RANK_2, RANK_A, rankOf, suitOf, type Card } from './cards'
import { canBeat, comboStrength, identifyCombo, isBomb, isFiveCard, type Combo } from './combos'
import { PLAYER_COUNT, type BigTwoAction, type BigTwoState } from './game'
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
  for (const [rank, group] of byRank) {
    for (const triple of subsets(group, 3)) {
      for (const [r2, g2] of byRank) {
        if (r2 === rank) continue
        for (const pair of subsets(g2, 2)) push([...triple, ...pair])
      }
    }
    if (group.length === 4) for (const kicker of hand) if (rankOf(kicker) !== rank) push([...group, kicker])
  }
  for (const ranks of STRAIGHT_RANKS) {
    const groups = ranks.map((r) => byRank.get(r) ?? [])
    if (groups.some((g) => g.length === 0)) continue
    let partial: Card[][] = [[]]
    for (const g of groups) partial = partial.flatMap((p) => g.map((c) => [...p, c]))
    for (const cards of partial) push(cards)
  }
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

/** 出這手牌會拆掉多少原本成組的牌 */
function breakCost(combo: Combo, hand: readonly Card[]): number {
  if (combo.cards.length >= 5) return 0
  const same = hand.filter((c) => rankOf(c) === rankOf(combo.cards[0])).length
  return same > combo.cards.length ? (same - combo.cards.length) * 6 : 0
}

/** 這手牌裡用掉了幾張「王牌」（2、A、炸彈） */
function premium(combo: Combo): number {
  if (isBomb(combo.type)) return 3
  return combo.cards.filter((c) => rankOf(c) >= RANK_A).length
}

const top = (combo: Combo) => Math.max(...combo.cards.map(rankOf))

function leadValue(combo: Combo, s: BigTwoStyle, hand: readonly Card[], danger: boolean): number {
  const n = combo.cards.length
  // 牌型偏好
  const pref = {
    small: n === 1 ? 8 : n === 2 ? 5 : 3,
    combo: n === 5 ? 16 : n >= 2 ? 6 : 0,
    pairs: n === 2 ? 14 : n === 5 ? 8 : 0,
    big: top(combo) * 1.6 + (n === 5 ? 6 : 0),
    mixed: n === 5 ? 10 : n >= 2 ? 7 : 2,
  }[s.lead]
  let v = pref + n * 4 * s.skill
  // 出小牌比較划算（大牌留著）；「big」打法反而愛先亮大牌
  if (s.lead !== 'big') v -= top(combo) * (1 + s.skill * 1.4)
  v -= breakCost(combo, hand) * s.skill
  v -= premium(combo) * s.hoard * (hand.length > 5 ? 8 : 1)
  if (isBomb(combo.type) && hand.length > 6) v -= 20 * (1 - s.bomb)
  // 下家只剩一張：別出小單張放他走
  if (danger && n === 1) v += (top(combo) * 5 - 32) * (0.3 + s.block)
  return v
}

function followValue(combo: Combo, s: BigTwoStyle, state: BigTwoState): number {
  const table = state.table!
  const hand = state.hands[state.turn]
  const threat = state.hands[table.player].length
  const bombOverSmall = isBomb(combo.type) && !isBomb(table.combo.type) && !isFiveCard(table.combo.type)
  let v = 30 - (comboStrength(combo) - comboStrength(table.combo)) * (0.25 + s.skill * 0.5)
  v -= breakCost(combo, hand) * s.skill
  v -= premium(combo) * s.hoard * (hand.length > 5 ? 9 : 2)
  if (bombOverSmall) v += (s.bomb - 0.6) * 40
  if (threat <= 3) v += s.block * (24 - threat * 5)
  return v
}

function passValue(s: BigTwoStyle, state: BigTwoState): number {
  const hand = state.hands[state.turn]
  const threat = state.hands[state.table!.player].length
  let v = (1 - s.aggression) * 46 - 8
  if (threat <= 3) v -= s.block * 30
  if (hand.length <= 4) v -= 12 * s.skill
  return v
}

export type AiStyle = Difficulty | BigTwoStyle

const styleOf = (style: AiStyle): BigTwoStyle => (typeof style === 'string' ? PRESET_STYLES[style].bigtwo : style)

/** 選一個動作。回傳 [動作, 新的亂數狀態] */
export function chooseBigTwoAction(state: BigTwoState, style: AiStyle, rng: RngState): [BigTwoAction, RngState] {
  const s = styleOf(style)
  const player = state.turn
  const hand = state.hands[player]
  const plays = legalPlays(state)
  let r: number
  ;[r, rng] = nextRandom(rng)
  const noise = () => {
    let v: number
    ;[v, rng] = nextRandom(rng)
    return (v - 0.5) * (s.whim ?? 1 - s.skill) * 18
  }

  // 一手出完永遠優先
  const finisher = plays.find((c) => c.cards.length === hand.length)
  if (finisher) return [{ type: 'play', player, cards: finisher.cards }, rng]

  // 手滑：隨手出一手
  if (plays.length && r < s.blunder) {
    let v: number
    ;[v, rng] = nextRandom(rng)
    const pick = plays[Math.floor(v * plays.length)]
    return [{ type: 'play', player, cards: pick.cards }, rng]
  }

  if (!state.table) {
    const next = state.hands[(player + 1) % PLAYER_COUNT].length
    const danger = next <= 1 || Math.min(...state.hands.filter((_, p) => p !== player).map((h) => h.length)) <= 1
    let best = plays[0]
    let bestV = -Infinity
    for (const c of plays) {
      const v = leadValue(c, s, hand, danger) + noise()
      if (v > bestV) {
        bestV = v
        best = c
      }
    }
    return [{ type: 'play', player, cards: best.cards }, rng]
  }

  let best: Combo | null = null
  let bestV = passValue(s, state) + noise()
  for (const c of plays) {
    const v = followValue(c, s, state) + noise()
    if (v > bestV) {
      bestV = v
      best = c
    }
  }
  return [best ? { type: 'play', player, cards: best.cards } : { type: 'pass', player }, rng]
}

/** 提示：給真人玩家一手建議的牌（沒有可出的牌回傳 null） */
export function suggestPlay(state: BigTwoState): Card[] | null {
  const plays = legalPlays(state)
  if (!plays.length) return null
  const s = PRESET_STYLES.normal.bigtwo
  if (!state.table) {
    const [action] = chooseBigTwoAction(state, s, 1)
    return action.type === 'play' ? action.cards : null
  }
  // 跟牌時一定給一手能出的（就算 AI 會選擇過牌）
  return plays.reduce((a, b) => (followValue(a, s, state) >= followValue(b, s, state) ? a : b)).cards
}
