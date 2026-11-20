<script setup lang="ts">
// 蜘蛛接龍牌桌：畫出牌堆、收走的整串、10 疊桌面，處理操作，把動作回報給上層。
// 操作跟接龍一樣：按住拖到想放的那一疊；或先點一張牌（選起那一串），再點要放的那一疊；點兩下自動放到能放的地方。
// 點左上的牌堆：每疊發一張。每張牌都是獨立的精靈（沿用大老二的 cardStage）。
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { playSound } from '@/core/audio'
import { afterReveal } from '@/core/launch'
import { RANK_LABELS, rankOf, suitOf, type Card } from '@/engine/bigtwo/cards'
import { autoTarget, canPlace, cardsAt, type SpiderAction, type SpiderState } from '@/engine/spider/rules'
import CardArt from '@/ui/art/Card.vue'
import { CardStage, type Pose } from '../bigtwo/cardStage'
import { dropCol, spiderLayout, spiderPoses, type SpiderLayout } from './layout'

type Src = { col: number; index: number }
const props = withDefaults(
  defineProps<{
    state: SpiderState
    interactive?: boolean
    /** 提示（教學用）：要亮起來的牌與目標（一疊，或 'stock' 牌堆） */
    hintCards?: readonly Card[]
    hintSpot?: number | 'stock' | null
    dealIn?: boolean
    dealKey?: number
  }>(),
  { interactive: true, hintCards: () => [], hintSpot: null, dealIn: true, dealKey: 0 },
)
const emit = defineEmits<{ action: [action: SpiderAction]; invalid: [cards: Card[]]; ready: [] }>()

const dealing = ref(false)
const canAct = computed(() => props.interactive && !dealing.value)
const selected = ref<Src | null>(null)

const ALL: Card[] = Array.from({ length: 104 }, (_, i) => i)
const salt = Math.floor(Math.random() * 997)
const stageEl = ref<HTMLElement>()
const L = shallowRef<SpiderLayout>(spiderLayout(844, 390))
const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
/** 左上角選單按鈕（距上 0.7rem、大小 2.4rem）下面再留一點空，就是牌堆的上緣 */
const stockTop = () => rem() * (0.7 + 2.4) + Math.max(10, rem() * 0.5)
const measureLayout = (el: HTMLElement) => spiderLayout(el.clientWidth, el.clientHeight, stockTop(), rem() * 8.6)
const stage = new CardStage()
let lastLand = 0
let dealingUntil = 0
stage.onLand = () => {
  const now = performance.now()
  if (now - lastLand > 45) playSound(now < dealingUntil ? 'deal' : 'card')
  lastLand = now
}

const present = computed(() => {
  const s = props.state
  return new Set<Card>([...s.stock, ...s.done.flat(), ...s.tableau.flatMap((c) => [...c.down, ...c.up])])
})
const faceOf = (c: Card) => props.state.faces[c] ?? 0

let prevWhere = new Map<Card, string>()
function sync(instant = false) {
  const { poses, where } = spiderPoses(L.value, props.state, salt)
  const moved: Card[] = []
  for (const [c, w] of where) if (prevWhere.size && prevWhere.get(c) !== w) moved.push(c)
  // 發牌：照疊的順序一張張發；收走一串：從 A 開始一張張飛過去
  const fromStock = moved.length > 0 && moved.every((c) => prevWhere.get(c) === 'stock')
  const colOf = (c: Card) => Number(where.get(c)!.slice(1))
  moved.sort((a, b) => (fromStock ? colOf(a) - colOf(b) : poses.get(a)!.z - poses.get(b)!.z))
  if (fromStock && !instant) dealingUntil = performance.now() + moved.length * 55 + 400
  // 這一批疊在還在飛的牌上面（例如飛回原位的牌、上一張收上去的牌），不會從底下穿過去
  const zb = 900 + stage.lift(moved.length)
  for (const [c, pose] of poses) {
    const k = moved.indexOf(c)
    if (k >= 0 && !instant) {
      const v = Math.random()
      const step = fromStock ? 55 : 40
      stage.move(c, pose, { delay: k * step + v * 20, dur: 300 * (0.9 + v * 0.25), arc: L.value.ch * (0.15 + Math.random() * 0.2), flightZ: zb + k, land: true })
    } else stage.move(c, pose, { dur: 200, instant })
  }
  prevWhere = where
}

