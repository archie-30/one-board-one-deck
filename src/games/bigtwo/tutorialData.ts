// 大老二互動教學的牌（文字在 strings.ts）
import type { ComboType } from '@/engine/bigtwo/combos'

export interface BigTwoLesson {
  hand: string
  /** 桌上要壓過的牌 */
  table?: string
  /** 正確答案的牌型 */
  type?: ComboType
  /** 正確答案必須剛好是這幾張 */
  exact?: string
  /** 這一步的答案是按「過牌」 */
  pass?: boolean
}

export const BIGTWO_LESSONS: BigTwoLesson[] = [
  { hand: 'D5 C9 HK SA C2', exact: 'C2' },
  { hand: 'D4 C8 H8 S8 CJ', table: 'D8', exact: 'H8' },
  { hand: 'D4 H4 H7 D9 S9 CK', table: 'C6 S6', type: 'pair' },
  { hand: 'C4 D5 H6 S7 C8 DK S2', type: 'straight' },
  { hand: 'H3 S5 D9 H9 S9 CQ DQ', table: 'C4 D5 H6 S7 C8', type: 'fullHouse' },
  { hand: 'C7 D7 H7 S7 D10 CA', table: 'S2', type: 'four' },
  { hand: 'C5 DJ HA', table: 'S2', pass: true },
]
