// 震動反饋（設定「震動」可關）：依發生的事情大小震不同強度。
// 大部分事情本來就有音效，所以掛在 playSound 上（音效關掉也照樣震）；「輪到你」由 TurnGlow 呼叫。
// App 裡用手機原生震動（分得出強弱）；網頁版用瀏覽器的震動（只能分長短，iPhone 的瀏覽器不支援就不震）。
import type { SfxName } from './sfx'
import { isApp, nativeVibrate } from './native'
import { settings } from './settings'

export type Feel = SfxName | 'turn'

/** [震動的長短（毫秒；多段就是 震, 停, 震…）, 強度 1～255]。使用者嫌弱，整體加強過一次 */
const FEELS: Partial<Record<Feel, [number[], number]>> = {
  // 介面：按鈕、切換、滑卡片（輕輕一下）
  tap: [[12], 90],
  slide: [[14], 110],
  // 撲克牌：每張牌一下
  deal: [[12], 100],
  card: [[15], 130],
  flip: [[13], 110],
  cardPick: [[10], 90],
  collect: [[18], 150],
  shuffle: [[20, 45, 20], 110],
  pass: [[20], 140],
  // 棋盤：落子、走子中等；吃子、提子重一點
  stone: [[20], 180],
  stonePick: [[10], 90],
  piece: [[18], 170],
  xqPiece: [[20], 180],
  piecePick: [[10], 90],
  capture: [[30], 230],
  chessCapture: [[32], 230],
  xqCapture: [[32], 240],
  // 結果與提示
  reveal: [[20], 150],
  correct: [[18, 55, 26], 170],
  error: [[35, 50, 35], 210],
  win: [[45, 70, 45, 70, 130], 255],
  lose: [[220], 190],
  draw: [[55, 80, 55], 180],
  // 輪到你：明顯一點
  turn: [[40, 70, 40], 230],
}

const supported = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
/** 這台裝置震得了嗎（App 一律當作可以；設定頁沒有的話就不放這個開關） */
export const canVibrate = isApp || supported

let last = 0
let quiet = false
/** 快轉補播（連線中途加回來）時不震 */
export const setHapticsQuiet = (v: boolean) => (quiet = v)

export function buzz(feel: Feel) {
  const level = settings.hapticsLevel
  if (level === 'off' || quiet || !canVibrate) return
  const f = FEELS[feel]
  if (!f) return
  // 太密（一次發很多張牌）就跳過幾下，不會震成一整條
  const now = performance.now()
  if (now - last < 35 && feel !== 'turn') return
  last = now
  let [pattern, amp] = f
  // 低：強度約一半、每一下短一點（網頁版只能分長短）
  if (level === 'low') {
    amp = Math.max(1, Math.round(amp * 0.5))
    pattern = pattern.map((ms, i) => (i % 2 ? ms : Math.max(6, Math.round(ms * 0.6))))
  }
  if (isApp) nativeVibrate(pattern, amp)
  else {
    try {
      navigator.vibrate(pattern)
    } catch {
      // 不支援就算了
    }
  }
}
