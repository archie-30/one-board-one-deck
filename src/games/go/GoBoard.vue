<script setup lang="ts">
// 圍棋棋盤：9／13／19 路。畫棋子、最後一手、預覽、剛被提掉的子（往上飄走），
// 以及終局時的死棋（打叉）與地盤（小方塊）。只負責畫與回報點了哪一格。
import { computed, ref } from 'vue'
import type { Point } from '@/engine/go/rules'
import Stone from '@/ui/art/Stone.vue'

const props = withDefaults(
  defineProps<{
    board: readonly Point[]
    size: number
    lastMove?: number
    preview?: number
    previewColor?: 1 | 2
    interactive?: boolean
    /** 剛被提掉的子與它們的顏色（做動畫） */
    captured?: { key: number; color: 1 | 2; points: readonly number[] } | null
    /** 終局：每一點屬於誰、哪些是死棋 */
    area?: readonly Point[] | null
    dead?: readonly number[]
    highlights?: readonly number[]
  }>(),
  { lastMove: -2, preview: -1, previewColor: 1, interactive: true, captured: null, area: null, dead: () => [], highlights: () => [] },
)
const emit = defineEmits<{ pick: [index: number] }>()

const CELL = 10
const PAD = 7
const total = computed(() => (props.size - 1) * CELL + PAD * 2)
const px = (i: number) => PAD + (i % props.size) * CELL
const py = (i: number) => PAD + Math.floor(i / props.size) * CELL
const R = 4.55

const stars = computed(() => {
  const n = props.size
  const pts = n === 19 ? [3, 9, 15] : n === 13 ? [3, 6, 9] : [2, 4, 6]
  const out: number[] = []
  for (const y of pts) for (const x of pts) if (n === 19 || (x === pts[1]) === (y === pts[1])) out.push(y * n + x)
  return out
})
const stones = computed(() => {
  const out: { index: number; color: Point }[] = []
  props.board.forEach((color, index) => {
    if (color !== 0) out.push({ index, color })
  })
  return out
})
const deadSet = computed(() => new Set(props.dead))
const owned = computed(() => {
  if (!props.area) return []
  const out: { index: number; owner: Point }[] = []
  props.area.forEach((owner, index) => {
    if (owner !== 0 && (props.board[index] === 0 || deadSet.value.has(index))) out.push({ index, owner })
  })
  return out
})

function pointAt(event: MouseEvent): number {
  const rect = (event.currentTarget as SVGElement).getBoundingClientRect()
  const x = Math.round((((event.clientX - rect.left) / rect.width) * total.value - PAD) / CELL)
  const y = Math.round((((event.clientY - rect.top) / rect.height) * total.value - PAD) / CELL)
  if (x < 0 || y < 0 || x >= props.size || y >= props.size) return -1
  return y * props.size + x
}
function onClick(event: MouseEvent) {
  if (!props.interactive) return
  const i = pointAt(event)
  if (i >= 0) emit('pick', i)
}

// 滑鼠移上去：在游標下的空點先顯示一顆半透明的棋子（預覽），只對滑鼠有效
const hoverAt = ref(-1)
function onMove(event: PointerEvent) {
  hoverAt.value = event.pointerType === 'mouse' && props.interactive ? pointAt(event) : -1
}
const ghost = computed(() => {
  const i = hoverAt.value
  return props.interactive && i >= 0 && i !== props.preview && props.board[i] === 0 && !props.area ? i : -1
})
</script>

