// 快轉：中途加回連線對局時，要把離開期間大家走過的每一步補播一遍。照正常速度播可能要好幾分鐘，
// 所以補播的時候整個畫面先快轉——動畫、轉場、遊戲裡等一下再做的事（setTimeout）都縮短成幾十分之一，
// 音效先關掉；補完（done() 成立）之後再等一下，恢復正常速度，接著照常玩。
// 只在補播那一小段時間打開，各遊戲畫面不用改。
import { setMuted } from './audio'

const SPEED = 25
let on = false

/** 打開快轉，直到 done() 成立（最多 maxMs）才關掉 */
export function runTurbo(done: () => boolean, maxMs = 60_000) {
  if (on) return
  on = true
  const realTimeout = window.setTimeout.bind(window)
  const fast = ((fn: TimerHandler, ms?: number, ...args: unknown[]) => realTimeout(fn, Math.max(0, (ms ?? 0) / SPEED), ...args)) as typeof window.setTimeout
  window.setTimeout = fast
  document.documentElement.classList.add('turbo')
  setMuted(true)
  const started = performance.now()
  let raf = 0
  // 用 element.animate 做的動畫：一個個加速
  const speedUp = () => {
    for (const a of document.getAnimations()) if (a.playbackRate !== SPEED) a.playbackRate = SPEED
    raf = requestAnimationFrame(speedUp)
  }
  raf = requestAnimationFrame(speedUp)
  const stop = () => {
    cancelAnimationFrame(raf)
    window.setTimeout = realTimeout as typeof window.setTimeout
    for (const a of document.getAnimations()) a.playbackRate = 1
    document.documentElement.classList.remove('turbo')
    setMuted(false)
    on = false
  }
  const check = () => {
    if (done() || performance.now() - started > maxMs) {
      // 最後一步的動畫播完再恢復
      realTimeout(stop, 120)
      return
    }
    realTimeout(check, 60)
  }
  realTimeout(check, 60)
}