/** 發牌：先全部蓋著疊在牌堆，一張張發到桌面；發完再把每疊最上面那張翻開 */
let dealTimer = 0
let resyncAfterDeal = false
function stackAtStock() {
  const { poses } = spiderPoses(L.value, props.state, salt)
  for (const [c, pose] of poses) stage.move(c, { ...pose, x: L.value.stock.x, y: L.value.stock.y, r: 0, f: 0, z: 10 }, { instant: true })
}
function dealAnimation() {
  playSound('shuffle')
  dealing.value = true
  window.clearTimeout(dealTimer)
  const { poses, where } = spiderPoses(L.value, props.state, salt)
  const order: Card[] = []
  const cols = props.state.tableau.map((col) => [...col.down, ...col.up])
  const most = Math.max(0, ...cols.map((c) => c.length))
  for (let round = 0; round < most; round++) cols.forEach((all) => all[round] !== undefined && order.push(all[round]))
  stackAtStock()
  const step = 24
  const dealt = 120 + order.length * step + 360
  dealingUntil = performance.now() + dealt
  order.forEach((c, k) => {
    const v = Math.random()
    stage.move(c, { ...poses.get(c)!, f: 0 }, { delay: 120 + k * step + v * 14, dur: 300 * (0.9 + v * 0.2), arc: 14 + Math.random() * 12, flightZ: 600 + k, land: true })
  })
  for (const [c, pose] of poses) if (!order.includes(c)) stage.move(c, pose, { instant: true })
  prevWhere = where
  const flips = props.state.tableau.flatMap((col) => col.up)
  dealTimer = window.setTimeout(() => {
    flips.forEach((c, k) => {
      window.setTimeout(() => {
        playSound('flip')
        stage.move(c, poses.get(c)!, { dur: 260, arc: 8 })
      }, k * 70)
    })
    dealTimer = window.setTimeout(() => {
      dealing.value = false
      if (resyncAfterDeal) {
        resyncAfterDeal = false
        sync(true)
      }
      emit('ready')
    }, flips.length * 70 + 300)
  }, dealt)
}

let observer: ResizeObserver | undefined
onMounted(() => {
  const el = stageEl.value!
  let size = `${el.clientWidth}x${el.clientHeight}`
  const measure = () => {
    const now = `${el.clientWidth}x${el.clientHeight}`
    if (now === size) return
    size = now
    L.value = measureLayout(el)
    if (dealing.value) resyncAfterDeal = true
    else sync(true)
  }
  L.value = measureLayout(el)
  if (props.dealIn) {
    dealing.value = true
    stackAtStock()
    void afterReveal().then(() => dealAnimation())
  } else sync(true)
  observer = new ResizeObserver(measure)
  observer.observe(el)
})
onBeforeUnmount(() => {
  window.clearTimeout(dealTimer)
  observer?.disconnect()
  stage.destroy()
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
  window.removeEventListener('pointercancel', onCancel)
})
watch(
  () => [props.state, props.dealKey] as const,
  ([, key], [, oldKey]) => {
    selected.value = null
    if (key !== oldKey) {
      prevWhere = new Map()
      if (props.dealIn) dealAnimation()
      else sync(true)
    } else sync()
  },
)

function sourceOf(c: Card): Src | null {
  for (let col = 0; col < props.state.tableau.length; col++) {
    const index = props.state.tableau[col].up.indexOf(c)
    if (index >= 0) return cardsAt(props.state, { col, index }).length ? { col, index } : null
  }
  return null
}
const grabbable = computed(() => {
  const out = new Set<Card>()
  for (const c of present.value) if (sourceOf(c)) out.add(c)
  return out
})
const inStock = (c: Card) => props.state.stock.includes(c)

interface Drag {
  id: number
  from: Src | 'stock'
  cards: Card[]
  base: Pose[]
  x0: number
  y0: number
  moved: boolean
  slop: number
}
let drag: Drag | null = null
function local(e: PointerEvent) {
  const r = stageEl.value!.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}
