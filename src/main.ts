import { createApp } from 'vue'
import '@fontsource/noto-sans-tc/chinese-traditional-500.css'
import '@fontsource/noto-sans-tc/chinese-traditional-900.css'
import '@fontsource/noto-sans-tc/latin-500.css'
import '@fontsource/noto-sans-tc/latin-900.css'
import '@fontsource/alfa-slab-one/latin-400.css'
import App from './App.vue'
import { finishBoot } from './core/boot'
import './style.css'

// ?gallery 只在本機開發時用來檢查美術素材
const gallery = import.meta.env.DEV && location.search.includes('gallery')
if (gallery) import('./dev/Gallery.vue').then((m) => createApp(m.default).mount('#app'))
else createApp(App).mount('#app')

// 開機加載畫面：準備好後接到主畫面（見 core/boot.ts）
void finishBoot()
