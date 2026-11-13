// 畫面導覽：一個簡單的堆疊。新增遊戲不需要改這裡。
// 換頁時使用瀏覽器的 View Transitions：整頁只做極短的淡入淡出，
// 兩個畫面上都有的元素（view-transition-name 相同）會直接「變形」過去，例如選擇畫面的色塊變成大廳的色塊。
import { computed, nextTick, reactive } from 'vue'
import type { GameCategory } from '@/games/types'

export type Route =
  | { name: 'title' }
  | { name: 'category'; category: GameCategory }
  | { name: 'rules' | 'settings' | 'tutorial' | 'play'; gameId: string }

const stack = reactive<Route[]>([{ name: 'title' }])

export const route = computed(() => stack[stack.length - 1])
export const routeKey = computed(() => {
  const r = route.value
  return r.name + ('gameId' in r ? r.gameId : 'category' in r ? r.category : '')
})

type VT = { startViewTransition?: (cb: () => Promise<void>) => unknown }

function transition(change: () => void) {
  const doc = document as unknown as VT
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!doc.startViewTransition || reduced) return change()
  doc.startViewTransition(async () => {
    change()
    await nextTick()
  })
}

export function go(next: Route) {
  transition(() => stack.push(next))
}
export function replace(next: Route) {
  transition(() => {
    stack[stack.length - 1] = next
  })
}
export function back() {
  if (stack.length > 1) transition(() => stack.pop())
}
