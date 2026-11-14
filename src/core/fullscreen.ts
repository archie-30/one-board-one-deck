// 全螢幕：在瀏覽器預覽時也能全螢幕玩（App 本來就是全螢幕）
import { ref } from 'vue'

export const fullscreenSupported = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen && document.fullscreenEnabled !== false
export const isFullscreen = ref(typeof document !== 'undefined' && !!document.fullscreenElement)

if (typeof document !== 'undefined') {
  document.addEventListener('fullscreenchange', () => {
    isFullscreen.value = !!document.fullscreenElement
  })
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
