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

// ── 過場：用一排牌或一片棋子把畫面蓋住，換好畫面再掀開 ──
export type CurtainKind = 'cards' | 'stones'
export const curtain = reactive<{ kind: CurtainKind | null; phase: 'in' | 'out' }>({ kind: null, phase: 'in' })

const COVER_MS = 400
const REVEAL_MS = 420
let busy = false

/** 蓋住畫面 → 執行 change（切換畫面）→ 掀開。系統設定「減少動態」時直接切換。 */
export function travel(kind: CurtainKind, change: () => void) {
  if (busy) return
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    change()
    return
  }
  busy = true
  curtain.kind = kind
  curtain.phase = 'in'
  window.setTimeout(() => {
    change()
    curtain.phase = 'out'
    window.setTimeout(() => {
      curtain.kind = null
      busy = false
    }, REVEAL_MS)
  }, COVER_MS)
}

export const curtainFor = (category: GameCategory): CurtainKind => (category === 'cards' ? 'cards' : 'stones')
