import { createApp } from 'vue'
import '@fontsource/noto-sans-tc/chinese-traditional-500.css'
import '@fontsource/noto-sans-tc/chinese-traditional-900.css'
import '@fontsource/noto-sans-tc/latin-500.css'
import '@fontsource/noto-sans-tc/latin-900.css'
import '@fontsource/alfa-slab-one/latin-400.css'
import App from './App.vue'
import './style.css'

// ?gallery 只在本機開發時用來檢查美術素材
const gallery = import.meta.env.DEV && location.search.includes('gallery')
if (gallery) import('./dev/Gallery.vue').then((m) => createApp(m.default).mount('#app'))
else createApp(App).mount('#app')

// 開機加載畫面：字型準備好、而且至少轉過一下（約 0.9 秒）才淡出，避免一閃而過
const boot = document.getElementById('boot')
if (boot) {
  const shown = new Promise((ok) => setTimeout(ok, Math.max(0, 900 - performance.now())))
  const fonts = document.fonts?.ready ?? Promise.resolve()
  const cap = new Promise((ok) => setTimeout(ok, 4000)) // 字型萬一卡住也不要一直擋著
  void Promise.all([shown, Promise.race([fonts, cap])]).then(() => {
    boot.classList.add('done')
    setTimeout(() => boot.remove(), 400)
  })
}