function onDown(c: Card, e: PointerEvent) {
  if (drag && drag.id !== e.pointerId) onCancel()
  if (!canAct.value || drag) return
  if (e.button !== undefined && e.button > 0) return
  const p = local(e)
  if (inStock(c)) {
    drag = { id: e.pointerId, from: 'stock', cards: [], base: [], x0: p.x, y0: p.y, moved: false, slop: 6 }
  } else {
    const from = sourceOf(c)
    if (!from) {
      // 點到拿不起來的牌（蓋著的、或下面混了花色）：當作點那一疊；沒選牌時抖一下提醒
      const col = props.state.tableau.findIndex((t) => t.down.includes(c) || t.up.includes(c))
      if (col >= 0) {
        if (selected.value) tapCol(col)
        else if (props.state.tableau[col].up.includes(c)) {
          shake([c])
          emit('invalid', [c])
        }
      }
      return
    }
    const cards = cardsAt(props.state, from)
    drag = { id: e.pointerId, from, cards, base: cards.map((k) => stage.target(k)), x0: p.x, y0: p.y, moved: false, slop: e.pointerType === 'mouse' ? 6 : 14 }
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onCancel)
}
function onCancel() {
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
  window.removeEventListener('pointercancel', onCancel)
  const d = drag
  drag = null
  if (d && d.from !== 'stock' && d.moved) { const z = 900 + stage.lift(d.cards.length); d.cards.forEach((c, k) => stage.move(c, d.base[k], { delay: k * 30, dur: 260, arc: 10, flightZ: z + k })) }
}
function onMove(e: PointerEvent) {
  if (!drag || e.pointerId !== drag.id || drag.from === 'stock') return
  const p = local(e)
  const dx = p.x - drag.x0
  const dy = p.y - drag.y0
  if (!drag.moved && Math.hypot(dx, dy) < drag.slop) return
  drag.moved = true
  drag.cards.forEach((c, k) => {
    const b = drag!.base[k]
    stage.move(c, { ...b, x: b.x + dx, y: b.y + dy, r: b.r * 0.4, s: 1.05, z: 1000 + k }, { instant: true })
  })
}
function onUp(e: PointerEvent) {
  if (!drag || e.pointerId !== drag.id) return
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
  window.removeEventListener('pointercancel', onCancel)
  const d = drag
  drag = null
  if (d.from === 'stock') {
    selected.value = null
    emit('action', { type: 'deal' })
    return
  }
  const from = d.from
  if (!d.moved) {
    tapCard(from)
    return
  }
  const p = local(e)
  const col = dropCol(L.value, props.state, d.base[0].x + (p.x - d.x0), d.base[0].y + (p.y - d.y0))
  if (col === from.col && Math.hypot(p.x - d.x0, p.y - d.y0) < L.value.cw * 0.6) {
    d.cards.forEach((c, k) => stage.move(c, d.base[k], { dur: 160 }))
    tapCard(from)
    return
  }
  selected.value = null
  if (col !== null && col !== from.col && canPlace(props.state, d.cards, { col })) emit('action', { type: 'move', from, to: { col } })
  else {
    if (col !== null && col !== from.col) emit('invalid', d.cards)
    { const z = 900 + stage.lift(d.cards.length); d.cards.forEach((c, k) => stage.move(c, d.base[k], { delay: k * 30, dur: 260, arc: 10, flightZ: z + k })) }
  }
}
let lastTap = 0
function tapCard(from: Src) {
  const sel = selected.value
  const now = performance.now()
  const double = now - lastTap < 380
  lastTap = now
  if (sel && sel.col === from.col && sel.index === from.index) {
    selected.value = null
    if (double) {
      const to = autoTarget(props.state, from)
      if (to) emit('action', { type: 'move', from, to })
      else {
        shake(cardsAt(props.state, from))
        emit('invalid', cardsAt(props.state, from))
      }
    }
    return
  }
  if (sel && sel.col !== from.col) return tryMove(sel, from.col)
  selected.value = from
  playSound('cardPick')
}
function tapCol(col: number) {
  if (!canAct.value || !selected.value) return
  if (selected.value.col === col) {
    selected.value = null
    return
  }
  tryMove(selected.value, col)
}
function tryMove(from: Src, col: number) {
  const cards = cardsAt(props.state, from)
  selected.value = null
  if (canPlace(props.state, cards, { col })) emit('action', { type: 'move', from, to: { col } })
  else {
    shake(cards)
    emit('invalid', cards)
  }
}
const selectedCards = computed(() => new Set(selected.value ? cardsAt(props.state, selected.value) : []))
function shake(cards: Card[]) {
  cards.forEach((c, k) => {
    const b = stage.target(c)
    stage.move(c, { ...b, x: b.x + 6, r: b.r + 3 }, { dur: 70, delay: k * 20 })
    window.setTimeout(() => stage.move(c, b, { dur: 160 }), 80 + k * 20)
  })
}
function tapStockSlot() {
  if (!canAct.value || props.state.stock.length) return
  selected.value = null
  emit('action', { type: 'deal' })
}

