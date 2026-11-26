<script setup lang="ts">
// 金字塔接龍牌桌：畫出牌堆、翻牌堆、拿走的牌、金字塔，處理操作，把動作回報給上層。
// 操作：點一張能用的牌選起來，再點要配的那張（加起來 13 就一起拿走）；或按住拖到要配的那張上放開。
// K 點一下就拿走；點兩下自動找配對。點左邊的牌堆翻一張（牌堆空了點格子＝重翻）。
// 每張牌都是獨立的精靈（沿用大老二的 cardStage）。
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { playSound } from '@/core/audio'
import { afterReveal } from '@/core/launch'
import { RANK_LABELS, rankOf, suitOf, type Card } from '@/engine/bigtwo/cards'
import { canDraw, canRemove, cardAt, partnerFor, usable, valueOf, type PyramidAction, type PyramidState, type Spot } from '@/engine/pyramid/rules'
import CardArt from '@/ui/art/Card.vue'
import { CardStage, type Pose } from '../bigtwo/cardStage'
import { dropSpot, pyramidLayout, pyramidPoses, spotOf, type PyramidLayout } from './layout'
import { topEdge } from '../solitaire/topEdge'

export type Invalid = { kind: 'blocked' } | { kind: 'sum'; a: Card; b: Card }
const props = withDefaults(
  defineProps<{
    state: PyramidState
    interactive?: boolean
    /** 提示（教學用）：要亮起來的牌、要不要亮牌堆 */
    hintCards?: readonly Card[]
    hintStock?: boolean
    dealIn?: boolean
    dealKey?: number
  }>(),
  { interactive: true, hintCards: () => [], hintStock: false, dealIn: true, dealKey: 0 },
)
const emit = defineEmits<{ action: [action: PyramidAction]; invalid: [why: Invalid]; ready: [] }>()

const dealing = ref(false)
const canAct = computed(() => props.interactive && !dealing.value)
const selected = ref<Spot | null>(null)

const ALL: Card[] = Array.from({ length: 52 }, (_, i) => i)
const salt = Math.floor(Math.random() * 997)
const stageEl = ref<HTMLElement>()
const L = shallowRef<PyramidLayout>(pyramidLayout(844, 390))
const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
/** 左上角選單按鈕（距上 0.7rem、大小 2.4rem）下面再留一點空，就是牌堆的上緣 */
const stockTop = () => rem() * (0.7 + 2.4) + Math.max(10, rem() * 0.5)
const measureLayout = (el: HTMLElement) => pyramidLayout(el.clientWidth, el.clientHeight, stockTop(), rem() * 8.6, topEdge())
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
  return new Set<Card>([...s.stock, ...s.waste, ...s.gone, ...(s.pyramid.filter((c) => c !== null) as Card[])])
})

let prevWhere = new Map<Card, string>()
function sync(instant = false) {
  const { poses, where } = pyramidPoses(L.value, props.state, salt)
  const moved: Card[] = []
  for (const [c, w] of where) if (prevWhere.size && prevWhere.get(c) !== w) moved.push(c)
  // 重翻：整疊翻回牌堆，一張張很快地飛回去
  const recycle = moved.length > 1 && moved.every((c) => prevWhere.get(c) === 'w' && where.get(c) === 's')
  moved.sort((a, b) => (recycle ? poses.get(b)!.z - poses.get(a)!.z : poses.get(a)!.z - poses.get(b)!.z))
  const zb = 900 + stage.lift(moved.length)
  for (const [c, pose] of poses) {
    const k = moved.indexOf(c)
    if (k >= 0 && !instant) {
      const v = Math.random()
      const step = recycle ? 14 : 70
      stage.move(c, pose, { delay: k * step + v * 20, dur: (recycle ? 240 : 320) * (0.9 + v * 0.25), arc: L.value.ch * (0.12 + Math.random() * 0.18), flightZ: zb + k, land: !recycle || k === 0 })
    } else stage.move(c, pose, { dur: 200, instant })
  }
  if (recycle && !instant) playSound('shuffle')
  prevWhere = where
}

