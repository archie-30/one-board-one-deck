// 保持螢幕恆亮（設定，預設開）：用瀏覽器的 Screen Wake Lock，畫面開著時不讓手機自動變暗、鎖螢幕。
// 切到別的分頁／App 時瀏覽器會自己放掉，回來時再要一次；有些瀏覽器要先點一下畫面才給，所以點畫面時也補要一次。
// 瀏覽器不支援時什麼都不做（不會出錯）。之後包成 Android App 時，要確認 WebView 支不支援，不支援就改用 App 端的「保持亮屏」。
import { watch } from 'vue'
import { settings } from './settings'

interface Sentinel {
  release(): Promise<void>
  addEventListener(type: 'release', fn: () => void): void
}
let lock: Sentinel | null = null
let asking = false

async function acquire() {
  const wl = (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<Sentinel> } }).wakeLock
  if (!wl || !settings.keepAwake || lock || asking || document.visibilityState !== 'visible') return
  asking = true
  try {
    const l = await wl.request('screen')
    lock = l
    l.addEventListener('release', () => lock === l && (lock = null))
    // 要到的時候設定剛好被關掉了
    if (!settings.keepAwake) release()
  } catch {
    // 瀏覽器不給（例如沒點過畫面、省電模式）：下次點畫面再試
  } finally {
    asking = false
  }
}

function release() {
  const l = lock
  lock = null
  l?.release().catch(() => {})
}

export function keepScreenOn() {
  if (!('wakeLock' in navigator)) return
  watch(
    () => settings.keepAwake,
    (on) => (on ? acquire() : release()),
    { immediate: true },
  )
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && acquire())
  window.addEventListener('pointerdown', () => acquire(), { passive: true })
}
