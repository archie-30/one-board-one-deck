<script setup lang="ts">
// 孔明棋棋盤：米白的十字形板子（黑框＋右下實心陰影），33 個淡淡的孔，子是朱紅的圓珠（黑框＋右下陰影）。
// 亮起來的東西：選起來的子（黃圈，連陰影一起框）、能跳到的孔（藍點）、教學提示（黃底）。
// 動畫：跳過去的子往上拱一下落到新孔、被跳過的子往上飄走；返回上一步時倒著播。
// 可以點，也可以按住子拖到空孔放開（移動 6px 以上才算拖）。純畫面：規則由外面決定。
import { computed, ref } from 'vue'
import { HOLES, N } from '@/engine/pegs/rules'

export interface PegsFx {
  /** 每一步換一個，動畫才會重播 */
  key: number
  from: number
  over: number
  to: number
  /** 返回上一步（倒著播） */
  back?: boolean
}

const props = defineProps<{
  pegs: readonly boolean[]
  interactive?: boolean
  selected?: number
  targets?: readonly number[]
  hints?: readonly number[]
  fx?: PegsFx | null
  canDrag?: ((at: number) => boolean) | null
}>()
const emit = defineEmits<{ pick: [at: number]; grab: [at: number]; drop: [from: number, to: number] }>()

const U = 10
const x = (i: number) => (i % N) * U + U / 2
const y = (i: number) => Math.floor(i / N) * U + U / 2
const R = 3.3
/** 子的陰影往右下偏多少（選取框要把子＋陰影一起框起來，看起來才正） */
const SX = 0.6
const SY = 0.75
/** 十字形板子 */
const CROSS = 'M 20 0 H 50 V 20 H 70 V 50 H 50 V 70 H 20 V 50 H 0 V 20 H 20 Z'
const tset = computed(() => new Set(props.targets ?? []))

/** 子的動畫：跳過來（或返回時跳回去）的那顆從原位拱過來；返回時被吃的那顆冒回來 */
const motion = (at: number) => {
  const f = props.fx
  if (!f) return null
  if (!f.back && at === f.to) return { cls: 'hop', from: f.from }
  if (f.back && at === f.from) return { cls: 'hop', from: f.to }
  if (f.back && at === f.over) return { cls: 'back', from: at }
  return null
}
const motionStyle = (at: number) => {
  const m = motion(at)
  if (!m) return undefined
  let fx0 = x(m.from)
  let fy0 = y(m.from)
  if (landing && landing.to === at && Date.now() - landing.t < 900) {
    fx0 = landing.px
    fy0 = landing.py
  }
  return { '--dx': `${fx0 - x(at)}px`, '--dy': `${fy0 - y(at)}px`, transformOrigin: `${x(at)}px ${y(at)}px` }
}
const pegKey = (at: number) => `p${at}-${motion(at) ? props.fx!.key : 0}`

function pick(at: number) {
  if (props.interactive && !swallow) emit('pick', at)
}

// ── 拖曳 ──
const root = ref<SVGSVGElement>()
const drag = ref<{ from: number; id: number; x0: number; y0: number; dx: number; dy: number; moved: boolean } | null>(null)
let swallow = false
/** 剛拖完放開的地方：落到那一孔的子從放開的地方過去（不先跳回原位） */
let landing: { to: number; px: number; py: number; t: number } | null = null
const W = 70
const unit = () => {
  const r = root.value?.getBoundingClientRect()
  return r && r.width ? (W + 8) / r.width : 1
}
function down(at: number, e: PointerEvent) {
  if (!props.interactive || !props.canDrag?.(at) || (e.pointerType === 'mouse' && e.button !== 0)) return
  drag.value = { from: at, id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, moved: false }
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
  let bestD = U * 0.6
  for (const at of HOLES) {
    const dist = Math.hypot(x(at) - px, y(at) - py)
    if (dist < bestD) {
      bestD = dist
      best = at
    }
  }
  if (best >= 0 && best !== d.from) {
    landing = { to: best, px, py, t: Date.now() }
    emit('drop', d.from, best)
  }
}
const dragged = computed(() => (drag.value?.moved ? drag.value : null))
</script>

