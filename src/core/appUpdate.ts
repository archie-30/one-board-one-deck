// Google Play 應用程式內更新（只有 Android App 版；網頁版什麼都不做）。
// 開 App 約 4 秒後問 Play 有沒有新版本；有的話跳我們自己的「有新版本」視窗（ui/UpdateDialog.vue）：
//   立即更新＝Play 內建的全螢幕更新畫面（下載、安裝完自動重開）；Play 不讓用（例如從別的地方安裝）就打開商店頁。
//   之後再說＝這次不問了，下次開 App 再問。
// 參考 INKRAGE 的做法，用同一個外掛 @capawesome/capacitor-app-update。
import { AppUpdate, AppUpdateAvailability } from '@capawesome/capacitor-app-update'
import { ref } from 'vue'
import { isApp } from './native'

const CHECK_DELAY = 4000
/** 有新版本：跳視窗 */
export const updateReady = ref(false)
let immediate = false

/** 開 App 時呼叫一次 */
export function checkForUpdate() {
  if (!isApp) return
  window.setTimeout(async () => {
    try {
      const info = await AppUpdate.getAppUpdateInfo()
      if (info.updateAvailability !== AppUpdateAvailability.UPDATE_AVAILABLE) return
      immediate = !!info.immediateUpdateAllowed
      updateReady.value = true
    } catch (e) {
      // 沒網路、不是從 Play 安裝的（例如開發時直接裝）：不用提醒
      console.warn('AppUpdate:', (e as Error)?.message ?? e)
    }
  }, CHECK_DELAY)
}

/** 立即更新 */
export async function updateNow() {
  updateReady.value = false
  try {
    if (immediate) await AppUpdate.performImmediateUpdate()
    else await AppUpdate.openAppStore()
  } catch {
    // Play 的更新畫面被取消或打不開：改開商店頁讓玩家自己按更新
    try {
      await AppUpdate.openAppStore()
    } catch {
      // 連商店都打不開就算了
    }
  }
}
/** 之後再說 */
export function updateLater() {
  updateReady.value = false
}
