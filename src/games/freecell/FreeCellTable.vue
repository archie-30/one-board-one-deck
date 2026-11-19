<script setup lang="ts">
// 新接龍牌桌：畫出暫存格、收牌區、8 疊桌面，處理操作，把動作回報給上層。
// 操作跟接龍一樣：按住拖到想放的地方；或先點一張牌（選起那一串），再點要放的地方；點兩下自動放到能放的地方。
// 每張牌都是獨立的精靈（沿用大老二的 cardStage）。發牌：蓋著從下方發到 8 疊，發完一排排翻開。
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { playSound } from '@/core/audio'
import { afterReveal } from '@/core/launch'
import { RANK_LABELS, rankOf, suitOf, type Card } from '@/engine/bigtwo/cards'
import { applyFreeCell, autoTarget, cardsAt, fitSource, type FreeCellAction, type FreeCellError, type FreeCellState, type Source, type Target } from '@/engine/freecell/rules'
import CardArt from '@/ui/art/Card.vue'
import { SUIT_PATHS, isRedSuit } from '@/ui/art/suits'
import { CardStage, type Pose } from '../bigtwo/cardStage'
import { dropSpot, freeCellLayout, freeCellPoses, type FreeCellLayout } from './layout'

const props = withDefaults(
  defineProps<{
    state: FreeCellState
    interactive?: boolean
    hintCards?: readonly Card[]
    hintSpot?: Target | null
    dealIn?: boolean
    dealKey?: number
  }>(),
  { interactive: true, hintCards: () => [], hintSpot: null, dealIn: true, dealKey: 0 },
)
const emit = defineEmits<{ action: [action: FreeCellAction]; invalid: [reason: FreeCellError]; ready: [] }>()

const dealing = ref(false)
const canAct = computed(() => props.interactive && !dealing.value)
const selected = ref<Source | null>(null)

const ALL: Card[] = Array.from({ length: 52 }, (_, i) => i)
const salt = Math.floor(Math.random() * 997)
const stageEl = ref<HTMLElement>()
const L = shallowRef<FreeCellLayout>(freeCellLayout(844, 390))
const cellTop = () => {
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  return rem * (0.7 + 2.4) + Math.max(10, rem * 0.5)
}
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
  return new Set<Card>([...(s.cells.filter((c) => c !== null) as Card[]), ...s.foundations.flat(), ...s.tableau.flat()])
})