<template>
  <svg ref="root" viewBox="-4 -4 78 78" class="pb" :class="{ live: interactive, dragok: interactive && !!canDrag }" @pointermove="move" @pointerup="up" @pointercancel="drag = null">
    <!-- 板子 -->
    <path :d="CROSS" transform="translate(1.2 1.4)" fill="var(--color-ink)" />
    <path :d="CROSS" class="board" />
    <!-- 教學提示 -->
    <circle v-for="at in hints ?? []" :key="`h${at}`" :cx="x(at) + SX / 2" :cy="y(at) + SY / 2" :r="R + 1.6" class="hint" />
    <!-- 孔 -->
    <circle v-for="at in HOLES" :key="`o${at}`" :cx="x(at)" :cy="y(at)" r="1.7" class="hole" />
    <!-- 被跳過、拿掉的子：往上飄走 -->
    <g v-if="fx && !fx.back" :key="`gone${fx.key}`" class="gone" :style="{ transformOrigin: `${x(fx.over)}px ${y(fx.over)}px` }">
      <circle :cx="x(fx.over) + SX" :cy="y(fx.over) + SY" :r="R" class="shadow" />
      <circle :cx="x(fx.over)" :cy="y(fx.over)" :r="R" class="peg" />
    </g>
    <!-- 子 -->
    <template v-for="at in HOLES" :key="pegKey(at)">
      <g v-if="pegs[at]" class="pc" :class="[motion(at)?.cls, { lifted: dragged?.from === at }]" :style="motionStyle(at)">
        <!-- 裡面再包一層：往前是外層一路順順地滑，拱起來（放大）是裡層，兩個分開才不會在半空中停一下 -->
        <g class="lift" :style="{ transformOrigin: `${x(at)}px ${y(at)}px` }">
          <circle :cx="x(at) + SX" :cy="y(at) + SY" :r="R" class="shadow" />
          <circle :cx="x(at)" :cy="y(at)" :r="R" class="peg" />
          <circle :cx="x(at) - 1" :cy="y(at) - 1.1" r="0.9" class="shine" />
        </g>
      </g>
    </template>
    <!-- 選起來的子（連陰影一起框） -->
    <circle v-if="selected !== undefined && selected >= 0 && pegs[selected]" :cx="x(selected) + SX / 2" :cy="y(selected) + SY / 2" :r="R + 1.5" class="selring" />
    <!-- 能跳到的孔 -->
    <circle v-for="at in targets ?? []" :key="`t${at}`" :cx="x(at)" :cy="y(at)" r="1.9" class="tgt" />
    <!-- 點擊範圍 -->
    <template v-if="interactive">
      <rect v-for="at in HOLES" :key="`c${at}`" :x="x(at) - U / 2" :y="y(at) - U / 2" :width="U" :height="U" class="hit" :class="{ on: tset.has(at) }" @click="pick(at)" @pointerdown="(e) => down(at, e)" />
    </template>
    <!-- 拖著的子：跟著手指、稍微放大、浮在最上面 -->
    <g v-if="dragged" class="floating" :style="{ transform: `translate(${dragged.dx}px, ${dragged.dy}px)` }">
      <g :style="{ transformOrigin: `${x(dragged.from)}px ${y(dragged.from)}px`, transform: 'scale(1.18)' }">
        <circle :cx="x(dragged.from) + SX" :cy="y(dragged.from) + SY" :r="R" class="shadow" />
        <circle :cx="x(dragged.from)" :cy="y(dragged.from)" :r="R" class="peg" />
      </g>
    </g>
  </svg>
</template>

<style scoped>
.pb {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.pb.live {
  touch-action: manipulation;
}
/* 能拖的時候：手指在棋盤上的動作都交給遊戲（手機上 SVG 裡的元素不吃 touch-action，要放在整個 svg 上） */
.pb.dragok {
  touch-action: none;
}
.board {
  fill: var(--color-card);
  stroke: var(--color-ink);
  stroke-width: 0.7;
  stroke-linejoin: round;
}
.hole {
  fill: color-mix(in srgb, var(--color-ink) 22%, transparent);
}
.shadow {
  fill: var(--color-ink);
}
.peg {
  fill: var(--color-red);
  stroke: var(--color-ink);
  stroke-width: 0.6;
}
.shine {
  fill: var(--color-paper);
  opacity: 0.55;
  pointer-events: none;
}
.pc,
.floating,
.gone {
  pointer-events: none;
}
.pc.lifted {
  opacity: 0.3;
}
.hint {
  fill: color-mix(in srgb, var(--color-yellow) 75%, transparent);
  stroke: var(--color-ink);
  stroke-width: 0.5;
  pointer-events: none;
  animation: breathe 1.3s ease-in-out infinite;
}
.selring {
  fill: none;
  stroke: var(--color-yellow);
  stroke-width: 1.1;
  pointer-events: none;
  animation: breathe 1.1s ease-in-out infinite;
}
.tgt {
  fill: var(--color-blue);
  opacity: 0.6;
  pointer-events: none;
  animation: breathe 1.2s ease-in-out infinite;
}
.hit {
  fill: transparent;
  cursor: pointer;
}
/* 跳過去：外層從原位一路滑到新孔（只有頭尾兩格，中間不會停），裡層同時拱起來（放大再縮回） */
.pc.hop {
  animation: hop 380ms cubic-bezier(0.33, 0, 0.25, 1) both;
}
@keyframes hop {
  from {
    transform: translate(var(--dx), var(--dy));
  }
}
.pc.hop .lift {
  animation: lift 380ms linear both;
}
@keyframes lift {
  from,
  to {
    transform: none;
  }
  50% {
    transform: scale(1.28);
  }
}
/* 返回：被吃的那顆冒回來 */
.pc.back {
  animation: pop 360ms 120ms var(--ease-back) both;
}
@keyframes pop {
  from {
    transform: scale(0.3);
    opacity: 0;
  }
}
/* 被吃掉：往上飄走淡掉 */
.gone {
  animation: gone 520ms 150ms ease-in both;
}
@keyframes gone {
  to {
    transform: translateY(-6px) scale(0.6);
    opacity: 0;
  }
}
@keyframes breathe {
  50% {
    opacity: 0.4;
  }
}
@media (prefers-reduced-motion: reduce) {
  .pc.hop,
  .pc.hop .lift,
  .pc.back,
  .gone,
  .hint,
  .selring,
  .tgt {
    animation: none;
  }
  .gone {
    opacity: 0;
  }
}
</style>
