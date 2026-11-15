// 牌型判定與比大小
import { RANK_2, RANK_A, cardPower, rankOf, suitOf, suitPower, type Card } from './cards'
import type { BigTwoOptions } from './options'

export type ComboType =
  | 'single'
  | 'pair'
  | 'triple'
  | 'smallStraight'
  | 'twoPair'
  | 'straight'
  | 'flush'
  | 'fullHouse'
  | 'four'
  | 'straightFlush'

export interface Combo {
  type: ComboType
  cards: Card[]
  /** 同牌型之間比大小用，由前往後逐項比較 */
  key: number[]
}

/** 五張牌型之間的大小順序 */
const FIVE_CLASS: Partial<Record<ComboType, number>> = {
  twoPair: 0.5,
  straight: 1,
  flush: 2,
  fullHouse: 3,
  four: 4,
  straightFlush: 5,
}

export const isFiveCard = (type: ComboType): boolean => FIVE_CLASS[type] !== undefined
export const isBomb = (type: ComboType): boolean => type === 'four' || type === 'straightFlush'

/** 順子的大小：回傳 [等級, 比花色的那張牌]；不是順子回傳 null */
function straightKey(cards: readonly Card[], opts: BigTwoOptions): number[] | null {
  const ranks = cards.map(rankOf).sort((a, b) => a - b)
  for (let i = 1; i < 5; i++) if (ranks[i] === ranks[i - 1]) return null
  const cardOfRank = (rank: number) => cards.find((c) => rankOf(c) === rank) as Card
  const suitOfRank = (rank: number) => suitPower(suitOf(cardOfRank(rank)), opts.suitOrder)
  const has = (...rs: number[]) => rs.every((r) => ranks.includes(r))

  const isA2345 = has(RANK_A, RANK_2, 0, 1, 2)
  const is23456 = has(RANK_2, 0, 1, 2, 3)
  if (isA2345 || is23456) {
    switch (opts.straightRule) {
      case 'tw':
        return [is23456 ? 9 : 8, suitOfRank(RANK_2)]
      case 'aLow':
        return is23456 ? [9, suitOfRank(RANK_2)] : [-1, suitOfRank(2)]
      case 'high':
        return [RANK_2, suitOfRank(RANK_2)]
    }
  }
  // 一般順子：點數連續，且不含 2（JQKA2 等不算）
  if (ranks[4] - ranks[0] !== 4 || ranks[4] === RANK_2) return null
  const top = ranks[4]
  return opts.straightRule === 'high' ? [top, suitOfRank(top)] : [ranks[0], suitOfRank(top)]
}

/**
 * 小順（三張連號）的大小：回傳 [等級, 比花色的那張牌]；不是小順回傳 null。
 * 規則和五張的順子一致：繞一圈的（KA2、A23 以外含 2 又不連的）不算；
 * A23、234 這兩組照「順子的 A 與 2」的選項排（預設 234 最大、A23 第二）。
 */
function smallStraightKey(cards: readonly Card[], opts: BigTwoOptions): number[] | null {
  const ranks = cards.map(rankOf).sort((a, b) => a - b)
  if (ranks[0] === ranks[1] || ranks[1] === ranks[2]) return null
  const cardOfRank = (rank: number) => cards.find((c) => rankOf(c) === rank) as Card
  const suitOfRank = (rank: number) => suitPower(suitOf(cardOfRank(rank)), opts.suitOrder)
  const has = (...rs: number[]) => rs.every((r) => ranks.includes(r))
  const isA23 = has(RANK_A, RANK_2, 0)
  const is234 = has(RANK_2, 0, 1)
  if (isA23 || is234) {
    switch (opts.straightRule) {
      case 'tw':
        return [is234 ? 21 : 20, suitOfRank(RANK_2)]
      case 'aLow':
        return is234 ? [21, suitOfRank(RANK_2)] : [-1, suitOfRank(0)]
      case 'high':
        return [RANK_2, suitOfRank(RANK_2)]
    }
  }
  if (ranks[2] - ranks[0] !== 2 || ranks[2] === RANK_2) return null
  const top = ranks[2]
  return opts.straightRule === 'high' ? [top, suitOfRank(top)] : [ranks[0], suitOfRank(top)]
}

