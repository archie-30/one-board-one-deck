<script setup lang="ts">
// 棋盤：平面黃色棋盤、黑色格線、實心陰影；棋子、預覽、最後一手、勝利連線、落點擴散圈。
// 只負責畫與回報點了哪一格。座標系：每格 10，邊距 7。
import { computed } from 'vue'
import type { Stone as StoneValue } from '@/engine/gomoku/rules'
import Stone from '@/ui/art/Stone.vue'

const props = withDefaults(
  defineProps<{
    board: readonly StoneValue[]
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
const total = computed(() => (props.size - 1) * CELL + PAD * 2)
const px = (i: number) => PAD + (i % props.size) * CELL
const py = (i: number) => PAD + Math.floor(i / props.size) * CELL

const stars = computed(() => (props.size === 15 ? [[3, 3], [11, 3], [7, 7], [3, 11], [11, 11]].map(([x, y]) => y * 15 + x) : []))
const stones = computed(() => {
  const out: { index: number; color: StoneValue }[] = []
  props.board.forEach((color, index) => {
    if (color !== 0) out.push({ index, color })
  })
  return out
})
const win = computed(() => {
  if (props.winLine.length < 2) return null
  const a = props.winLine[0]
  const b = props.winLine[props.winLine.length - 1]
  const dx = Math.sign(px(b) - px(a)) * 4
  const dy = Math.sign(py(b) - py(a)) * 4
  return { x1: px(a) - dx, y1: py(a) - dy, x2: px(b) + dx, y2: py(b) + dy, len: Math.hypot(px(b) - px(a), py(b) - py(a)) + 12 }
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
    <rect x="0.5" y="1.6" :width="total - 1" :height="total - 1" rx="2" fill="rgb(23 23 26 / .12)" />
    <rect x="0.5" y="0.5" :width="total - 1" :height="total - 1" rx="2" fill="var(--color-board)" />
    <g stroke="rgb(23 23 26 / .55)" stroke-width="0.3">
      <line v-for="i in size" :key="`h${i}`" :x1="PAD" :x2="total - PAD" :y1="PAD + (i - 1) * CELL" :y2="PAD + (i - 1) * CELL" />
      <line v-for="i in size" :key="`v${i}`" :y1="PAD" :y2="total - PAD" :x1="PAD + (i - 1) * CELL" :x2="PAD + (i - 1) * CELL" />
    </g>
    <rect v-for="s in stars" :key="`s${s}`" :x="px(s) - 1" :y="py(s) - 1" width="2" height="2" fill="var(--color-ink)" />

    <circle v-for="h in highlights" :key="`h${h}`" :cx="px(h)" :cy="py(h)" r="4.6" class="target" />

    <circle v-if="lastMove >= 0" :key="`rip${lastMove}`" :cx="px(lastMove)" :cy="py(lastMove)" r="4.6" class="ripple" />
    <g v-for="s in stones" :key="s.index" class="stone" :class="{ fresh: s.index === lastMove }">
      <Stone :cx="px(s.index)" :cy="py(s.index)" :r="4.2" :black="s.color === 1" />
    </g>
    <rect v-if="lastMove >= 0 && !win" :x="px(lastMove) - 1.1" :y="py(lastMove) - 1.1" width="2.2" height="2.2" fill="var(--color-red)" />

    <g v-if="preview >= 0" class="preview">
      <circle :cx="px(preview)" :cy="py(preview)" r="4.2" :fill="previewColor === 1 ? 'var(--color-ink)' : 'var(--color-card)'" stroke="var(--color-ink)" stroke-width="0.8" opacity=".45" />
      <circle :cx="px(preview)" :cy="py(preview)" r="5.6" class="aim" />
    </g>

    <line v-if="win" :key="`w${winLine[0]}`" :x1="win.x1" :y1="win.y1" :x2="win.x2" :y2="win.y2" class="win" :style="{ '--len': win.len }" />
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
.stone {
  transform-box: fill-box;
  transform-origin: center;
}
/* 剛落下的棋子：壓扁一下再彈回來 */
.stone.fresh {
  animation: land 300ms var(--ease-back) both;
}
@keyframes land {
  from {
    transform: scale(1.22, 0.8);
  }
}
/* 落點的圈往外擴散 */
.ripple {
  fill: none;
  stroke: var(--color-ink);
  stroke-width: 0.6;
  transform-box: fill-box;
  transform-origin: center;
  animation: ripple 560ms var(--ease-out) both;
  pointer-events: none;
}
@keyframes ripple {
  from {
    opacity: 0.8;
    transform: scale(0.9);
  }
  to {
    opacity: 0;
    transform: scale(2.3);
  }
}
.target {
  fill: none;
  stroke: var(--color-red);
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
.win {
  stroke: var(--color-red);
  stroke-width: 2.4;
  stroke-linecap: square;
  stroke-dasharray: var(--len);
  animation: draw 520ms var(--ease-in-out) both;
}
@keyframes draw {
  from {
    stroke-dashoffset: var(--len);
  }
  to {
    stroke-dashoffset: 0;
  }
}
</style>
