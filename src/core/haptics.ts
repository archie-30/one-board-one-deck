// 震動反饋（設定「震動」可關）：依發生的事情大小震不同強度。
// 大部分事情本來就有音效，所以掛在 playSound 上（音效關掉也照樣震）；「輪到你」由 TurnGlow 呼叫。
// App 裡用手機原生震動（分得出強弱）；網頁版用瀏覽器的震動（只能分長短，iPhone 的瀏覽器不支援就不震）。
import type { SfxName } from './sfx'
import { isApp, nativeVibrate } from './native'
import { settings } from './settings'

export type Feel = SfxName | 'turn'

/** [震動的長短（毫秒；多段就是 震, 停, 震…）, 強度 1～255]。沒列的（按按鈕、卡片滑動）不震 */
const FEELS: Partial<Record<Feel, [number[], number]>> = {
  // 撲克牌：每張牌輕輕一下
  deal: [[7], 45],
  card: [[9], 70],
  flip: [[8], 55],
  cardPick: [[6], 40],
  collect: [[12], 90],
  shuffle: [[14, 40, 14], 50],
  pass: [[14], 80],
  // 棋盤：落子、走子中等；吃子、提子重一點
  stone: [[14], 120],
  stonePick: [[6], 40],
  piece: [[12], 100],
  xqPiece: [[14], 120],
  piecePick: [[6], 40],
  capture: [[20], 170],
  chessCapture: [[22], 170],
  xqCapture: [[22], 180],
  // 介面
  reveal: [[14], 90],
  correct: [[12, 50, 18], 110],
  error: [[25, 45, 25], 150],
  win: [[30, 60, 30, 60, 90], 210],
  lose: [[160], 120],
  draw: [[40, 70, 40], 120],
  // 輪到你：明顯一點
  turn: [[28, 60, 28], 170],
}

const supported = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
/** 這台裝置震得了嗎（App 一律當作可以；設定頁沒有的話就不放這個開關） */
export const canVibrate = isApp || supported

let last = 0
let quiet = false
/** 快轉補播（連線中途加回來）時不震 */
export const setHapticsQuiet = (v: boolean) => (quiet = v)

export function buzz(feel: Feel) {
  if (!settings.haptics || quiet || !canVibrate) return
  const f = FEELS[feel]
  if (!f) return
  // 太密（一次發很多張牌）就跳過幾下，不會震成一整條
  const now = performance.now()
  if (now - last < 35 && feel !== 'turn') return
  last = now
  const [pattern, amp] = f
  if (isApp) nativeVibrate(pattern, amp)
  else {
    try {
      navigator.vibrate(pattern)
    } catch {
      // 不支援就算了
    }
  }
}