/** 一條龍：3 到 2 十三種點數各一張 */
export const isDragon = (hand: readonly Card[]): boolean => hand.length === 13 && new Set(hand.map(rankOf)).size === 13

/** 判定一組牌是什麼牌型；不合法回傳 null */
export function identifyCombo(cardsIn: readonly Card[], opts: BigTwoOptions): Combo | null {
  const cards = cardsIn.slice().sort((a, b) => cardPower(a, opts.suitOrder) - cardPower(b, opts.suitOrder))
  const n = cards.length
  if (new Set(cards).size !== n) return null
  const sp = (c: Card) => suitPower(suitOf(c), opts.suitOrder)

  if (n === 1) return { type: 'single', cards, key: [rankOf(cards[0]), sp(cards[0])] }
  if (n === 2) {
    if (rankOf(cards[0]) !== rankOf(cards[1])) return null
    return { type: 'pair', cards, key: [rankOf(cards[0]), sp(cards[1])] }
  }
  if (n === 3) {
    if (rankOf(cards[0]) === rankOf(cards[2])) return opts.allowTriple ? { type: 'triple', cards, key: [rankOf(cards[0])] } : null
    const small = opts.allowSmallStraight ? smallStraightKey(cards, opts) : null
    return small ? { type: 'smallStraight', cards, key: small } : null
  }
  if (n !== 5) return null

  const counts = new Map<number, number>()
  for (const c of cards) counts.set(rankOf(c), (counts.get(rankOf(c)) ?? 0) + 1)
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1])

  if (groups[0][1] === 4) return { type: 'four', cards, key: [groups[0][0]] }
  if (groups[0][1] === 3 && groups[1][1] === 2) return { type: 'fullHouse', cards, key: [groups[0][0]] }
  // 兩對（規則選項）：比大的那一對的點數，一樣大再比那一對裡最大的花色
  if (opts.allowTwoPair && groups[0][1] === 2 && groups[1][1] === 2) {
    const high = Math.max(groups[0][0], groups[1][0])
    const top = Math.max(...cards.filter((c) => rankOf(c) === high).map(sp))
    return { type: 'twoPair', cards, key: [high, top] }
  }

  const sameSuit = cards.every((c) => suitOf(c) === suitOf(cards[0]))
  const straight = straightKey(cards, opts)
  if (straight && sameSuit && opts.straightFlushSpecial) return { type: 'straightFlush', cards, key: straight }
  if (straight) return { type: 'straight', cards, key: straight }
  if (sameSuit && opts.allowFlush) {
    const ranks = cards.map(rankOf).sort((a, b) => b - a)
    return { type: 'flush', cards, key: [...ranks, sp(cards[4])] }
  }
  return null
}

function compareKeys(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

/** play 能不能壓過 prev */
export function canBeat(play: Combo, prev: Combo, opts: BigTwoOptions): boolean {
  if (play.type === prev.type) return compareKeys(play.key, prev.key) > 0
  const a = FIVE_CLASS[play.type]
  const b = FIVE_CLASS[prev.type]
  // 五張牌型：只能同類型互壓（順子接順子、葫蘆接葫蘆），只有鐵支、同花順可以壓別的五張牌型
  if (a !== undefined && b !== undefined) return isBomb(play.type) ? a > b : false
  // 鐵支、同花順壓單張／對子／三條
  if (isBomb(play.type) && b === undefined) return opts.bombBeatsAll
  return false
}

/** 粗略的牌力（AI 用）：越大越強 */
export function comboStrength(combo: Combo): number {
  const cls = FIVE_CLASS[combo.type]
  if (cls !== undefined) return 100 + cls * 60 + combo.key[0] * 4 + (combo.key[1] ?? 0)
  return combo.key[0] * 4 + (combo.key[1] ?? 0)
}
