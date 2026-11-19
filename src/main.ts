import { createApp, watchEffect } from 'vue'
import '@fontsource/noto-sans-tc/latin-500.css'
import '@fontsource/noto-sans-tc/latin-900.css'
import '@fontsource/alfa-slab-one/latin-400.css'
// 中文字型：只含遊戲用到的字的小字型（各約 180KB）＋完整字型（另一個名字，遇到罕見字才下載），見 scripts/subset-fonts.py
import './assets/fonts/subset.css'
import App from './App.vue'
import { finishBoot, startFontLoads } from './core/boot'
import { warmSounds } from './core/audio'
import { autoFullscreen } from './core/fullscreen'
import { isApp, setupNative } from './core/native'
import { keepScreenOn } from './core/wakeLock'
import { route, go } from './core/nav'
import { useOnlineService } from './core/online'
import { createWsService, resumeOnline } from './core/onlineWs'
import { settings } from './core/settings'
import { isStaleChunk, reloadForUpdate, takeReopen } from './core/staleReload'
import { getGame } from './games/registry'
import './style.css'

// 字型一開機就開始下載（中文字型很大，不等畫面用到才抓）；加載畫面的進度條照下載進度走
startFontLoads()

// 連線對戰：接上 Cloudflare 上的房間伺服器；這個分頁之前在房間裡（例如重新整理）就接回去
useOnlineService(createWsService())
void resumeOnline()

// ?gallery 只在本機開發時用來檢查美術素材
const gallery = import.meta.env.DEV && location.search.includes('gallery')
if (gallery) import('./dev/Gallery.vue').then((m) => createApp(m.default).mount('#app'))
else {
  const app = createApp(App)
  // 網站更新後舊頁面拿不到舊版遊戲檔（畫面會空白）：重新整理一次載入最新版，回到那個玩法的模式選單
  app.config.errorHandler = (err) => {
    console.error(err)
    if (isStaleChunk(err)) reloadAtCurrentGame()
  }
  app.mount('#app')
}
function reloadAtCurrentGame() {
  const r = route.value
  if ('gameId' in r) {
    const game = getGame(r.gameId)
    reloadForUpdate({ category: game.category, gameId: game.id })
  } else if (r.name === 'category') reloadForUpdate({ category: r.category, gameId: settings.lastGame[r.category] ?? '' })
  else reloadForUpdate()
}
window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault()
  reloadAtCurrentGame()
})
window.addEventListener('unhandledrejection', (e) => {
  if (isStaleChunk(e.reason)) reloadAtCurrentGame()
})

// 手機長按不跳出選單（會打斷拖牌、拖棋子）；輸入框照常可以長按
document.addEventListener('contextmenu', (e) => {
  const t = e.target as HTMLElement | null
  if (!t?.closest('input, textarea')) e.preventDefault()
})

// 鏡頭防遮擋：設定開著時，整個畫面避開手機的瀏海、挖孔鏡頭（樣式在 style.css 的 --cut-*）
watchEffect(() => document.documentElement.classList.toggle('avoid-cutout', settings.avoidCutout))

// Android App：全螢幕、恆亮、返回鍵、鏡頭範圍由 App 外殼處理（core/native.ts）
if (isApp) setupNative()
else {
  // 網頁版：預設全螢幕（第一次點畫面時進入，設定可關）、保持螢幕恆亮（設定可關）
  autoFullscreen()
  keepScreenOn()
}

// 開機加載畫面：準備好後接到主畫面（見 core/boot.ts）
// 音效在背景執行緒先算好（不佔主畫面）
warmSounds()
// 因為網站更新而重新整理過：回到剛剛那個玩法的模式選單（那張卡片已經選好）
const reopen = gallery ? null : takeReopen()
void finishBoot().then(() => {
  if (!reopen || (reopen.category !== 'cards' && reopen.category !== 'board')) return
  if (reopen.gameId) settings.lastGame[reopen.category] = reopen.gameId
  go({ name: 'category', category: reopen.category })
})
