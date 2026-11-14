// 進入遊戲的過場：模式卡片放大到整個畫面 → 等遊戲畫面真的準備好 → 往上揭開。
// 過場層放在 App 最上層（不跟著換頁消失），所以不會出現「動畫跑完了遊戲還沒出來」的空白。
import { markRaw, shallowReactive, type Component } from 'vue'

interface Launch {
  active: boolean
  key: number
  rect: { left: number; top: number; width: number; height: number }
  color: string
  cover: Component | null
}

export const launch = shallowReactive<Launch>({ active: false, key: 0, rect: { left: 0, top: 0, width: 0, height: 0 }, color: '', cover: null })

let grown: (() => void) | null = null
let reveal: (() => void) | null = null

/** 開始放大；回傳的 Promise 在卡片放滿整個畫面時完成 */
export function startLaunch(rect: Launch['rect'], color: string, cover: Component): Promise<void> {
  Object.assign(launch, { active: true, key: launch.key + 1, rect, color, cover: markRaw(cover) })
  return new Promise((resolve) => (grown = resolve))
}

/** 過場層呼叫：已經放滿 */
export function notifyGrown() {
  grown?.()
  grown = null
}

/** 過場層呼叫：註冊「揭開」要做的事 */
export function onReveal(fn: (() => void) | null) {
  reveal = fn
}

/** 對局畫面準備好時呼叫：揭開過場 */
export function revealLaunch() {
  if (launch.active) reveal?.()
}

export function endLaunch() {
  launch.active = false
}
