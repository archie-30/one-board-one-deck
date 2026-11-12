import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

// ?gallery 只在本機開發時用來檢查美術素材
const gallery = import.meta.env.DEV && location.search.includes('gallery')
if (gallery) import('./dev/Gallery.vue').then((m) => createApp(m.default).mount('#app'))
else createApp(App).mount('#app')
