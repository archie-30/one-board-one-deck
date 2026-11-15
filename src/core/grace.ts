// 隔了很久（超過 1 小時）才回來接著玩的存檔：玩家的第一步不限時，讓人先回想一下戰局
import { ref, watch, type Ref, type WatchSource } from 'vue'

export const GRACE_AFTER_MS = 60 * 60 * 1000

/** 回傳「現在還在不限時的第一步」；玩家走完第一步（輪到玩家時局面改變）就結束 */
export function useGrace(options: Record<string, unknown>, state: WatchSource<unknown>, humanTurn: () => boolean): Ref<boolean> {
  const grace = ref(options.graceFirst === true)
  if (grace.value) {
    let wasHuman = humanTurn()
    const stop = watch(state, () => {
      if (wasHuman) {
        grace.value = false
        stop()
      }
      wasHuman = humanTurn()
    })
  }
  return grace
}
