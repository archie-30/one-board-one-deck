import type { SuitOrder } from './cards'

/**
 * 順子的 A、2 處理方式：
 *   tw   = 23456 最大、A2345 第二，其餘依最大牌
 *   aLow = 23456 最大、A2345 最小
 *   high = 一律看順子裡最大的那張牌（含 2 的順子都很大）
 * 任何規則下 JQKA2、QKA23、KA234 都不算順子。
 */
export type StraightRule = 'tw' | 'aLow' | 'high'

export interface BigTwoOptions {
  suitOrder: SuitOrder
  straightRule: StraightRule
  /** 同花順是否算獨立的大牌型（關閉時只當一般順子） */
  straightFlushSpecial: boolean
  /** 鐵支、同花順是否可以壓任何牌型（關閉時只能壓五張牌型） */
  bombBeatsAll: boolean
  /** 是否可以單獨出三條 */
  allowTriple: boolean
  /** 小順：三張連號（例如 345）也能出，只能接三張的小順 */
  allowSmallStraight: boolean
  /** 一條龍：拿到 3 到 2 十三張連號，開局直接獲勝 */
  dragon: boolean
  /** 同花是否算牌型 */
  allowFlush: boolean
  /** 兩對：兩個對子＋一張（五張牌型），只能接兩對，比大的那一對 */
  allowTwoPair: boolean
  /** 計分：剩 10 張以上加倍 */
  doubleOverTen: boolean
  /** 計分：手上每剩一張 2 再加倍 */
  doubleTwos: boolean
}

export const DEFAULT_BIGTWO_OPTIONS: BigTwoOptions = {
  suitOrder: 'shdc',
  straightRule: 'tw',
  straightFlushSpecial: true,
  bombBeatsAll: true,
  allowTriple: false,
  allowSmallStraight: false,
  dragon: false,
  allowFlush: false,
  allowTwoPair: false,
  doubleOverTen: true,
  doubleTwos: true,
}