const hintSet = computed(() => new Set(props.hintCards))
const rankText = (c: Card) => RANK_LABELS[rankOf(faceOf(c))]
const slot = (p: { x: number; y: number }) => ({ left: `${p.x - L.value.cw / 2}px`, top: `${p.y - L.value.ch / 2}px`, width: `${L.value.cw}px`, height: `${L.value.ch}px` })
const hintRect = computed(() => {
  const h = props.hintSpot
  if (h === null) return null
  if (h === 'stock') return slot(L.value.stock)
  const col = props.state.tableau[h]
  const last = col.up[col.up.length - 1] ?? col.down[col.down.length - 1]
  const y = last === undefined ? L.value.cols[h].y : spiderPoses(L.value, props.state, salt).poses.get(last)!.y
  return slot({ x: L.value.cols[h].x, y })
})
defineExpose({ layout: L })
</script>

<template>
  <section ref="stageEl" class="sp">
    <button class="slot stock-slot" :style="slot(L.stock)" aria-label="stock" @click="tapStockSlot" />
    <div class="slot done-slot" :style="slot(L.done[0])" />
    <button v-for="(c, i) in L.cols" :key="`c${i}`" class="slot" :style="slot(c)" :aria-label="`column ${i}`" @click="tapCol(i)" />
    <div v-if="hintRect" class="hint-spot" :style="hintRect" />

    <div class="cards">
      <div
        v-for="c in ALL"
        v-show="present.has(c)"
        :key="c"
        :ref="(el) => stage.attach(c, el as HTMLElement | null)"
        class="sprite"
        :class="{ grab: canAct && grabbable.has(c), stock: canAct && inStock(c), hit: hintSet.has(c), sel: selectedCards.has(c) }"
        :style="{ width: `${L.cw}px`, height: `${L.ch}px`, marginLeft: `${-L.cw / 2}px`, marginTop: `${-L.ch / 2}px` }"
        @pointerdown="onDown(c, $event)"
      >
        <svg class="face" viewBox="-2 -2 78 108" aria-hidden="true"><CardArt :rank="rankText(c)" :suit="suitOf(faceOf(c))" side /></svg>
        <svg class="back" viewBox="-2 -2 78 108" aria-hidden="true"><CardArt back /></svg>
      </div>
    </div>
    <slot :layout="L" />
  </section>
</template>

<style scoped>
.sp {
  position: relative;
  height: 100%;
  overflow: hidden;
  touch-action: none;
  user-select: none;
}
.slot {
  position: absolute;
  border: 0;
  border-radius: 0.45rem;
  background: rgb(20 20 20 / 0.05);
  padding: 0;
}
.stock-slot {
  cursor: pointer;
}
.done-slot {
  background: none;
  border: 0.1rem dashed rgb(20 20 20 / 0.14);
}
.hint-spot {
  position: absolute;
  z-index: 1;
  border: 0.16rem dashed var(--color-blue);
  border-radius: 0.5rem;
  background: rgb(35 64 217 / 0.08);
  pointer-events: none;
  animation: hint 1.1s ease-in-out infinite;
}
@keyframes hint {
  50% {
    transform: scale(1.06);
  }
}
.cards {
  position: absolute;
  inset: 0;
  isolation: isolate;
  z-index: 2;
  pointer-events: none;
}
.sprite {
  position: absolute;
  left: 0;
  top: 0;
  will-change: transform;
  pointer-events: auto;
}
.sprite svg {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.sprite[data-face='1'] .back,
.sprite[data-face='0'] .face {
  display: none;
}
.sprite.grab {
  cursor: grab;
}
.sprite.stock {
  cursor: pointer;
}
.sprite.hit::before {
  content: '';
  position: absolute;
  inset: -5% -6%;
  border: 0.16rem solid var(--color-blue);
  border-radius: 10%;
  box-shadow: 0 0 0.9rem rgb(35 64 217 / 0.35);
  animation: hint 1.1s ease-in-out infinite;
  pointer-events: none;
}
.sprite.sel {
  translate: 0 -6%;
}
.sprite.sel::before {
  content: '';
  position: absolute;
  inset: -3% -4%;
  z-index: 2;
  border: 0.18rem solid var(--color-red);
  border-radius: 10%;
  box-shadow: 0 0.35rem 0.9rem rgb(255 74 28 / 0.28);
  pointer-events: none;
}
@media (hover: hover) and (pointer: fine) {
  .sprite.grab,
  .sprite.stock {
    transition: translate 160ms var(--ease-out);
  }
  .sprite.grab:hover,
  .sprite.stock:hover {
    translate: 0 -4%;
  }
}
</style>