<template>
  <svg class="board" :class="{ interactive }" :viewBox="`0 0 ${total} ${total}`" @click="onClick" @pointermove="onMove" @pointerleave="hoverAt = -1">
    <rect x="2.2" y="2.6" :width="total - 1" :height="total - 1" fill="var(--color-ink)" />
    <rect x="0.5" y="0.5" :width="total - 1.6" :height="total - 1.6" fill="var(--color-yellow)" stroke="var(--color-ink)" stroke-width="0.9" />
    <g stroke="var(--color-ink)" stroke-width="0.32">
      <line v-for="i in size" :key="`h${i}`" :x1="PAD" :x2="total - PAD" :y1="PAD + (i - 1) * CELL" :y2="PAD + (i - 1) * CELL" />
      <line v-for="i in size" :key="`v${i}`" :y1="PAD" :y2="total - PAD" :x1="PAD + (i - 1) * CELL" :x2="PAD + (i - 1) * CELL" />
    </g>
    <circle v-for="s in stars" :key="`s${s}`" :cx="px(s)" :cy="py(s)" r="1.05" fill="var(--color-ink)" />

    <circle v-for="h in highlights" :key="`t${h}`" :cx="px(h)" :cy="py(h)" r="4.8" class="target" />

    <circle v-if="lastMove >= 0" :key="`rip${lastMove}`" :cx="px(lastMove)" :cy="py(lastMove)" r="4.6" class="ripple" />
    <g v-for="s in stones" :key="s.index" class="stone" :class="{ fresh: s.index === lastMove, dead: deadSet.has(s.index) }">
      <Stone :cx="px(s.index)" :cy="py(s.index)" :r="R" :black="s.color === 1" />
    </g>
    <rect v-if="lastMove >= 0 && !area" :x="px(lastMove) - 1.2" :y="py(lastMove) - 1.2" width="2.4" height="2.4" fill="var(--color-red)" />

    <!-- 剛被提掉的子：往上飄並淡出 -->
    <g v-if="captured" :key="`cap${captured.key}`">
      <g v-for="p in captured.points" :key="p" class="gone"><Stone :cx="px(p)" :cy="py(p)" :r="R" :black="captured.color === 1" :shadow="false" /></g>
    </g>

    <!-- 終局：地盤與死棋 -->
    <template v-if="area">
      <rect
        v-for="o in owned"
        :key="`a${o.index}`"
        :x="px(o.index) - 1.3"
        :y="py(o.index) - 1.3"
        width="2.6"
        height="2.6"
        :fill="o.owner === 1 ? 'var(--color-ink)' : 'var(--color-card)'"
        stroke="var(--color-ink)"
        stroke-width="0.45"
        class="own"
      />
      <path v-for="d in dead" :key="`d${d}`" :d="`M${px(d) - 2.6} ${py(d) - 2.6}l5.2 5.2M${px(d) + 2.6} ${py(d) - 2.6}l-5.2 5.2`" class="cross" />
    </template>

    <circle v-if="ghost >= 0" :key="`g${ghost}`" :cx="px(ghost)" :cy="py(ghost)" :r="R" :fill="previewColor === 1 ? 'var(--color-ink)' : 'var(--color-card)'" stroke="var(--color-ink)" stroke-width="0.6" class="ghost" />
    <g v-if="preview >= 0" class="preview">
      <circle :cx="px(preview)" :cy="py(preview)" :r="R" :fill="previewColor === 1 ? 'var(--color-ink)' : 'var(--color-card)'" stroke="var(--color-ink)" stroke-width="0.8" opacity=".45" />
      <circle :cx="px(preview)" :cy="py(preview)" r="6" class="aim" />
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
.stone {
  transform-box: fill-box;
  transform-origin: center;
}
.stone.fresh {
  animation: land 300ms var(--ease-back) both;
}
@keyframes land {
  from {
    transform: scale(1.22, 0.8);
  }
}
.stone.dead {
  opacity: 0.45;
}
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
.gone {
  transform-box: fill-box;
  transform-origin: center;
  animation: gone 620ms var(--ease-out) both;
  pointer-events: none;
}
@keyframes gone {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
    transform: translateY(-14px) scale(0.6) rotate(25deg);
  }
}
.own {
  animation: pop 300ms var(--ease-back) both;
}
.cross {
  fill: none;
  stroke: var(--color-red);
  stroke-width: 1.2;
  stroke-linecap: square;
}
.target {
  fill: none;
  stroke: var(--color-red);
  stroke-width: 0.9;
  stroke-dasharray: 2 1.6;
  transform-box: fill-box;
  transform-origin: center;
  animation: spin 3s linear infinite;
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
  opacity: 0.28;
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