let prevWhere = new Map<Card, string>()
function sync(instant = false) {
  const { poses, where } = freeCellPoses(L.value, props.state, salt)
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

/**
 * 發牌：一副牌蓋著疊在桌面下方的空地，一張張蓋著發到 8 疊（一輪一輪發）；
 * 發完再一排一排翻開（從上面那排往下，像浪一樣），翻完才能操作。
 */
let dealTimer = 0
let resyncAfterDeal = false
const deckAt = () => ({ x: (L.value.cols[3].x + L.value.cols[4].x) / 2, y: L.value.H - L.value.ch * 0.62 })
function stackAtDeck() {
  const { poses } = freeCellPoses(L.value, props.state, salt)
  const d = deckAt()
  let i = 0
  for (const [c, pose] of poses) stage.move(c, { ...pose, x: d.x - i * 0.12, y: d.y - i * 0.18, r: 0, f: 0, z: 10 + i++ }, { instant: true })
}
function dealAnimation() {
  playSound('shuffle')
  dealing.value = true
  window.clearTimeout(dealTimer)
  const { poses, where } = freeCellPoses(L.value, props.state, salt)
  const order: Card[] = []
  const cols = props.state.tableau
  const most = Math.max(0, ...cols.map((c) => c.length))
  for (let round = 0; round < most; round++) cols.forEach((col) => col[round] !== undefined && order.push(col[round]))
  for (const [c, pose] of poses) if (!order.includes(c)) stage.move(c, pose, { instant: true })
  // 要先發的牌疊在最上面
  const d = deckAt()
  order.forEach((c, i) => {
    const k = order.length - 1 - i
    stage.move(c, { ...poses.get(c)!, x: d.x - k * 0.12, y: d.y - k * 0.18, r: 0, f: 0, z: 10 + k }, { instant: true })
  })
  const step = 28
  const dealt = 120 + order.length * step + 340
  dealingUntil = performance.now() + dealt
  order.forEach((c, k) => {
    const v = Math.random()
    stage.move(c, { ...poses.get(c)!, f: 0 }, { delay: 120 + k * step + v * 14, dur: 300 * (0.9 + v * 0.2), arc: 14 + Math.random() * 12, flightZ: 600 + k, land: true })
  })
  prevWhere = where
  // 發完：一排一排翻開，同一排從左到右微微錯開
  dealTimer = window.setTimeout(() => {
    let last = 0
    for (let round = 0; round < most; round++)
      cols.forEach((col, ci) => {
        const c = col[round]
        if (c === undefined) return
        const at = round * 70 + ci * 16
        last = Math.max(last, at)
        window.setTimeout(() => stage.move(c, poses.get(c)!, { dur: 240, arc: 6 }), at)
      })
    for (let round = 0; round < most; round += 2) window.setTimeout(() => playSound('flip'), round * 70)
    dealTimer = window.setTimeout(() => {
      dealing.value = false
      if (resyncAfterDeal) {
        resyncAfterDeal = false
        sync(true)
      }
      emit('ready')
    }, last + 300)
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
    L.value = freeCellLayout(el.clientWidth, el.clientHeight, cellTop())
    if (dealing.value) resyncAfterDeal = true
    else sync(true)
  }
  L.value = freeCellLayout(el.clientWidth, el.clientHeight, cellTop())
  if (props.dealIn) {
    dealing.value = true
    stackAtDeck()
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

/** 這張牌能不能拿（暫存格的牌、桌面上接成一串的） */
function sourceOf(c: Card): Source | null {
  const s = props.state
  const slot = s.cells.indexOf(c)
  if (slot >= 0) return { pile: 'cell', slot }
  for (let col = 0; col < 8; col++) {
    const index = s.tableau[col].indexOf(c)
    if (index >= 0) return cardsAt(s, { pile: 'tableau', col, index }).length ? { pile: 'tableau', col, index } : null
  }
  return null
}
const grabbable = computed(() => {
  const out = new Set<Card>()
  for (const c of present.value) if (sourceOf(c)) out.add(c)
  return out
})

interface Drag {
  id: number
  from: Source
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
  const from = sourceOf(c)
  if (!from) {
    // 點到拿不起來的牌：當作點那一疊（有選起的牌就試著放過去）
    const col = props.state.tableau.findIndex((t) => t.includes(c))
    if (col >= 0) tapSpot({ pile: 'tableau', col })
    return
  }
  const p = local(e)
  const cards = cardsAt(props.state, from)
  drag = { id: e.pointerId, from, cards, base: cards.map((k) => stage.target(k)), x0: p.x, y0: p.y, moved: false, slop: e.pointerType === 'mouse' ? 6 : 14 }
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
  if (d && d.moved) flyBack(d)
}
const flyBack = (d: Drag) => d.cards.forEach((c, k) => stage.move(c, d.base[k], { delay: k * 30, dur: 260, arc: 10, flightZ: 1000 + k }))
function onMove(e: PointerEvent) {
  if (!drag || e.pointerId !== drag.id) return
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
  if (!d.moved) {
    tapCard(d.from)
    return
  }
  const p = local(e)
  const spot = dropSpot(L.value, props.state, d.base[0].x + (p.x - d.x0), d.base[0].y + (p.y - d.y0))
  if (spot && sameSpot(d.from, spot) && Math.hypot(p.x - d.x0, p.y - d.y0) < L.value.cw * 0.6) {
    d.cards.forEach((c, k) => stage.move(c, d.base[k], { dur: 160 }))
    tapCard(d.from)
    return
  }
  selected.value = null
  if (spot && !sameSpot(d.from, spot) && attempt(d.from, spot)) return
  flyBack(d)
}
/** 試著搬過去：成功就送出動作；不行就回報原因（張數太多要另外說） */
function attempt(picked: Source, to: Target): boolean {
  // 拿太多張、或空的一疊一次搬不了那麼多：自動改成搬接得上／搬得動的那一段
  const from = fitSource(props.state, picked, to)
  const r = applyFreeCell(props.state, { type: 'move', from, to })
  if (r.ok) {
    emit('action', { type: 'move', from, to })
    return true
  }
  emit('invalid', r.reason)
  return false
}
let lastTap = 0
function tapCard(from: Source) {
  const sel = selected.value
  const now = performance.now()
  const double = now - lastTap < 380
  lastTap = now
  if (sel && sameSource(sel, from)) {
    selected.value = null
    if (double) {
      const to = autoTarget(props.state, from)
      if (to) emit('action', { type: 'move', from, to })
      else {
        shake(cardsAt(props.state, from))
        emit('invalid', 'illegal')
      }
    }
    return
  }
  if (sel) {
    const to: Target = from.pile === 'tableau' ? { pile: 'tableau', col: from.col } : { pile: 'cell', slot: from.slot }
    if (!sameSpot(sel, to)) return tryMove(sel, to)
  }
  selected.value = from
  playSound('cardPick')
}
function tapSpot(to: Target) {
  if (!canAct.value || !selected.value) return
  if (sameSpot(selected.value, to)) {
    selected.value = null
    return
  }
  tryMove(selected.value, to)
}
function tryMove(from: Source, to: Target) {
  const cards = cardsAt(props.state, from)
  selected.value = null
  if (!attempt(from, to)) shake(cards)
}
function sameSource(a: Source, b: Source) {
  if (a.pile === 'cell' && b.pile === 'cell') return a.slot === b.slot
  if (a.pile === 'tableau' && b.pile === 'tableau') return a.col === b.col && a.index === b.index
  return false
}
function sameSpot(from: Source, to: Target) {
  if (from.pile === 'tableau' && to.pile === 'tableau') return from.col === to.col
  if (from.pile === 'cell' && to.pile === 'cell') return from.slot === to.slot
  return false
}
const selectedCards = computed(() => new Set(selected.value ? cardsAt(props.state, selected.value) : []))
function shake(cards: Card[]) {
  cards.forEach((c, k) => {
    const b = stage.target(c)
    stage.move(c, { ...b, x: b.x + 6, r: b.r + 3 }, { dur: 70, delay: k * 20 })
    window.setTimeout(() => stage.move(c, b, { dur: 160 }), 80 + k * 20)
  })
}

const hintSet = computed(() => new Set(props.hintCards))
const rankText = (c: Card) => RANK_LABELS[rankOf(c)]
const slot = (p: { x: number; y: number }) => ({ left: `${p.x - L.value.cw / 2}px`, top: `${p.y - L.value.ch / 2}px`, width: `${L.value.cw}px`, height: `${L.value.ch}px` })
const hintRect = computed(() => {
  const h = props.hintSpot
  if (!h) return null
  if (h.pile === 'cell') return slot(L.value.cells[h.slot])
  if (h.pile === 'foundation') return slot(L.value.foundations[h.slot])
  const col = props.state.tableau[h.col]
  const y = col.length ? freeCellPoses(L.value, props.state, salt).poses.get(col[col.length - 1])!.y : L.value.cols[h.col].y
  return slot({ x: L.value.cols[h.col].x, y })
})
defineExpose({ layout: L })
</script>

<template>
  <section ref="stageEl" class="fc">
    <button v-for="(p, i) in L.cells" :key="`x${i}`" class="slot cell" :style="slot(p)" :aria-label="`cell ${i}`" @click="tapSpot({ pile: 'cell', slot: i })" />
    <button v-for="(f, i) in L.foundations" :key="`f${i}`" class="slot found" :class="{ red: isRedSuit(i) }" :style="slot(f)" :aria-label="`foundation ${i}`" @click="tapSpot({ pile: 'foundation', slot: i })">
      <svg viewBox="0 0 24 24" class="suit" aria-hidden="true"><path :d="SUIT_PATHS[i]" /></svg>
    </button>
    <button v-for="(c, i) in L.cols" :key="`c${i}`" class="slot" :style="slot(c)" :aria-label="`column ${i}`" @click="tapSpot({ pile: 'tableau', col: i })" />
    <div v-if="hintRect" class="hint-spot" :style="hintRect" />

    <div class="cards">
      <div
        v-for="c in ALL"
        v-show="present.has(c)"
        :key="c"
        :ref="(el) => stage.attach(c, el as HTMLElement | null)"
        class="sprite"
        :class="{ grab: canAct && grabbable.has(c), hit: hintSet.has(c), sel: selectedCards.has(c) }"
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
.fc {
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
  color: rgb(20 20 20 / 0.18);
}
/* 暫存格：虛線框 */
.cell {
  background: rgb(20 20 20 / 0.03);
  border: 0.12rem dashed rgb(20 20 20 / 0.2);
}
.suit {
  width: 46%;
  fill: currentColor;
}
.found.red {
  color: rgb(255 74 28 / 0.32);
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
  .sprite.grab {
    transition: translate 160ms var(--ease-out);
  }
  .sprite.grab:hover {
    translate: 0 -4%;
  }
}
</style>
