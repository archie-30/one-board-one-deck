// 大老二的牌：0～51 的整數。
//   點數 = card >> 2（0 = 3、1 = 4 … 10 = K、11 = A、12 = 2，也就是大老二的大小順序）
//   花色 = card & 3（0 = 梅花、1 = 方塊、2 = 紅心、3 = 黑桃）

export type Card = number
export type Suit = 0 | 1 | 2 | 3

/** 花色大小順序：shdc = 黑桃>紅心>方塊>梅花（台灣常見）；shcd = 黑桃>紅心>梅花>方塊 */
export type SuitOrder = 'shdc' | 'shcd'

export const RANK_LABELS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'] as const
export const SUIT_SYMBOLS = ['♣', '♦', '♥', '♠'] as const

export const RANK_A = 11
export const RANK_2 = 12
export const CLUB_THREE: Card = 0

export const rankOf = (card: Card): number => card >> 2
export const suitOf = (card: Card): Suit => (card & 3) as Suit
export const makeCard = (rank: number, suit: Suit): Card => rank * 4 + suit
export const isRed = (card: Card): boolean => suitOf(card) === 1 || suitOf(card) === 2

const SUIT_POWER: Record<SuitOrder, readonly number[]> = {
  shdc: [0, 1, 2, 3],
  shcd: [1, 0, 2, 3],
}

export const suitPower = (suit: Suit, order: SuitOrder): number => SUIT_POWER[order][suit]

/** 單張牌的大小（0～51），先比點數再比花色 */
export const cardPower = (card: Card, order: SuitOrder): number => rankOf(card) * 4 + suitPower(suitOf(card), order)

export function sortCards(cards: readonly Card[], order: SuitOrder): Card[] {
  return cards.slice().sort((a, b) => cardPower(a, order) - cardPower(b, order))
}

export function fullDeck(): Card[] {
  return Array.from({ length: 52 }, (_, i) => i)
}

/** 測試與教學用：'S2'、'H10'、'DA'、'C3' → 牌 */
export function parseCard(text: string): Card {
  const suit = 'CDHS'.indexOf(text[0].toUpperCase())
  const rank = (RANK_LABELS as readonly string[]).indexOf(text.slice(1).toUpperCase())
  if (suit < 0 || rank < 0) throw new Error(`bad card: ${text}`)
  return makeCard(rank, suit as Suit)
}

export const parseCards = (text: string): Card[] => text.trim().split(/\s+/).map(parseCard)
