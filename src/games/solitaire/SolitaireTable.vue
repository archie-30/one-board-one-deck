<script setup lang="ts">
// 接龍牌桌：畫出牌堆、收牌區、7 疊桌面，處理「點一下」與「按住拖曳」，把動作回報給上層。
// 每張牌都是獨立的精靈（沿用大老二的 cardStage），換位置時各自飛過去。
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { playSound } from '@/core/audio'
import { RANK_LABELS, rankOf, suitOf, type Card } from '@/engine/bigtwo/cards'
import { autoTarget, canPlace, cardsAt, type SolitaireAction, type SolitaireState, type Source, type Target } from '@/engine/solitaire/rules'
import CardArt from '@/ui/art/Card.vue'
import { CardStage, type Pose } from '../bigtwo/cardStage'
import { dropSpot, solLayout, solPoses, type SolLayout } from './layout'

const props = withDefaults(
  defineProps<{
    state: SolitaireState
    interactive?: boolean
    /** 提示：要亮起來的牌與目標位置（'stock' = 牌堆） */
    hintCards?: readonly Card[]
    hintSpot?: Target | 'stock' | null
    /** 發牌動畫（第一次出現、以及這個數字改變時，從牌堆一張一張發出去） */
    dealIn?: boolean
    dealKey?: number
  }>(),
  { interactive: true, hintCards: () => [], hintSpot: null, dealIn: true, dealKey: 0 },
)
const emit = defineEmits<{ action: [action: SolitaireAction]; invalid: [] }>()

const ALL: Card[] = Array.from({ length: 52 }, (_, i) => i)
const salt = Math.floor(Math.random() * 997)
const stageEl = ref<HTMLElement>()
const L = shallowRef<SolLayout>(solLayout(844, 390))
const stage = new CardStage()
let lastLand = 0
let dealingUntil = 0
stage.onLand = () => {
  const now = performance.now()
  if (now - lastLand > 45) playSound(now < dealingUntil ? 'deal' : 'card')
  lastLand = now
}

/** 這副牌裡有哪些牌（教學時只用到幾張） */
const present = computed(() => {
  const s = props.state
  return new Set<Card>([...s.stock, ...s.waste, ...s.foundations.flat(), ...s.tableau.flatMap((c) => [...c.down, ...c.up])])
})

let prevWhere = new Map<Card, string>()
function sync(instant = false) {
  const { poses, where } = solPoses(L.value, props.state, salt)
  // 換了位置的牌：依在新位置的順序各自飛，起飛時間、速度、弧度都有一點不同
  const moved: Card[] = []
  for (const [c, w] of where) if (prevWhere.size && prevWhere.get(c) !== w) moved.push(c)
  moved.sort((a, b) => poses.get(a)!.z - poses.get(b)!.z)
  for (const [c, pose] of poses) {
    const k = moved.indexOf(c)
    if (k >= 0 && !instant) {
      const v = Math.random()
      stage.move(c, pose, { delay: k * 45 + v * 25, dur: 300 * (0.9 + v * 0.25), arc: L.value.ch * (0.15 + Math.random() * 0.2), flightZ: 900 + k, land: true })
    } else stage.move(c, pose, { dur: 200, instant })
  }
  prevWhere = where
}

/** 發牌：先全部疊在牌堆位置，再一張一張飛到桌面 */
function dealAnimation() {
  playSound('shuffle')
  dealingUntil = performance.now() + 2200
  const { poses, where } = solPoses(L.value, props.state, salt)
  const order: Card[] = []
  // 依真實發牌順序：一輪一輪往右發
  for (let round = 0; round < 7; round++)
    props.state.tableau.forEach((col, ci) => {
      const all = [...col.down, ...col.up]
      if (round >= ci && all[round - ci] !== undefined) order.push(all[round - ci])
    })
  for (const [c, pose] of poses) {
    stage.move(c, { ...pose, x: L.value.stock.x, y: L.value.stock.y, r: 0, f: 0, z: 10 }, { instant: true })
  }
  order.forEach((c, k) => {
    const v = Math.random()
    stage.move(c, poses.get(c)!, { delay: 120 + k * 32 + v * 18, dur: 320 * (0.9 + v * 0.2), arc: 14 + Math.random() * 12, flightZ: 600 + k, land: true })
  })
  for (const [c, pose] of poses) if (!order.includes(c)) stage.move(c, pose, { instant: true })
  prevWhere = where
}

