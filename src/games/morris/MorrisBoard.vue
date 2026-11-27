<script setup lang="ts">
// 九子棋棋盤：米白底上三個套在一起的正方形＋四條中線（墨黑），24 個點是小黑點。
// 子：先手朱紅、後手鈷藍的圓子（黑框＋右下實心陰影）。剛放下的從上面落下、剛走的從原位滑過去、被拿走的往上飄走淡掉。
// 亮起來的東西：選起來的子（紅框）、能走到的點（圓點）、成三後能拿的對方的子（黃圈）、預覽（淡淡的子）、教學提示（黃底）。
// 純畫面：點了哪個點往外丟，規則由外面決定。
import { computed, ref } from 'vue'
import { MILLS, POINTS, XY } from '@/engine/morris/rules'

const props = defineProps<{
  board: readonly number[]
  interactive?: boolean
  /** 選起來的子 */
  selected?: number
  /** 能走到的點 */
  targets?: readonly number[]
  /** 能拿走的對方的子 */
  removables?: readonly number[]
  /** 淡淡的子（放子預覽） */
  preview?: { p: number; side: 0 | 1 } | null
  /** 上一步：從哪、到哪、拿走哪一顆（誰的） */
  last?: { from: number; to: number; removed: number; victim: number } | null
  /** 每一步換一個，動畫才會重播 */
  stamp?: number
  /** 教學：要亮起來的點 */
  hints?: readonly number[]
  /** 剛成三的線（亮一下） */
  mill?: readonly number[]
  /** 這一點的子能不能拖（沒給就不能拖） */
  canDrag?: ((p: number) => boolean) | null
}>()
const emit = defineEmits<{ pick: [p: number]; hover: [p: number | null]; grab: [p: number]; drop: [from: number, to: number] }>()

const U = 10
const x = (p: number) => XY[p][0] * U
const y = (p: number) => XY[p][1] * U
const all = Array.from({ length: POINTS }, (_, i) => i)
const R = 3.7
const tset = computed(() => new Set(props.targets ?? []))
const rset = computed(() => new Set(props.removables ?? []))
/** 走子：從原位滑過來（transform 的起點） */
const slide = (p: number) => {
  const l = props.last
  if (!l || l.to !== p || l.from < 0) return undefined
  // 剛拖完放開：從放開的地方滑過去（不先跳回原位）
  const fromX = landing && landing.to === p && Date.now() - landing.t < 900 ? landing.px : x(l.from)
  const fromY = landing && landing.to === p && Date.now() - landing.t < 900 ? landing.py : y(l.from)
  return { '--dx': `${fromX - x(p)}px`, '--dy': `${fromY - y(p)}px` }
}
/** 子的陰影往右下偏 (0.8, 1)：框住一顆子的圈要往右下挪一半，連陰影一起框，看起來才正 */
const CX = 0.4
const CY = 0.5

function pick(p: number) {
  if (props.interactive && !swallow) emit('pick', p)
}

// ── 拖曳：按住自己的子拖到要去的點放開（移動 6px 以上才算拖，不然照樣是點） ──
const root = ref<SVGSVGElement>()
const drag = ref<{ from: number; id: number; x0: number; y0: number; dx: number; dy: number; moved: boolean } | null>(null)
let swallow = false
let landing: { to: number; px: number; py: number; t: number } | null = null
const unit = () => {
  const r = root.value?.getBoundingClientRect()
  return r && r.width ? 74 / r.width : 1
}
function down(p: number, e: PointerEvent) {
  if (!props.interactive || !props.canDrag?.(p) || (e.pointerType === 'mouse' && e.button !== 0)) return
  drag.value = { from: p, id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, moved: false }
}
function move(e: PointerEvent) {
  const d = drag.value
  if (!d || e.pointerId !== d.id) return
  const dx = e.clientX - d.x0
  const dy = e.clientY - d.y0
  if (!d.moved && Math.hypot(dx, dy) < 6) return
  if (!d.moved) {
    root.value?.setPointerCapture(e.pointerId)
    emit('grab', d.from)
  }
  const u = unit()
  drag.value = { ...d, dx: dx * u, dy: dy * u, moved: true }
}
function up(e: PointerEvent) {
  const d = drag.value
  if (!d || e.pointerId !== d.id) return
  drag.value = null
  if (!d.moved) return
  swallow = true
  window.setTimeout(() => (swallow = false), 0)
  const px = x(d.from) + d.dx
  const py = y(d.from) + d.dy
  let best = -1
  let bestD = 6
  for (const p of all) {
    const dist = Math.hypot(x(p) - px, y(p) - py)
    if (dist < bestD) {
      bestD = dist
      best = p
    }
  }
  if (best >= 0 && best !== d.from) {
    landing = { to: best, px, py, t: Date.now() }
    emit('drop', d.from, best)
  }
}
const dragged = computed(() => (drag.value?.moved ? drag.value : null))
function hover(p: number | null, e?: PointerEvent) {
  if (e && e.pointerType !== 'mouse') return
  if (props.interactive) emit('hover', p)
}
</script>

