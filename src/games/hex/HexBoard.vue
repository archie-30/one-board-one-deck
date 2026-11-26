<script setup lang="ts">
// 海克斯棋盤：六角格排成的菱形（每往下一列往右錯開半格）。上下兩條邊是紅色、左右兩條邊是藍色（各自要連的邊）。
// 子：紅方朱紅、藍方鈷藍的圓子；剛下的那顆從上面落下、壓一下，中間有個小點。贏的那一串亮黃圈。
// 操作：點一格先出現淡淡的子（預覽），再點同一格（或按「下這裡」）才下；滑鼠移上去也有預覽。
// 純畫面：點了哪一格往外丟，規則由外面決定。
import { computed } from 'vue'

const props = defineProps<{
  n: number
  cells: readonly number[]
  interactive?: boolean
  /** 選好、還沒下的那一格（淡淡的子，side：誰的顏色） */
  preview?: { cell: number; side: 0 | 1 } | null
  /** 上一步下在哪（交換時 from 是原本那顆紅子的位置） */
  last?: { cell: number; from?: number } | null
  /** 贏的那一串 */
  path?: readonly number[]
  /** 教學：要亮起來的格子 */
  hints?: readonly number[]
}>()
const emit = defineEmits<{ pick: [cell: number]; hover: [cell: number | null] }>()

const R = 10
const WX = Math.sqrt(3) * R
const cx = (i: number) => (i % props.n) * WX + Math.floor(i / props.n) * (WX / 2)
const cy = (i: number) => Math.floor(i / props.n) * 1.5 * R
const all = computed(() => Array.from({ length: props.n * props.n }, (_, i) => i))
/** 六角形的頂點（尖的朝上）：角度 -90、-30、30、90、150、210 */
const corner = (i: number, k: number): [number, number] => {
  const a = ((-90 + 60 * k) * Math.PI) / 180
  return [cx(i) + R * Math.cos(a), cy(i) + R * Math.sin(a)]
}
const hexPts = (i: number) => Array.from({ length: 6 }, (_, k) => corner(i, k).join(',')).join(' ')
/** 外框：上下兩條紅邊、左右兩條藍邊（沿著最外圈格子的邊緣畫） */
const edges = computed(() => {
  const n = props.n
  const pts = (list: [number, number][]) => list.map((p) => p.join(',')).join(' ')
  const top: [number, number][] = []
  const bottom: [number, number][] = []
  const left: [number, number][] = []
  const right: [number, number][] = []
  // 頂點編號 k：0 上、1 右上、2 右下、3 下、4 左下、5 左上
  for (let c = 0; c < n; c++) top.push(corner(c, 5), corner(c, 0), ...(c === n - 1 ? [corner(c, 1)] : []))
  for (let c = n - 1; c >= 0; c--) bottom.push(corner((n - 1) * n + c, 2), corner((n - 1) * n + c, 3), ...(c === 0 ? [corner((n - 1) * n + c, 4)] : []))
  for (let r = 0; r < n; r++) left.push(corner(r * n, 5), corner(r * n, 4), corner(r * n, 3))
  for (let r = 0; r < n; r++) right.push(corner(r * n + n - 1, 0), corner(r * n + n - 1, 1), corner(r * n + n - 1, 2))
  return { top: pts(top), bottom: pts(bottom), left: pts(left), right: pts(right) }
})
const box = computed(() => {
  const n = props.n
  const pad = 5
  const w = (n - 1) * WX + (n - 1) * (WX / 2) + WX
  const h = (n - 1) * 1.5 * R + 2 * R
  return { x: -WX / 2 - pad, y: -R - pad, w: w + 2 * pad, h: h + 2 * pad }
})
const onPath = computed(() => new Set(props.path ?? []))

function pick(i: number) {
  if (props.interactive && props.cells[i] < 0) emit('pick', i)
}
function hover(i: number | null, e?: PointerEvent) {
  if (e && e.pointerType !== 'mouse') return
  if (props.interactive) emit('hover', i)
}
defineExpose({ aspect: () => box.value.w / box.value.h })
</script>

