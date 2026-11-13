// 撿紅點互動教學的牌（文字在 strings.ts）。牌用文字表示：H 紅心、D 方塊、S 黑桃、C 梅花。
export interface RedPointLesson {
  hand: string
  table: string
  pile?: string
  /** 正確答案：出哪張、吃哪張（不寫 target 代表墊牌） */
  card: string
  target?: string
}

export const REDPOINT_LESSONS: RedPointLesson[] = [
  { hand: 'S7 C4', table: 'H3 D9 SQ', card: 'S7', target: 'H3' },
  { hand: 'HQ C4', table: 'SQ D5 H8', card: 'HQ', target: 'SQ' },
  { hand: 'S5', table: 'H5 C5 DK', card: 'S5', target: 'H5' },
  { hand: 'S2 HA', table: 'C3 D4 S6', card: 'S2' },
  { hand: 'C7', table: 'H3 S4', pile: 'H6', card: 'C7', target: 'H3' },
]
