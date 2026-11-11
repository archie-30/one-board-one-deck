// 畫面導覽：一個簡單的堆疊。新增遊戲不需要改這裡。
import { computed, reactive } from 'vue'
import type { GameCategory } from '@/games/types'

export type Route =
  | { name: 'home' }
  | { name: 'category'; category: GameCategory }
  | { name: 'lobby' | 'rules' | 'settings' | 'tutorial' | 'play'; gameId: string }

const stack = reactive<Route[]>([{ name: 'home' }])

export const route = computed(() => stack[stack.length - 1])
export const depth = computed(() => stack.length)
export const routeKey = computed(() => {
  const r = route.value
  return r.name + ('gameId' in r ? r.gameId : 'category' in r ? r.category : '')
})

export function go(next: Route) {
  stack.push(next)
}
export function replace(next: Route) {
  stack[stack.length - 1] = next
}
export function back() {
  if (stack.length > 1) stack.pop()
}