<template>
  <svg :viewBox="`${box.x} ${box.y} ${box.w} ${box.h}`" class="hb" :class="{ live: interactive }" @pointerleave="hover(null)">
    <!-- 四條邊 -->
    <polyline :points="edges.left" class="edge e1" />
    <polyline :points="edges.right" class="edge e1" />
    <polyline :points="edges.top" class="edge e0" />
    <polyline :points="edges.bottom" class="edge e0" />
    <!-- 格子 -->
    <polygon v-for="i in all" :key="`h${i}`" :points="hexPts(i)" class="cell" />
    <!-- 教學要亮的格子 -->
    <polygon v-for="i in hints ?? []" :key="`t${i}`" :points="hexPts(i)" class="hint" />
    <!-- 子 -->
    <g v-for="i in all" v-show="cells[i] >= 0" :key="`s${i}-${cells[i]}`" class="stone" :class="{ fresh: last?.cell === i, win: onPath.has(i) }" :style="{ transformOrigin: `${cx(i)}px ${cy(i)}px` }">
      <circle :cx="cx(i) + 0.9" :cy="cy(i) + 1.1" :r="R * 0.62" class="shadow" />
      <circle :cx="cx(i)" :cy="cy(i)" :r="R * 0.62" :class="cells[i] === 0 ? 's0' : 's1'" class="disc" />
      <circle v-if="onPath.has(i)" :cx="cx(i)" :cy="cy(i)" :r="R * 0.8" class="ring" />
      <circle v-if="last?.cell === i" :cx="cx(i)" :cy="cy(i)" :r="R * 0.14" class="dot" />
    </g>
    <!-- 交換：原本那顆紅子淡出 -->
    <circle v-if="last?.from !== undefined" :key="`from${last.from}`" :cx="cx(last.from)" :cy="cy(last.from)" :r="R * 0.62" class="gone" />
    <!-- 預覽 -->
    <circle v-if="preview" :cx="cx(preview.cell)" :cy="cy(preview.cell)" :r="R * 0.62" class="ghost" :class="preview.side === 0 ? 's0' : 's1'" />
    <!-- 點擊範圍 -->
    <template v-if="interactive">
      <polygon v-for="i in all" v-show="cells[i] < 0" :key="`p${i}`" :points="hexPts(i)" class="hit" @click="pick(i)" @pointerenter="hover(i, $event)" />
    </template>
  </svg>
</template>

<style scoped>
.hb {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.hb.live {
  touch-action: none;
}
.edge {
  fill: none;
  stroke-width: 5;
  stroke-linejoin: round;
  stroke-linecap: round;
}
.e0 {
  stroke: var(--color-red);
}
.e1 {
  stroke: var(--color-blue);
}
.cell {
  fill: var(--color-card);
  stroke: var(--color-ink);
  stroke-width: 0.8;
  stroke-linejoin: round;
}
.hit {
  fill: transparent;
  cursor: pointer;
}
.hint {
  fill: color-mix(in srgb, var(--color-yellow) 55%, transparent);
  stroke: var(--color-ink);
  stroke-width: 0.8;
  pointer-events: none;
  animation: breathe 1.4s ease-in-out infinite;
}
.stone {
  pointer-events: none;
}
.shadow {
  fill: var(--color-ink);
}
.disc {
  stroke: var(--color-ink);
  stroke-width: 1;
}
.s0 {
  fill: var(--color-red);
}
.s1 {
  fill: var(--color-blue);
}
.dot {
  fill: var(--color-card);
}
.ring {
  fill: none;
  stroke: var(--color-yellow);
  stroke-width: 2;
  animation: breathe 1.4s ease-in-out infinite;
}
/* 剛下的子：從上面落下、壓一下 */
.stone.fresh {
  animation: drop 380ms var(--ease-back) both;
}
@keyframes drop {
  from {
    transform: translateY(-6px) scale(1.25);
    opacity: 0;
  }
  60% {
    transform: scale(0.92, 0.86);
    opacity: 1;
  }
}
.gone {
  fill: var(--color-red);
  stroke: var(--color-ink);
  stroke-width: 1;
  pointer-events: none;
  animation: fade 520ms ease-out both;
}
@keyframes fade {
  to {
    opacity: 0;
    transform: scale(0.5);
  }
}
.gone {
  transform-box: fill-box;
  transform-origin: center;
}
.ghost {
  opacity: 0.42;
  stroke: var(--color-ink);
  stroke-width: 0.8;
  pointer-events: none;
  animation: breathe 1.4s ease-in-out infinite;
}
@keyframes breathe {
  50% {
    opacity: 0.28;
  }
}
@media (prefers-reduced-motion: reduce) {
  .stone.fresh,
  .ring,
  .hint,
  .ghost,
  .gone {
    animation: none;
  }
  .gone {
    opacity: 0;
  }
}
</style>
