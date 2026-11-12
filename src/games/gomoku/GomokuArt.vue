<script setup lang="ts">
// 五子棋的代表圖：一張棋盤，黑棋斜向連成五顆，被紅筆劃過
import ArtStone from '@/ui/art/ArtStone.vue'
import { inkPath } from '@/ui/art/ink'
import Sketch from '@/ui/art/Sketch.vue'
import { boardPrims } from './boardArt'

defineProps<{ animate?: boolean }>()

const { under, edge } = boardPrims(-95, -95, 190, 9, 15, 1.1)
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
const stroke = inkPath(
  [
    [-56, 57],
    [-20, 22],
    [18, -16],
    [57, -55],
  ],
  { width: 8, seed: 5, taper: 0.25, pressure: 0.5 },
)
</script>

<template>
  <svg viewBox="-112 -112 232 232" class="gomoku-art" :class="{ animate }" aria-hidden="true">
    <Sketch :prims="under" :seed="3" still />
    <Sketch :prims="edge" :seed="8" />
    <g v-for="(w, i) in whites" :key="`w${i}`" class="stone" :style="{ '--i': i * 2 + 1 }">
      <ArtStone :cx="w[0] * 20" :cy="w[1] * 20" :r="9" :seed="i + 30" />
    </g>
    <g v-for="(b, i) in blacks" :key="`b${i}`" class="stone" :style="{ '--i': i * 2 }">
      <ArtStone :cx="b[0] * 20" :cy="b[1] * 20" :r="9" black :seed="i + 60" />
    </g>
    <path class="win-stroke" :d="stroke" fill="var(--color-red)" opacity=".9" />
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
/* 紅筆從左下劃到右上 */
@keyframes swipe {
  from {
    clip-path: inset(0 100% 0 0);
  }
  to {
    clip-path: inset(-10% -10% -10% -10%);
  }
}
.animate .win-stroke {
  animation: swipe 380ms var(--ease-in-out) 1020ms both;
}
</style>
