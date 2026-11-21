<script setup lang="ts">
// 點格棋棋盤：米白底上一格一格的墨黑圓點。畫好的線：先手朱紅、後手鈷藍；圍住的格子塗上那個人的顏色。
// 操作：點兩點之間（線的位置）先出現預覽（虛線），再點同一條（或按「畫這條」）才畫；滑鼠移上去也有預覽。
// 純畫面：點了哪條線往外丟，規則由外面決定。
import { computed } from 'vue'
import { endsOf, lineCount } from '@/engine/dots/rules'

const props = defineProps<{
  n: number
  lines: readonly number[]
  boxes: readonly number[]
  interactive?: boolean
  /** 選好、還沒畫的那條（虛線預覽，side：誰的顏色） */
  preview?: { line: number; side: 0 | 1 } | null
  /** 上一步畫的線（從一頭畫過去） */
  last?: number
  /** 上一步圍住的格子（冒出來） */
  got?: readonly number[]
  /** 教學：要亮起來的線 */
  hints?: readonly number[]
}>()
const emit = defineEmits<{ pick: [line: number]; hover: [line: number | null] }>()

const S = 10
const px = (dot: number) => (dot % (props.n + 1)) * S
const py = (dot: number) => Math.floor(dot / (props.n + 1)) * S
const dots = computed(() => Array.from({ length: (props.n + 1) * (props.n + 1) }, (_, i) => i))
const all = computed(() => Array.from({ length: lineCount(props.n) }, (_, i) => i))
const seg = (l: number) => {
  const [a, b] = endsOf(props.n, l)
  return { x1: px(a), y1: py(a), x2: px(b), y2: py(b) }
}
/** 線的點擊範圍：以線為對角線的菱形（相鄰兩條不重疊，點格子中間附近也找得到最近的線） */
function hitPoints(l: number): string {
  const { x1, y1, x2, y2 } = seg(l)
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  const h = y1 === y2
  const pts = h ? [[x1, y1], [mx, my - S / 2], [x2, y2], [mx, my + S / 2]] : [[x1, y1], [mx - S / 2, my], [x2, y2], [mx + S / 2, my]]
  return pts.map((p) => p.join(',')).join(' ')
}
const boxXY = (b: number) => ({ x: (b % props.n) * S, y: Math.floor(b / props.n) * S })
/** 剛剛被圍住的格子：放大冒出來 */
const freshBoxes = computed(() => props.got ?? [])
const W = computed(() => props.n * S)

function pick(l: number) {
  if (props.interactive && !props.lines[l]) emit('pick', l)
}
function hover(l: number | null, e?: PointerEvent) {
  if (e && e.pointerType !== 'mouse') return
  if (props.interactive) emit('hover', l)
}
</script>

<template>
  <svg :viewBox="`-4 -4 ${W + 8} ${W + 8}`" class="db" :class="{ live: interactive }" @pointerleave="hover(null)">
    <rect :x="-4 + 0.9" :y="-4 + 1.1" :width="W + 8" :height="W + 8" fill="var(--color-ink)" />
    <rect x="-4" y="-4" :width="W + 8" :height="W + 8" fill="var(--color-card)" stroke="var(--color-ink)" stroke-width="0.8" />
    <!-- 圍住的格子 -->
    <rect
      v-for="(o, b) in boxes"
      v-show="o >= 0"
      :key="`b${b}`"
      :x="boxXY(b).x + 0.9"
      :y="boxXY(b).y + 0.9"
      :width="S - 1.8"
      :height="S - 1.8"
      rx="0.6"
      class="box"
      :class="[o === 0 ? 'b0' : 'b1', { fresh: freshBoxes.includes(b) }]"
    />
    <!-- 格子的記號：誰的格子（小小一個圓） -->
    <circle v-for="(o, b) in boxes" v-show="o >= 0" :key="`m${b}`" :cx="boxXY(b).x + S / 2" :cy="boxXY(b).y + S / 2" r="1.5" class="mark" :class="[o === 0 ? 'm0' : 'm1', { fresh: freshBoxes.includes(b) }]" />
    <!-- 教學要亮的線 -->
    <line v-for="l in hints ?? []" :key="`h${l}`" v-bind="seg(l)" class="hint" />
    <!-- 畫好的線 -->
    <line v-for="l in all" v-show="lines[l]" :key="`l${l}`" v-bind="seg(l)" class="ln" :class="[lines[l] === 1 ? 'l0' : 'l1', { fresh: l === last }]" />
    <!-- 預覽 -->
    <line v-if="preview" v-bind="seg(preview.line)" class="pv" :class="preview.side === 0 ? 'l0' : 'l1'" />
    <!-- 點 -->
    <circle v-for="d in dots" :key="`d${d}`" :cx="px(d)" :cy="py(d)" r="1.05" class="dot" />
    <!-- 點擊範圍 -->
    <template v-if="interactive">
      <polygon v-for="l in all" v-show="!lines[l]" :key="`t${l}`" :points="hitPoints(l)" class="hit" @click="pick(l)" @pointerenter="hover(l, $event)" />
    </template>
  </svg>
</template>

<style scoped>
.db {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.db.live {
  touch-action: none;
}
.hit {
  fill: transparent;
  cursor: pointer;
}
.dot {
  fill: var(--color-ink);
  pointer-events: none;
}
.ln,
.pv,
.hint {
  stroke-width: 1.1;
  stroke-linecap: round;
  pointer-events: none;
}
.l0 {
  stroke: var(--color-red);
}
.l1 {
  stroke: var(--color-blue);
}
/* 剛畫的線：從一頭畫到另一頭 */
.ln.fresh {
  stroke-dasharray: 10;
  animation: draw 320ms var(--ease-out) both;
}
@keyframes draw {
  from {
    stroke-dashoffset: 10;
  }
}
.pv {
  stroke-dasharray: 1.2 1;
  opacity: 0.7;
  animation: breathe 1.4s ease-in-out infinite;
}
.hint {
  stroke: var(--color-yellow);
  stroke-width: 2.2;
  opacity: 0.85;
  animation: breathe 1.4s ease-in-out infinite;
}
.box {
  pointer-events: none;
  transform-box: fill-box;
  transform-origin: center;
}
.b0 {
  fill: color-mix(in srgb, var(--color-card) 62%, var(--color-red));
}
.b1 {
  fill: color-mix(in srgb, var(--color-card) 62%, var(--color-blue));
}
.mark {
  pointer-events: none;
  stroke: var(--color-ink);
  stroke-width: 0.35;
  transform-box: fill-box;
  transform-origin: center;
}
.m0 {
  fill: var(--color-red);
}
.m1 {
  fill: var(--color-blue);
}
.box.fresh,
.mark.fresh {
  animation: pop 380ms var(--ease-back) 180ms both;
}
@keyframes pop {
  from {
    transform: scale(0.2);
    opacity: 0;
  }
}
@keyframes breathe {
  50% {
    opacity: 0.4;
  }
}
@media (prefers-reduced-motion: reduce) {
  .ln.fresh,
  .pv,
  .hint,
  .box.fresh,
  .mark.fresh {
    animation: none;
  }
}
</style>