/** 發牌：全部蓋著疊在牌堆，一排排發到金字塔，再一排排翻開 */
let dealTimer = 0
let resyncAfterDeal = false
function stackAtStock() {
  const { poses } = pyramidPoses(L.value, props.state, salt)
  for (const [c, pose] of poses) stage.move(c, { ...pose, x: L.value.stock.x, y: L.value.stock.y, r: 0, f: 0, z: 10 }, { instant: true })
}
function dealAnimation() {
  playSound('shuffle')
  dealing.value = true
  window.clearTimeout(dealTimer)
  const { poses, where } = pyramidPoses(L.value, props.state, salt)
  const order = props.state.pyramid.filter((c) => c !== null) as Card[]
  stackAtStock()
  const step = 38
  const dealt = 120 + order.length * step + 360
  dealingUntil = performance.now() + dealt
  order.forEach((c, k) => {
    const v = Math.random()
    stage.move(c, { ...poses.get(c)!, f: 0 }, { delay: 120 + k * step + v * 14, dur: 320 * (0.9 + v * 0.2), arc: 14 + Math.random() * 12, flightZ: 600 + k, land: true })
  })
  for (const [c, pose] of poses) if (!order.includes(c)) stage.move(c, pose, { instant: true })
  prevWhere = where
  dealTimer = window.setTimeout(() => {
    order.forEach((c, k) => {
      window.setTimeout(() => {
        if (k % 3 === 0) playSound('flip')
        stage.move(c, poses.get(c)!, { dur: 240, arc: 6 })
      }, k * 32)
    })
    dealTimer = window.setTimeout(() => {
      dealing.value = false
      if (resyncAfterDeal) {
        resyncAfterDeal = false
        sync(true)
      }
      emit('ready')
    }, order.length * 32 + 300)
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

const usableSpot = (c: Card): Spot | null => {
  const sp = spotOf(props.state, c)
  return sp && usable(props.state, sp) ? sp : null
}
const grabbable = computed(() => {
  const out = new Set<Card>()
  for (const c of present.value) if (usableSpot(c)) out.add(c)
  return out
})
const stockTopCard = computed(() => (props.state.stock.length ? props.state.stock[props.state.stock.length - 1] : null))
const sameSpot = (a: Spot, b: Spot) => a.pile === b.pile && (a.pile === 'waste' || a.i === (b as { i: number }).i)

interface Drag {
  id: number
  spot: Spot | 'stock'
  card: Card
  base: Pose
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
  if (props.state.stock.includes(c)) {
    drag = { id: e.pointerId, spot: 'stock', card: c, base: stage.target(c), x0: p.x, y0: p.y, moved: false, slop: 6 }
  } else {
    const spot = usableSpot(c)
    if (!spot) {
      // 被壓住的牌：抖一下提醒
      if (props.state.pyramid.includes(c)) {
        shake([c])
        emit('invalid', { kind: 'blocked' })
      }
      return
    }
    drag = { id: e.pointerId, spot, card: c, base: stage.target(c), x0: p.x, y0: p.y, moved: false, slop: e.pointerType === 'mouse' ? 6 : 14 }
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onCancel)
}
function back(d: Drag) {
  const z = 900 + stage.lift(1)
  stage.move(d.card, d.base, { dur: 260, arc: 10, flightZ: z })
}
function onCancel() {
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
  window.removeEventListener('pointercancel', onCancel)
  const d = drag
  drag = null
  if (d && d.spot !== 'stock' && d.moved) back(d)
}
function onMove(e: PointerEvent) {
  if (!drag || e.pointerId !== drag.id || drag.spot === 'stock') return
  const p = local(e)
  const dx = p.x - drag.x0
  const dy = p.y - drag.y0
  if (!drag.moved && Math.hypot(dx, dy) < drag.slop) return
  drag.moved = true
  selected.value = null
  const b = drag.base
  stage.move(drag.card, { ...b, x: b.x + dx, y: b.y + dy, r: b.r * 0.4, s: 1.05, z: 1000 }, { instant: true })
}
function onUp(e: PointerEvent) {
  if (!drag || e.pointerId !== drag.id) return
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
  window.removeEventListener('pointercancel', onCancel)
  const d = drag
  drag = null
  if (d.spot === 'stock') {
    selected.value = null
    emit('action', { type: 'draw' })
    return
  }
  const from = d.spot
  if (!d.moved) {
    tapSpot(from)
    return
  }
  const p = local(e)
  const to = dropSpot(L.value, props.state, p.x, p.y, (sp) => usable(props.state, sp) && !sameSpot(sp, from))
  if (to && canRemove(props.state, [from, to])) {
    emit('action', { type: 'remove', spots: [from, to] })
    return
  }
  back(d)
  if (to) {
    emit('invalid', { kind: 'sum', a: cardAt(props.state, from)!, b: cardAt(props.state, to)! })
    shake([cardAt(props.state, to)!])
  }
}
let lastTap = 0
let lastTapCard: Card | null = null
function tapSpot(spot: Spot) {
  const card = cardAt(props.state, spot)!
  const now = performance.now()
  const double = now - lastTap < 380 && lastTapCard === card
  lastTap = now
  lastTapCard = card
  // K：點一下就拿走
  if (valueOf(card) === 13) {
    selected.value = null
    emit('action', { type: 'remove', spots: [spot] })
    return
  }
  const sel = selected.value
  if (sel && sameSpot(sel, spot)) {
    selected.value = null
    // 點兩下：自動找加起來 13 的那張
    if (double) {
      const pair = partnerFor(props.state, spot)
      if (pair) emit('action', { type: 'remove', spots: pair })
      else shake([card])
    }
    return
  }
  if (sel) {
    if (canRemove(props.state, [sel, spot])) {
      selected.value = null
      emit('action', { type: 'remove', spots: [sel, spot] })
      return
    }
    emit('invalid', { kind: 'sum', a: cardAt(props.state, sel)!, b: card })
    shake([card])
  }
  selected.value = spot
  playSound('cardPick')
}
function shake(cards: Card[]) {
  cards.forEach((c, k) => {
    const b = stage.target(c)
    stage.move(c, { ...b, x: b.x + 6, r: b.r + 3 }, { dur: 70, delay: k * 20 })
    window.setTimeout(() => stage.move(c, b, { dur: 160 }), 80 + k * 20)
  })
}
function tapStockSlot() {
  if (!canAct.value || props.state.stock.length || !canDraw(props.state)) return
  selected.value = null
  emit('action', { type: 'draw' })
}

const selectedCard = computed(() => (selected.value ? cardAt(props.state, selected.value) : null))
const hintSet = computed(() => new Set(props.hintCards))
const rankText = (c: Card) => RANK_LABELS[rankOf(c)]
const slot = (p: { x: number; y: number }) => ({ left: `${p.x - L.value.cw / 2}px`, top: `${p.y - L.value.ch / 2}px`, width: `${L.value.cw}px`, height: `${L.value.ch}px` })
defineExpose({ layout: L })
</script>

<template>
  <section ref="stageEl" class="pt">
    <button class="slot stock-slot" :class="{ again: !state.stock.length && canDraw(state) }" :style="slot(L.stock)" aria-label="stock" @click="tapStockSlot">
      <svg v-if="!state.stock.length && canDraw(state)" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7" /><path d="M4 4v4h4" /></svg>
    </button>
    <div class="slot" :style="slot(L.waste)" />
    <div class="slot gone-slot" :style="slot(L.gone)" />
    <div v-if="hintStock" class="hint-spot" :style="slot(L.stock)" />

    <div class="cards">
      <div
        v-for="c in ALL"
        v-show="present.has(c)"
        :key="c"
        :ref="(el) => stage.attach(c, el as HTMLElement | null)"
        class="sprite"
        :class="{ grab: canAct && grabbable.has(c), stock: canAct && c === stockTopCard, hit: hintSet.has(c), sel: selectedCard === c }"
        :style="{ width: `${L.cw}px`, height: `${L.ch}px`, marginLeft: `${-L.cw / 2}px`, marginTop: `${-L.ch / 2}px` }"
        @pointerdown="onDown(c, $event)"
      >
        <svg class="face" viewBox="-2 -2 78 108" aria-hidden="true"><CardArt :rank="rankText(c)" :suit="suitOf(c)" /></svg>
        <svg class="back" viewBox="-2 -2 78 108" aria-hidden="true"><CardArt back /></svg>
      </div>
    </div>
    <slot :layout="L" />
  </section>
</template>

<style scoped>
.pt {
  position: relative;
  height: 100%;
  overflow: hidden;
  touch-action: none;
  user-select: none;
}
.slot {
  position: absolute;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 0.45rem;
  background: rgb(20 20 20 / 0.05);
  padding: 0;
}
.stock-slot.again {
  cursor: pointer;
}
.stock-slot svg {
  width: 42%;
  fill: none;
  stroke: rgb(20 20 20 / 0.35);
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.gone-slot {
  background: none;
  border: 0.1rem dashed rgb(20 20 20 / 0.14);
}
.hint-spot {
  position: absolute;
  z-index: 3;
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
