<script setup lang="ts">
// 黑白棋棋盤：8 × 8 綠色格子（常見的黑白棋綠）、黑框、右下實心陰影。棋子放在格子中間。
// 只負責畫與回報點了哪一格：能下的位置（小點）、預覽、上一手、被夾到的子一顆顆翻面（離落點越遠越晚翻）。
// 座標系：每格 10，邊距 5。
import { computed, ref } from 'vue'
import type { Disc } from '@/engine/othello/rules'
import Stone from '@/ui/art/Stone.vue'

const props = withDefaults(
  defineProps<{
    board: readonly Disc[]
    lastMove?: number
    /** 上一手翻過來的子 */
    flipped?: readonly number[]
    /** 換了一個數字就重播翻面動畫 */
    moveKey?: number
    /** 能下的位置（輪到你時顯示小點） */
    hints?: readonly number[]
    /** 教學：要亮起來的位置 */
    highlights?: readonly number[]
    preview?: number
    previewColor?: 1 | 2
    interactive?: boolean
  }>(),
  { lastMove: -1, flipped: () => [], moveKey: 0, hints: () => [], highlights: () => [], preview: -1, previewColor: 1, interactive: true },
)
const emit = defineEmits<{ pick: [index: number] }>()

const N = 8
const CELL = 10
const PAD = 5
const total = N * CELL + PAD * 2
const px = (i: number) => PAD + (i % N) * CELL + CELL / 2
const py = (i: number) => PAD + Math.floor(i / N) * CELL + CELL / 2
const R = 3.9

const flipSet = computed(() => new Set(props.flipped))
/** 翻面的先後：離落點越遠越晚 */
const delay = (i: number) => {
  if (props.lastMove < 0) return 0
  const d = Math.max(Math.abs((i % N) - (props.lastMove % N)), Math.abs(Math.floor(i / N) - Math.floor(props.lastMove / N)))
  return 120 + (d - 1) * 70
}
const discs = computed(() => {
  const out: { index: number; color: Disc }[] = []
  props.board.forEach((color, index) => {
    if (color !== 0) out.push({ index, color })
  })
  return out
})

function pointAt(event: MouseEvent): number {
  const rect = (event.currentTarget as SVGElement).getBoundingClientRect()
  const x = Math.floor((((event.clientX - rect.left) / rect.width) * total - PAD) / CELL)
  const y = Math.floor((((event.clientY - rect.top) / rect.height) * total - PAD) / CELL)
  if (x < 0 || y < 0 || x >= N || y >= N) return -1
  return y * N + x
}
function onClick(event: MouseEvent) {
  if (!props.interactive) return
  const i = pointAt(event)
  if (i >= 0) emit('pick', i)
}
// 滑鼠移到能下的格子上：先出現一顆半透明的棋子（只對滑鼠有效）
const hoverAt = ref(-1)
function onMove(event: PointerEvent) {
  hoverAt.value = event.pointerType === 'mouse' && props.interactive ? pointAt(event) : -1
}
const ghost = computed(() => {
  const i = hoverAt.value
  return props.interactive && i >= 0 && i !== props.preview && props.hints.includes(i) ? i : -1
})
</script>

