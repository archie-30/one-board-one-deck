// Android App 版才有的功能：App 外殼的 ObodPlugin（android/…/ObodPlugin.java）給遊戲呼叫，
// 遊戲也放幾個 window.__obod… 給 App 外殼（MainActivity.java）呼叫。網頁版這裡全部不做事。
// - 保持螢幕恆亮：照設定請 App 開關（WebView 不一定支援網頁的 Wake Lock）。
// - 鏡頭防遮擋：問 App 瀏海／挖孔鏡頭在哪（存成 --ncut-*，style.css 用它；WebView 的 safe-area-inset 常常回報 0）。
// - 返回鍵：跟按 Esc 一樣（關掉最上面的視窗、暫停、回上一頁）；在主畫面沒東西可退就交給系統關掉 App。
// - 切到別的 App：跟網頁版切走分頁一樣自動暫停、存進度；回來時連線房間馬上重連。
import { Capacitor, registerPlugin } from '@capacitor/core'
import { watch } from 'vue'
import { back, route } from './nav'
import { settings } from './settings'

interface ObodPlugin {
  setKeepAwake(o: { on: boolean }): Promise<void>
  cutout(): Promise<{ t: number; r: number; b: number; l: number }>
  vibrate(o: { pattern: number[]; amp: number }): Promise<void>
}
const Obod = registerPlugin<ObodPlugin>('Obod')
type W = Window & {
  __obodBack?: () => boolean
  __obodPause?: () => void
  __obodResume?: () => void
}
const w = (typeof window !== 'undefined' ? window : {}) as W

/** 是不是在 Android App 裡（不是瀏覽器） */
export const isApp = Capacitor.isNativePlatform()

/** App 裡的震動（分得出大小）：pattern＝[震, 停, 震, …] 毫秒，amp＝1～255 */
export function nativeVibrate(pattern: number[], amp: number) {
  void Obod.vibrate({ pattern, amp }).catch(() => {})
}

async function readCutout() {
  try {
    const c = await Obod.cutout()
    const s = document.documentElement.style
    for (const k of ['t', 'r', 'b', 'l'] as const) s.setProperty(`--ncut-${k}`, `${Math.max(0, Number(c[k]) || 0)}px`)
  } catch {
    // 拿不到就照 safe-area-inset（style.css）
  }
}

/** 返回鍵：有東西可退就退（回 true）；在主畫面、沒有視窗開著就回 false，讓系統關掉 App */
function onBack(): boolean {
  const r = route.value.name
  const backdrops = document.querySelectorAll<HTMLElement>('[role="dialog"] .backdrop')
  const top = backdrops[backdrops.length - 1]
  // 暫停選單（整片蓋住的那種）：照 Esc（規則說明／設定裡回選單、選單就繼續遊戲）
  if (top?.classList.contains('cover')) {
    pressEsc()
    return true
  }
  // 其他視窗：有「回上一頁」（data-back）就按它；沒有就點視窗外面（跟手指點旁邊一樣，會不會關由那個視窗自己決定）
  if (top) {
    const btn = top.parentElement?.querySelector<HTMLButtonElement>('[data-back]')
    if (btn) {
      if (!btn.disabled) btn.click()
    } else top.click()
    return true
  }
  if (r === 'title') return false
  // 教學：離開；對局：暫停；其他頁：回上一頁（都跟按 Esc 一樣）
  if (r === 'tutorial') back()
  else pressEsc()
  return true
}
function pressEsc() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
}

export function setupNative() {
  if (!isApp) return
  document.documentElement.classList.add('app')
  watch(
    () => settings.keepAwake,
    (on) => void Obod.setKeepAwake({ on }).catch(() => {}),
    { immediate: true },
  )
  void readCutout()
  window.addEventListener('resize', () => window.setTimeout(readCutout, 120))
  w.__obodBack = onBack
  // 對局畫面聽 blur 自動暫停、存進度
  w.__obodPause = () => {
    window.dispatchEvent(new Event('blur'))
    // 背景音樂停掉（切回來 __obodResume 會送 obod:resume）
    window.dispatchEvent(new Event('obod:pause'))
  }
  // 從背景回來：連線房間馬上重連（core/onlineWs.ts）
  w.__obodResume = () => window.dispatchEvent(new Event('obod:resume'))
}