let observer: ResizeObserver | undefined
onMounted(() => {
  const el = stageEl.value!
  let size = `${el.clientWidth}x${el.clientHeight}`
  const measure = () => {
    // 只有畫面大小真的改變才重排（剛開始觀察時也會呼叫一次，不能打斷發牌動畫）
    const now = `${el.clientWidth}x${el.clientHeight}`
    if (now === size) return
    size = now
    L.value = solLayout(el.clientWidth, el.clientHeight)
    sync(true)
  }
  L.value = solLayout(el.clientWidth, el.clientHeight)
  if (props.dealIn) dealAnimation()
  else sync(true)
  observer = new ResizeObserver(measure)
  observer.observe(el)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  stage.destroy()
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
})
// 新的一局：重新發牌；其他狀態變化：換了位置的牌飛過去
watch(
  () => [props.state, props.dealKey] as const,
  ([, key], [, oldKey]) => {
    if (key !== oldKey) {
      prevWhere = new Map()
      if (props.dealIn) dealAnimation()
      else sync(true)
    } else sync()
  },
)

// ── 拿牌：哪些牌可以拿 ──
function sourceOf(c: Card): Source | null {
  const s = props.state
  if (s.waste.length && s.waste[s.waste.length - 1] === c) return { pile: 'waste' }
  for (let slot = 0; slot < 4; slot++) {
    const f = s.foundations[slot]
    if (f.length && f[f.length - 1] === c) return { pile: 'foundation', slot }
  }
  for (let col = 0; col < 7; col++) {
    const index = s.tableau[col].up.indexOf(c)
    if (index >= 0) return { pile: 'tableau', col, index }
  }
  return null
}
const grabbable = computed(() => {
  const out = new Set<Card>()
  for (const c of present.value) if (sourceOf(c)) out.add(c)
  return out
})
const inStock = (c: Card) => props.state.stock.includes(c)

// ── 點一下／拖曳 ──
interface Drag {
  id: number
  from: Source | 'stock'
  cards: Card[]
  base: Pose[]
  x0: number
  y0: number
  moved: boolean
}
let drag: Drag | null = null
function local(e: PointerEvent) {
  const r = stageEl.value!.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}
