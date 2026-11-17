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
  /**
   * 用幾副牌：1 = 大老二；2 = 瘋狂大老二（104 張、每人 26 張）。
   * 兩副牌時：對子先比數字，數字一樣時兩張同花色同數字的「雙胞胎對子」比一般對子大（兩張梅花 3 壓不過一對 4）；
   * 關鍵最大張（數字＋花色）一模一樣的牌型，後出的壓不過先出的（先出為主）；
   * 計分改成剩 20 張以上才加倍、2 不加倍（兩副牌最多 8 張 2）。
   */
  decks?: 1 | 2
  /**
   * 玩到分出名次：第一個人出完後不結束，剩下的人繼續打，直到排出 1～4 名。
   * 分數照原本：第一個人出完那一刻每個人手上剩幾張就扣幾分（之後再打只決定名次）。
   * 出完的人之後輪到他時跳過；他最後出的那手照樣要壓，大家都過牌時由他下一位（還沒出完的）自由出牌。
   */
  playToRank?: boolean
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
  playToRank: false,
}
