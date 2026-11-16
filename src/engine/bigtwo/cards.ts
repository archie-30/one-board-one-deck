// 大老二的牌：0～51 的整數（瘋狂大老二用兩副牌：52～103 是第二副，牌面 = card % 52）。
//   點數 = 牌面 >> 2（0 = 3、1 = 4 … 10 = K、11 = A、12 = 2，也就是大老二的大小順序）
//   花色 = 牌面 & 3（0 = 梅花、1 = 方塊、2 = 紅心、3 = 黑桃）

export type Card = number
export type Suit = 0 | 1 | 2 | 3

/** 花色大小順序：shdc = 黑桃>紅心>方塊>梅花（台灣常見）；shcd = 黑桃>紅心>梅花>方塊 */
export type SuitOrder = 'shdc' | 'shcd'

export const RANK_LABELS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'] as const
export const SUIT_SYMBOLS = ['♣', '♦', '♥', '♠'] as const

export const RANK_A = 11
export const RANK_2 = 12
export const CLUB_THREE: Card = 0

/** 牌面（兩副牌裡同一張牌的牌面一樣） */
export const faceOf = (card: Card): Card => card % 52
export const rankOf = (card: Card): number => faceOf(card) >> 2
export const suitOf = (card: Card): Suit => (faceOf(card) & 3) as Suit
/** 是不是梅花 3（兩副牌各有一張） */
export const isClubThree = (card: Card): boolean => faceOf(card) === CLUB_THREE
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

/** 一副（或兩副）牌 */
export function fullDeck(decks = 1): Card[] {
  return Array.from({ length: 52 * decks }, (_, i) => i)
}

/** 測試與教學用：'S2'、'H10'、'DA'、'C3' → 牌 */
export function parseCard(text: string): Card {
  const suit = 'CDHS'.indexOf(text[0].toUpperCase())
  const rank = (RANK_LABELS as readonly string[]).indexOf(text.slice(1).toUpperCase())
  if (suit < 0 || rank < 0) throw new Error(`bad card: ${text}`)
  return makeCard(rank, suit as Suit)
}

export const parseCards = (text: string): Card[] => text.trim().split(/\s+/).map(parseCard)
