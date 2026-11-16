// 全螢幕：在瀏覽器預覽時也能全螢幕玩（App 本來就是全螢幕）
import { ref } from 'vue'
import { settings } from './settings'

export const fullscreenSupported = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen && document.fullscreenEnabled !== false
export const isFullscreen = ref(typeof document !== 'undefined' && !!document.fullscreenElement)

if (typeof document !== 'undefined') {
  document.addEventListener('fullscreenchange', () => {
    isFullscreen.value = !!document.fullscreenElement
  })
}

/**
 * 預設全螢幕：瀏覽器不讓網頁自己全螢幕，一定要使用者先點一下。
 * 所以開遊戲後第一次點畫面（或按鍵）時，設定是開的就順便進入全螢幕；只做這一次，
 * 之後玩家自己退出全螢幕就不再硬拉回去。
 */
export function autoFullscreen() {
  if (!fullscreenSupported) return
  armOnce()
  // 全螢幕時切到別的分頁／App 再切回來：瀏覽器會自己退出全螢幕，而且不讓網頁直接再開，
  // 所以回來後「下一次點畫面」就自動恢復全螢幕（切走前是全螢幕才這樣做；自己按退出的不會硬拉回去）
  let wasFull = false
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') wasFull = !!document.fullscreenElement || wasFull
    else if (wasFull && !document.fullscreenElement) {
      wasFull = false
      armOnce()
    } else wasFull = false
  })
  window.addEventListener('blur', () => (wasFull = !!document.fullscreenElement))
  window.addEventListener('focus', () => {
    if (wasFull && !document.fullscreenElement) armOnce()
    wasFull = false
  })
}

/** 下一次點畫面（或按鍵）時進入全螢幕（設定開著才會） */
let armed = false
function armOnce() {
  if (armed) return
  armed = true
  const events = ['pointerup', 'keydown'] as const
  const once = () => {
    events.forEach((t) => window.removeEventListener(t, once, true))
    armed = false
    if (settings.fullscreen) void setFullscreen(true)
  }
  events.forEach((t) => window.addEventListener(t, once, true))
}

export async function setFullscreen(on: boolean) {
  try {
    if (on && !document.fullscreenElement) {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' })
      // 手機瀏覽器全螢幕時順便鎖橫向（不支援就算了）
      const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }
      await o.lock?.('landscape').catch(() => {})
    } else if (!on && document.fullscreenElement) {
      await document.exitFullscreen()
    }
  } catch {
    // 瀏覽器不允許時不做事
  }
}
