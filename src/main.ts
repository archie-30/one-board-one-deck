import { createApp } from 'vue'
import '@fontsource/noto-sans-tc/chinese-traditional-500.css'
import '@fontsource/noto-sans-tc/chinese-traditional-900.css'
import '@fontsource/noto-sans-tc/latin-500.css'
import '@fontsource/noto-sans-tc/latin-900.css'
import '@fontsource/alfa-slab-one/latin-400.css'
import App from './App.vue'
import { finishBoot } from './core/boot'
import { warmSounds } from './core/audio'
import { autoFullscreen } from './core/fullscreen'
import './style.css'

// ?gallery 只在本機開發時用來檢查美術素材
const gallery = import.meta.env.DEV && location.search.includes('gallery')
if (gallery) import('./dev/Gallery.vue').then((m) => createApp(m.default).mount('#app'))
else createApp(App).mount('#app')

// 手機長按不跳出選單（會打斷拖牌、拖棋子）；輸入框照常可以長按
document.addEventListener('contextmenu', (e) => {
  const t = e.target as HTMLElement | null
  if (!t?.closest('input, textarea')) e.preventDefault()
})

// 預設全螢幕：第一次點畫面時進入（設定可關）
autoFullscreen()

// 開機加載畫面：準備好後接到主畫面（見 core/boot.ts）
// 音效在背景執行緒先算好（不佔主畫面）
warmSounds()
void finishBoot()