<template>
  <svg ref="root" viewBox="-7 -7 74 74" class="mb" :class="{ live: interactive, dragok: interactive && !!canDrag }" @pointerleave="hover(null)" @pointermove="move" @pointerup="up" @pointercancel="drag = null">
    <rect x="-6.1" y="-5.9" width="74" height="74" fill="var(--color-ink)" />
    <rect x="-7" y="-7" width="74" height="74" fill="var(--color-card)" stroke="var(--color-ink)" stroke-width="0.8" />
    <!-- 線 -->
    <line v-for="(m, k) in MILLS" :key="`l${k}`" :x1="x(m[0])" :y1="y(m[0])" :x2="x(m[2])" :y2="y(m[2])" class="ln" />
    <!-- 剛成三的線 -->
    <line v-if="mill && mill.length === 3" :key="`mill${stamp}`" :x1="x(mill[0])" :y1="y(mill[0])" :x2="x(mill[2])" :y2="y(mill[2])" class="millln" />
    <!-- 教學提示 -->
    <circle v-for="p in hints ?? []" :key="`h${p}`" :cx="x(p) + CX" :cy="y(p) + CY" :r="R + 1.6" class="hint" />
    <!-- 點 -->
    <circle v-for="p in all" :key="`d${p}`" :cx="x(p)" :cy="y(p)" r="1.1" class="dot" />
    <!-- 能走到的點 -->
    <circle v-for="p in targets ?? []" :key="`t${p}`" :cx="x(p)" :cy="y(p)" r="1.9" class="tgt" />
    <!-- 被拿走的子：往上飄走 -->
    <g v-if="last && last.removed >= 0" :key="`gone${stamp}`" class="gone" :style="{ transformOrigin: `${x(last.removed)}px ${y(last.removed)}px` }">
      <circle :cx="x(last.removed)" :cy="y(last.removed)" :r="R" class="disc" :class="last.victim === 0 ? 's0' : 's1'" />
    </g>
    <!-- 上一步：從哪裡走來（淡淡的虛線圈） -->
    <circle v-if="last && last.from >= 0 && last.to >= 0 && board[last.from] < 0" :cx="x(last.from)" :cy="y(last.from)" :r="R - 0.6" class="lastfrom" />
    <!-- 子 -->
    <g
      v-for="p in all"
      v-show="board[p] >= 0"
      :key="`s${p}-${board[p]}-${last?.to === p ? stamp : 0}`"
      class="stone"
      :class="{ drop: last?.to === p && last.from < 0, slide: last?.to === p && last.from >= 0, sel: selected === p, rm: rset.has(p), lifted: dragged?.from === p }"
      :style="{ transformOrigin: `${x(p)}px ${y(p)}px`, ...slide(p) }"
    >
      <circle :cx="x(p) + 0.8" :cy="y(p) + 1" :r="R" class="shadow" />
      <circle :cx="x(p)" :cy="y(p)" :r="R" class="disc" :class="board[p] === 0 ? 's0' : 's1'" />
      <circle v-if="selected === p" :cx="x(p) + CX" :cy="y(p) + CY" :r="R + 1.3" class="selring" />
      <!-- 上一顆動的子：虛線圈（連陰影一起框） -->
      <circle v-if="last && last.to === p && selected !== p" :cx="x(p) + CX" :cy="y(p) + CY" :r="R + 1.2" class="lastring" />
      <circle v-if="rset.has(p)" :cx="x(p) + CX" :cy="y(p) + CY" :r="R + 1.3" class="rmring" />
    </g>
    <!-- 預覽 -->
    <circle v-if="preview" :cx="x(preview.p)" :cy="y(preview.p)" :r="R" class="ghost" :class="preview.side === 0 ? 's0' : 's1'" />
    <!-- 點擊範圍 -->
    <template v-if="interactive">
      <circle v-for="p in all" :key="`c${p}`" :cx="x(p)" :cy="y(p)" r="4.6" class="hit" :class="{ on: tset.has(p) || rset.has(p) }" @click="pick(p)" @pointerenter="hover(p, $event)" @pointerdown="(e) => down(p, e)" />
    </template>
    <!-- 拖著的子：跟著手指、稍微放大、浮在最上面 -->
    <g v-if="dragged && board[dragged.from] >= 0" class="floating" :style="{ transform: `translate(${dragged.dx}px, ${dragged.dy}px)` }">
      <g :style="{ transformOrigin: `${x(dragged.from)}px ${y(dragged.from)}px`, transform: 'scale(1.18)' }">
        <circle :cx="x(dragged.from) + 0.8" :cy="y(dragged.from) + 1" :r="R" class="shadow" />
        <circle :cx="x(dragged.from)" :cy="y(dragged.from)" :r="R" class="disc" :class="board[dragged.from] === 0 ? 's0' : 's1'" />
      </g>
    </g>
  </svg>