function onDown(c: Card, e: PointerEvent) {
  if (!props.interactive || drag) return
  if (e.button !== undefined && e.button > 0) return
  const p = local(e)
  if (inStock(c)) {
    drag = { id: e.pointerId, from: 'stock', cards: [], base: [], x0: p.x, y0: p.y, moved: false }
  } else {
    const from = sourceOf(c)
    if (!from) return
    const cards = cardsAt(props.state, from)
    drag = { id: e.pointerId, from, cards, base: cards.map((k) => stage.target(k)), x0: p.x, y0: p.y, moved: false }
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}
function onMove(e: PointerEvent) {
  if (!drag || e.pointerId !== drag.id || drag.from === 'stock') return
  const p = local(e)
  const dx = p.x - drag.x0
  const dy = p.y - drag.y0
  if (!drag.moved && Math.hypot(dx, dy) < 6) return
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
  const d = drag
  drag = null
  if (d.from === 'stock') {
    emit('action', { type: 'draw' })
    return
  }
  const from = d.from
  if (!d.moved) {
    // 點一下：自動送到能放的地方
    const to = autoTarget(props.state, from)
    if (to) emit('action', { type: 'move', from, to })
    else {
      shake(d.cards)
      emit('invalid')
    }
    return
  }
  const p = local(e)
  // 用拿著的那張牌的中心判斷放在哪裡
  const spot = dropSpot(L.value, props.state, d.base[0].x + (p.x - d.x0), d.base[0].y + (p.y - d.y0))
  if (spot && spot.pile !== 'stock' && spot.pile !== 'waste' && canPlace(props.state, d.cards, spot as Target) && !sameSpot(from, spot as Target)) {
    emit('action', { type: 'move', from, to: spot as Target })
  } else {
    if (spot && !sameSpot(from, spot as Target)) emit('invalid')
    // 放不下：各自飛回原位
    d.cards.forEach((c, k) => stage.move(c, d.base[k], { delay: k * 30, dur: 260, arc: 10, flightZ: 1000 + k }))
  }
}
function sameSpot(from: Source, to: Target) {
  if (from.pile === 'tableau' && to.pile === 'tableau') return from.col === to.col
  if (from.pile === 'foundation' && to.pile === 'foundation') return from.slot === to.slot
  return false
}
function shake(cards: Card[]) {
  cards.forEach((c, k) => {
    // 用終點姿勢來抖：牌還在飛（翻面中）時被點，也不會卡在變形的樣子
    const b = stage.target(c)
    stage.move(c, { ...b, x: b.x + 6, r: b.r + 3 }, { dur: 70, delay: k * 20 })
    window.setTimeout(() => stage.move(c, b, { dur: 160 }), 80 + k * 20)
  })
}
function tapStockSlot() {
  if (!props.interactive || props.state.stock.length) return
  emit('action', { type: 'draw' })
}

const hintSet = computed(() => new Set(props.hintCards))
const rankText = (c: Card) => RANK_LABELS[rankOf(c)]
const slot = (p: { x: number; y: number }) => ({ left: `${p.x - L.value.cw / 2}px`, top: `${p.y - L.value.ch / 2}px`, width: `${L.value.cw}px`, height: `${L.value.ch}px` })
const hintRect = computed(() => {
  const h = props.hintSpot
  if (!h) return null
  if (h === 'stock') return slot(L.value.stock)
  if (h.pile === 'foundation') return slot(L.value.foundations[h.slot])
  const s = props.state.tableau[h.col]
  const n = s.down.length + s.up.length
  const { y } = n ? solPoses(L.value, props.state, salt).poses.get(s.up[s.up.length - 1] ?? s.down[s.down.length - 1])! : L.value.cols[h.col]
  return slot({ x: L.value.cols[h.col].x, y })
})
defineExpose({ layout: L })
</script>

<template>
  <section ref="stageEl" class="sol">
    <!-- 空位的框：牌堆、收牌區、桌面 -->
    <button class="slot stock-slot" :style="slot(L.stock)" :aria-label="'stock'" @click="tapStockSlot">
      <svg viewBox="0 0 24 24" class="again" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </button>
    <div class="slot" :style="slot(L.waste)" />
    <div v-for="(f, i) in L.foundations" :key="`f${i}`" class="slot found" :style="slot(f)">
      <span class="t-slab">A</span>
    </div>
    <div v-for="(c, i) in L.cols" :key="`c${i}`" class="slot col" :style="slot(c)"><span class="t-slab">K</span></div>
    <div v-if="hintRect" class="hint-spot" :style="hintRect" />

    <div class="cards">
      <div
        v-for="c in ALL"
        v-show="present.has(c)"
        :key="c"
        :ref="(el) => stage.attach(c, el as HTMLElement | null)"
        class="sprite"
        :class="{ grab: interactive && grabbable.has(c), stock: interactive && inStock(c), hit: hintSet.has(c) }"
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
.sol {
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
  border: 0.13rem dashed rgb(20 20 20 / 0.28);
  border-radius: 0.45rem;
  background: none;
  padding: 0;
  color: rgb(20 20 20 / 0.22);
}
.stock-slot {
  cursor: pointer;
}
.again {
  width: 40%;
}
.found {
  background-image: radial-gradient(rgb(20 20 20 / 0.1) 30%, transparent 32%);
  background-size: 0.45rem 0.45rem;
}
.found span,
.col span {
  font-size: 1.3rem;
}
.hint-spot {
  position: absolute;
  z-index: 1;
  border: 0.2rem solid var(--color-ink);
  border-radius: 0.5rem;
  background: rgb(255 194 26 / 0.55);
  box-shadow: 0.2rem 0.2rem 0 var(--color-ink);
  pointer-events: none;
  animation: hint 0.9s ease-in-out infinite;
}
@keyframes hint {
  50% {
    transform: translateY(-4%);
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
.sprite.grab,
.sprite.stock {
  cursor: grab;
}
.sprite.stock {
  cursor: pointer;
}
/* 提示：亮起來的牌墊一塊黃色，輕輕上下跳 */
.sprite.hit::before {
  content: '';
  position: absolute;
  inset: -3% -7% -5%;
  z-index: -1;
  border: 0.2rem solid var(--color-ink);
  border-radius: 10%;
  background: var(--color-yellow);
  box-shadow: 0.2rem 0.2rem 0 var(--color-ink);
  animation: hint 0.9s ease-in-out infinite;
  pointer-events: none;
}
/* 滑鼠移到可以拿的牌上：浮起一點 */
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
