// 倒數計時的現況：TurnTimer 每一格畫面寫進來，TurnGlow 讀（玩家時間快到時，自己那一側的漸層慢慢變紅、閃爍）。
import { reactive } from 'vue'

export const turnClock = reactive({
  /** 現在在計時的是哪一側（沒在計時＝''） */
  side: '' as '' | 'left' | 'right' | 'top' | 'bottom',
  /** 剩下的比例 1 → 0 */
  left: 1,
})