</template>

<style scoped>
.mb {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.mb.live {
  touch-action: none;
}
.mb.dragok {
  touch-action: none;
}
/* 拖起來的子：原位留淡影 */
.stone.lifted {
  opacity: 0.3;
}
.floating {
  pointer-events: none;
}
.ln {
  stroke: var(--color-ink);
  stroke-width: 0.9;
  stroke-linecap: round;
}
.millln {
  stroke: var(--color-yellow);
  stroke-width: 3.2;
  stroke-linecap: round;
  opacity: 0;
  animation: flash 1.2s ease-out both;
}
@keyframes flash {
  20%,
  60% {
    opacity: 0.85;
  }
}
.dot {
  fill: var(--color-ink);
}
.tgt {
  fill: var(--color-blue);
  opacity: 0.55;
  pointer-events: none;
  animation: breathe 1.2s ease-in-out infinite;
}
.hint {
  fill: color-mix(in srgb, var(--color-yellow) 70%, transparent);
  stroke: var(--color-ink);
  stroke-width: 0.6;
  pointer-events: none;
  animation: breathe 1.4s ease-in-out infinite;
}
.hit {
  fill: transparent;
  cursor: pointer;
}
.stone {
  pointer-events: none;
}
.shadow {
  fill: var(--color-ink);
}
.disc {
  stroke: var(--color-ink);
  stroke-width: 0.8;
}
.s0 {
  fill: var(--color-red);
}
.s1 {
  fill: var(--color-blue);
}
.selring {
  fill: none;
  stroke: var(--color-red);
  stroke-width: 0.9;
  animation: breathe 1.2s ease-in-out infinite;
}
.lastring {
  fill: none;
  stroke: var(--color-ink);
  stroke-width: 0.5;
  stroke-dasharray: 1.2 0.9;
}
.lastfrom {
  fill: none;
  stroke: var(--color-ink);
  stroke-width: 0.45;
  stroke-dasharray: 1 0.9;
  opacity: 0.55;
  pointer-events: none;
}
.rmring {
  fill: none;
  stroke: var(--color-yellow);
  stroke-width: 1.4;
  animation: breathe 0.9s ease-in-out infinite;
}
/* 剛放下：從上面落下、壓一下 */
.stone.drop {
  animation: drop 380ms var(--ease-back) both;
}
@keyframes drop {
  from {
    transform: translateY(-5px) scale(1.25);
    opacity: 0;
  }
  60% {
    transform: scale(0.92, 0.86);
    opacity: 1;
  }
}
/* 剛走的子：從原位滑過來 */
.stone.slide {
  animation: slide 420ms var(--ease-out) both;
}
@keyframes slide {
  from {
    transform: translate(var(--dx), var(--dy));
  }
}
/* 被拿走：往上飄走淡掉 */
.gone {
  pointer-events: none;
  animation: gone 620ms ease-in both;
}
@keyframes gone {
  to {
    transform: translateY(-7px) scale(0.6);
    opacity: 0;
  }
}
.ghost {
  opacity: 0.42;
  stroke: var(--color-ink);
  stroke-width: 0.7;
  pointer-events: none;
}
@keyframes breathe {
  50% {
    opacity: 0.35;
  }
}
@media (prefers-reduced-motion: reduce) {
  .stone.drop,
  .stone.slide,
  .gone,
  .millln,
  .tgt,
  .hint,
  .selring,
  .rmring {
    animation: none;
  }
  .gone {
    opacity: 0;
  }
}
</style>
