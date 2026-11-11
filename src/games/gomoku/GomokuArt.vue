<script setup lang="ts">
// 五子棋的代表圖：一張棋盤，黑棋斜向連成五顆，被紅筆劃過
import { computed } from 'vue'
import ArtStone from '@/ui/art/ArtStone.vue'
import { polyFill, rectPts, roughLine, roughPoly } from '@/ui/art/sketch'

defineProps<{ animate?: boolean }>()

const board = rectPts(-95, -95, 190, 190)
const edge = roughPoly(board, 11, 1.4, 4)
const grid = computed(() => {
  let d = ''
  for (let i = -4; i <= 4; i++) {
    d += roughLine([-88, i * 20], [88, i * 20], 100 + i, 0.8)
    d += roughLine([i * 20, -88], [i * 20, 88], 200 + i, 0.8)
  }
  return d
})
const blacks = [
  [-2, 2],
  [-1, 1],
  [0, 0],
  [1, -1],
  [2, -2],
]
const whites = [
  [-2, 1],
  [0, 1],
  [1, 0],
  [-1, -1],
  [2, -1],
  [-1, 2],
]
</script>

<template>
  <svg viewBox="-112 -112 228 228" class="gomoku-art" :class="{ animate }" aria-hidden="true">
    <path :d="polyFill(rectPts(-84, -82, 190, 190))" fill="url(#hatch-x)" />
    <path :d="polyFill(board)" fill="var(--color-wood)" />
    <path :d="polyFill(rectPts(-95, 78, 190, 17))" fill="url(#hatch-soft)" />
    <path :d="grid" fill="none" stroke="var(--color-ink)" stroke-width="1.1" stroke-linecap="round" opacity=".6" />
    <path :d="edge" fill="none" stroke="var(--color-ink)" stroke-width="2.2" stroke-linecap="round" />
    <g v-for="(w, i) in whites" :key="`w${i}`" class="stone" :style="{ '--i': i * 2 + 1 }">
      <ArtStone :cx="w[0] * 20" :cy="w[1] * 20" :r="8.8" :seed="i + 30" />
    </g>
    <g v-for="(b, i) in blacks" :key="`b${i}`" class="stone" :style="{ '--i': i * 2 }">
      <ArtStone :cx="b[0] * 20" :cy="b[1] * 20" :r="8.8" black :seed="i + 60" />
    </g>
    <path class="stroke" pathLength="1" d="M-52 53Q-4 -2 53 -52" fill="none" stroke="var(--color-red)" stroke-width="6.5" stroke-linecap="round" opacity=".9" />
  </svg>
</template>

<style scoped>
.gomoku-art {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}
@keyframes stone-drop {
  from {
    opacity: 0;
    transform: translateY(-14px) scale(1.25);
  }
}
.animate .stone {
  transform-box: fill-box;
  transform-origin: center;
  animation: stone-drop 260ms var(--ease-out) both;
  animation-delay: calc(360ms + var(--i) * 55ms);
}
.stroke {
  stroke-dasharray: 1;
}
.animate .stroke {
  animation: draw 420ms var(--ease-in-out) 1020ms both;
}
</style>