<template>
  <svg class="board" :class="{ interactive }" :viewBox="`0 0 ${total} ${total}`" @click="onClick" @pointermove="onMove" @pointerleave="hoverAt = -1">
    <rect x="2" y="2.4" :width="total - 1" :height="total - 1" fill="var(--color-ink)" />
    <rect x="0.5" y="0.5" :width="total - 1.6" :height="total - 1.6" fill="#2e8b57" stroke="var(--color-ink)" stroke-width="0.9" />
    <g stroke="var(--color-ink)" stroke-width="0.4">
      <line v-for="i in N + 1" :key="`h${i}`" :x1="PAD" :x2="total - PAD" :y1="PAD + (i - 1) * CELL" :y2="PAD + (i - 1) * CELL" />
      <line v-for="i in N + 1" :key="`v${i}`" :y1="PAD" :y2="total - PAD" :x1="PAD + (i - 1) * CELL" :x2="PAD + (i - 1) * CELL" />
    </g>
    <circle v-for="s in [[2, 2], [6, 2], [2, 6], [6, 6]]" :key="`s${s}`" :cx="PAD + s[0] * CELL" :cy="PAD + s[1] * CELL" r="0.9" fill="var(--color-ink)" />
    <rect v-if="lastMove >= 0" :x="px(lastMove) - 5" :y="py(lastMove) - 5" width="10" height="10" class="last" />

    <circle v-for="h in highlights" :key="`t${h}`" :cx="px(h)" :cy="py(h)" r="4.4" class="target" />
    <circle v-for="h in hints" v-show="h !== preview && h !== ghost" :key="`d${h}`" :cx="px(h)" :cy="py(h)" r="1.1" class="dot" />

    <template v-for="d in discs" :key="flipSet.has(d.index) ? `${d.index}-${moveKey}` : d.index">
      <!-- 翻面：舊顏色先壓扁消失，新顏色再展開 -->
      <g v-if="flipSet.has(d.index)" class="flip" :style="{ '--d': `${delay(d.index)}ms` }">
        <g class="out"><Stone :cx="px(d.index)" :cy="py(d.index)" :r="R" :black="d.color !== 1" /></g>
        <g class="in"><Stone :cx="px(d.index)" :cy="py(d.index)" :r="R" :black="d.color === 1" /></g>
      </g>
      <g v-else class="disc" :class="{ fresh: d.index === lastMove }"><Stone :cx="px(d.index)" :cy="py(d.index)" :r="R" :black="d.color === 1" /></g>
    </template>
    <rect v-if="lastMove >= 0" :x="px(lastMove) - 1" :y="py(lastMove) - 1" width="2" height="2" fill="var(--color-red)" class="mark" />

    <circle v-if="ghost >= 0" :key="`g${ghost}`" :cx="px(ghost)" :cy="py(ghost)" :r="R" :fill="previewColor === 1 ? 'var(--color-ink)' : 'var(--color-card)'" stroke="var(--color-ink)" stroke-width="0.6" class="ghost" />
    <g v-if="preview >= 0" class="preview">
      <circle :cx="px(preview)" :cy="py(preview)" :r="R" :fill="previewColor === 1 ? 'var(--color-ink)' : 'var(--color-card)'" stroke="var(--color-ink)" stroke-width="0.8" opacity=".5" />
      <circle :cx="px(preview)" :cy="py(preview)" r="4.8" class="aim" />
    </g>
  </svg>
</template>

<style scoped>
.board {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
  touch-action: manipulation;
}
.board.interactive {
  cursor: pointer;
}
.last {
  fill: rgb(251 248 241 / 0.16);
}
.dot {
  fill: var(--color-card);
  opacity: 0.75;
  pointer-events: none;
}
.disc,
.flip .out,
.flip .in {
  transform-box: fill-box;
  transform-origin: center;
}
.disc.fresh {
  animation: land 300ms var(--ease-back) both;
}
@keyframes land {
  from {
    transform: scale(1.22, 0.8);
  }
}
.flip .out {
  animation: flip-out 170ms ease-in var(--d) both;
}
.flip .in {
  animation: flip-in 200ms var(--ease-out) calc(var(--d) + 170ms) both;
}
@keyframes flip-out {
  to {
    transform: scaleX(0);
    visibility: hidden;
  }
}
@keyframes flip-in {
  from {
    transform: scaleX(0);
  }
}
.mark {
  pointer-events: none;
}
.target {
  fill: none;
  stroke: var(--color-yellow);
  stroke-width: 0.9;
  stroke-dasharray: 2 1.6;
  animation: spin 3s linear infinite;
  transform-box: fill-box;
  transform-origin: center;
}
.aim {
  fill: none;
  stroke: var(--color-red);
  stroke-width: 0.8;
  stroke-dasharray: 2 1.6;
  transform-box: fill-box;
  transform-origin: center;
  animation:
    pop 260ms var(--ease-back) both,
    spin 3s linear infinite;
}
@keyframes spin {
  to {
    rotate: 360deg;
  }
}
.ghost {
  opacity: 0.35;
  pointer-events: none;
  transform-box: fill-box;
  transform-origin: center;
  animation: ghost-in 160ms var(--ease-out) both;
}
@keyframes ghost-in {
  from {
    opacity: 0;
    transform: scale(0.7);
  }
}
</style>
