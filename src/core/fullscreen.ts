// 全螢幕：在瀏覽器預覽時也能全螢幕玩（App 本來就是全螢幕）
import { ref } from 'vue'
import { settings } from './settings'
import { S } from '@/data/strings'

export const fullscreenSupported = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen && document.fullscreenEnabled !== false
export const isFullscreen = ref(typeof document !== 'undefined' && !!document.fullscreenElement)

if (typeof document !== 'undefined') {
  document.addEventListener('fullscreenchange', () => {
    isFullscreen.value = !!document.fullscreenElement
  })
}

/** 畫面上方的小提示（例如「再按一次以退出全螢幕」）；App.vue 顯示，空字串就不顯示 */
export const fsHint = ref('')
let hintTimer = 0
function hint(text: string, ms = 2200) {
  fsHint.value = text
  window.clearTimeout(hintTimer)
  hintTimer = window.setTimeout(() => (fsHint.value = ''), ms)
}
/** 玩家自己連按兩次返回、刻意退出全螢幕：之後點畫面不要硬拉回去（切走再回來、或到設定重新打開才恢復） */
let stayOut = false
/** 第一次按返回的時間（2.5 秒內再按一次才真的退出） */
let backAt = 0
/** 在網址歷史裡墊一格：手機側滑返回時先退到這一格（不會離開遊戲），由我們決定要不要退出全螢幕 */
function pushGuard() {
  if (!(history.state as { obodFs?: boolean } | null)?.obodFs) history.pushState({ obodFs: true }, '')
}

/**
 * 預設全螢幕：瀏覽器不讓網頁自己全螢幕，一定要使用者先點一下。
 * - 開遊戲後第一次點畫面（或按鍵）時，設定是開的就進入全螢幕。
 * - 離開全螢幕（切到別的分頁／App、關掉再打開、瀏覽器自己退出）：設定還開著，下一次點畫面就恢復全螢幕，並在上方提示一下。
 * - 手機側滑返回：全螢幕時第一次先攔下來、提示「再按一次以退出全螢幕」，2.5 秒內再按一次才真的退出（之後點畫面不會硬拉回去）。
 *   有些瀏覽器的返回會直接退出全螢幕、攔不到，那就照上一條：提示並在下一次點畫面時恢復。
 */
export function autoFullscreen() {
  if (!fullscreenSupported) return
  armOnce()
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) {
      stayOut = false
      pushGuard()
      return
    }
    if (!settings.fullscreen || stayOut) return
    armOnce()
    if (document.visibilityState === 'visible') hint(S.app.fsTapBack, 2600)
  })
  // 切走再回來（分頁、App）：設定開著就等下一次點畫面恢復；刻意退出的也重新算
  const back = () => {
    if (document.visibilityState !== 'visible' || document.fullscreenElement || !settings.fullscreen) return
    stayOut = false
    armOnce()
  }
  document.addEventListener('visibilitychange', back)
  window.addEventListener('focus', back)
  window.addEventListener('popstate', () => {
    if (!document.fullscreenElement) return
    const now = Date.now()
    if (now - backAt < 2500) {
      backAt = 0
      stayOut = true
      fsHint.value = ''
      void setFullscreen(false)
      return
    }
    backAt = now
    pushGuard()
    hint(S.app.fsBackAgain, 2500)
  })
}

/** 下一次點畫面（或按鍵）時進入全螢幕（設定開著才會） */
let armed = false
/** 正在進入全螢幕（點畫面那一下觸發的） */
let entering: Promise<void> | null = null

/**
 * 等「剛剛那一下點擊觸發的全螢幕」切換完、畫面大小穩定下來（沒有就馬上好）。
 * 開始遊戲的翻卡片過場要等這個：切全螢幕時手機會停頓、整個畫面重排，
 * 過場如果同時開始，拿起、翻面那段會被吃掉（看起來像直接跳到色塊），卡片位置也會算錯。
 */
export async function fullscreenSettled(): Promise<void> {
  if (!entering) return
  await entering
  // 等大小不再變（最多 0.8 秒）
  await new Promise<void>((resolve) => {
    let quiet = 0
    const done = () => {
      window.removeEventListener('resize', bump)
      window.clearTimeout(cap)
      resolve()
    }
    const bump = () => {
      window.clearTimeout(quiet)
      quiet = window.setTimeout(done, 160)
    }
    const cap = window.setTimeout(done, 800)
    window.addEventListener('resize', bump)
    bump()
  })
}
function armOnce() {
  if (armed) return
  armed = true
  const events = ['pointerup', 'keydown'] as const
  const once = () => {
    events.forEach((t) => window.removeEventListener(t, once, true))
    armed = false
    if (settings.fullscreen) entering = setFullscreen(true).finally(() => (entering = null))
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
