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
  /** 同花是否算牌型 */
  allowFlush: boolean
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
  allowFlush: false,
  doubleOverTen: true,
  doubleTwos: true,
}
