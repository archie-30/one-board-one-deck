// 減少動畫：系統設定的「減少動態」或遊戲設定裡的「減少動畫」，任一個開著就停掉動畫
import { watch } from 'vue'
import { settings } from './settings'

export function reducedMotion(): boolean {
  if (settings.reduceMotion) return true
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// 在 <html> 加上 class，讓 CSS 動畫也一起停
watch(
  () => settings.reduceMotion,
  (on) => document.documentElement.classList.toggle('reduce-motion', on),
  { immediate: true },
)
