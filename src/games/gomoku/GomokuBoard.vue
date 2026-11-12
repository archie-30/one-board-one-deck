<script setup lang="ts">
// 棋盤：手繪格線、棋子、預覽、勝利筆劃。只負責畫與回報點了哪一格。
import { computed } from 'vue'
import type { Stone } from '@/engine/gomoku/rules'
import ArtStone from '@/ui/art/ArtStone.vue'
import { inkPath } from '@/ui/art/ink'
import Sketch from '@/ui/art/Sketch.vue'
import { boardPrims } from './boardArt'

const props = withDefaults(
  defineProps<{
    board: readonly Stone[]
    size?: number
    lastMove?: number
    winLine?: readonly number[]
    preview?: number
    previewColor?: 1 | 2
    highlights?: readonly number[]
    interactive?: boolean
  }>(),
  { size: 15, lastMove: -1, winLine: () => [], preview: -1, previewColor: 1, highlights: () => [], interactive: true },
)
const emit = defineEmits<{ pick: [index: number] }>()

const CELL = 10
const PAD = 7
const span = computed(() => (props.size - 1) * CELL)
const total = computed(() => span.value + PAD * 2)
const px = (i: number) => PAD + (i % props.size) * CELL
const py = (i: number) => PAD + Math.floor(i / props.size) * CELL

const art = computed(() => boardPrims(1, 1, total.value - 2, props.size, PAD - 1, 0.3, 2.6))

const stars = computed(() => {
  if (props.size !== 15) return []
  return [
    [3, 3],
    [11, 3],
    [7, 7],
    [3, 11],
    [11, 11],
  ].map(([x, y]) => y * 15 + x)
})

const stones = computed(() => {
  const out: { index: number; color: Stone }[] = []
  props.board.forEach((color, index) => {
    if (color !== 0) out.push({ index, color })
  })
  return out
})

const winPath = computed(() => {
  if (props.winLine.length < 2) return ''
  const a = props.winLine[0]
  const b = props.winLine[props.winLine.length - 1]
  const dx = Math.sign(px(b) - px(a)) * 3.4
  const dy = Math.sign(py(b) - py(a)) * 3.4
  return inkPath(
    [
      [px(a) - dx, py(a) - dy],
      [(px(a) + px(b)) / 2 + dy * 0.2, (py(a) + py(b)) / 2 - dx * 0.2],
      [px(b) + dx, py(b) + dy],
    ],
    { width: 2.6, seed: a + b, taper: 0.25, pressure: 0.5 },
  )
})

function onClick(event: MouseEvent) {
  if (!props.interactive) return
  const rect = (event.currentTarget as SVGElement).getBoundingClientRect()
  const x = Math.round((((event.clientX - rect.left) / rect.width) * total.value - PAD) / CELL)
  const y = Math.round((((event.clientY - rect.top) / rect.height) * total.value - PAD) / CELL)
  if (x < 0 || y < 0 || x >= props.size || y >= props.size) return
  emit('pick', y * props.size + x)
}
</script>

<template>
  <svg class="board" :class="{ interactive }" :viewBox="`0 0 ${total} ${total}`" @click="onClick">
    <Sketch :prims="art.under" :seed="3" still />
    <Sketch :prims="art.edge" :seed="8" still />
    <circle v-for="s in stars" :key="`s${s}`" :cx="px(s)" :cy="py(s)" r="0.9" class="star" />

    <circle v-for="h in highlights" :key="`h${h}`" :cx="px(h)" :cy="py(h)" r="4.4" class="highlight" />

    <circle v-if="lastMove >= 0" :key="`rip${lastMove}`" :cx="px(lastMove)" :cy="py(lastMove)" r="4.6" class="ripple" />
    <g v-for="s in stones" :key="s.index" class="stone" :class="{ fresh: s.index === lastMove }">
      <ArtStone :cx="px(s.index)" :cy="py(s.index)" :r="4.3" :black="s.color === 1" :seed="s.index" />
    </g>
    <circle v-if="lastMove >= 0 && !winLine.length" :cx="px(lastMove)" :cy="py(lastMove)" r="1.15" class="last" />

    <g v-if="preview >= 0" class="preview" :class="previewColor === 1 ? 'black' : 'white'">
      <circle :cx="px(preview)" :cy="py(preview)" r="4.25" class="ghost" />
      <circle :cx="px(preview)" :cy="py(preview)" r="5.4" class="pv-ring" />
    </g>

    <path v-if="winPath" :key="winPath" :d="winPath" class="win" />
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
.star {
  fill: var(--color-ink);
  opacity: 0.7;
}
.highlight {
  fill: var(--color-marker);
  stroke: var(--color-ink);
  stroke-width: 0.35;
  stroke-dasharray: 1.4 1.2;
}
.stone {
  transform-box: fill-box;
  transform-origin: center;
}
/* 剛落下的棋子：壓扁一下再彈回來 */
.stone.fresh {
  animation: stone-land 260ms var(--ease-back) both;
}
@keyframes stone-land {
  from {
    transform: scale(1.18, 0.82);
  }
}
/* 落點的墨圈往外擴散 */
.ripple {
  fill: none;
  stroke: var(--color-ink);
  stroke-width: 0.5;
  transform-box: fill-box;
  transform-origin: center;
  animation: ripple 520ms var(--ease-out) both;
  pointer-events: none;
}
@keyframes ripple {
  from {
    opacity: 0.7;
    transform: scale(0.9);
  }
  to {
    opacity: 0;
    transform: scale(2.1);
  }
}
.last {
  fill: var(--color-red);
}
.preview .ghost {
  opacity: 0.45;
  stroke: var(--color-ink);
  stroke-width: 0.6;
}
.preview.black .ghost {
  fill: var(--color-ink);
}
.preview.white .ghost {
  fill: var(--color-card);
  opacity: 0.8;
}
.preview .pv-ring {
  fill: none;
  stroke: var(--color-red);
  stroke-width: 0.6;
  stroke-dasharray: 1.6 1.3;
}
.win {
  fill: var(--color-red);
  opacity: 0.9;
  animation: win-swipe 460ms var(--ease-in-out) both;
}
@keyframes win-swipe {
  from {
    clip-path: circle(0% at 50% 50%);
  }
  to {
    clip-path: circle(80% at 50% 50%);
  }
}
</style>
