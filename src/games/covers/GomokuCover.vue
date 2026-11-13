<script setup lang="ts">
// 五子棋封面：棋盤一角，黑棋斜連；選起時最後一顆落下、劃上紅線
import Stone from '@/ui/art/Stone.vue'
defineProps<{ active?: boolean }>()
const P = (i: number) => 22 + i * 16
const blacks = [
  [2, 5],
  [3, 4],
  [4, 3],
  [5, 2],
]
const whites = [
  [3, 5],
  [4, 4],
  [6, 3],
  [2, 3],
]
</script>

<template>
  <svg viewBox="0 0 200 130" class="cover" :class="{ active }" aria-hidden="true">
    <rect x="22" y="3" width="160" height="128" rx="3" fill="rgb(23 23 26 / .1)" />
    <rect x="22" y="1" width="160" height="128" rx="3" fill="var(--color-board)" />
    <g stroke="rgb(23 23 26 / .5)" stroke-width="0.8">
      <line v-for="i in 8" :key="`h${i}`" x1="30" x2="174" :y1="P(i - 1) - 10" :y2="P(i - 1) - 10" />
      <line v-for="i in 9" :key="`v${i}`" y1="6" y2="124" :x1="P(i - 1) + 8" :x2="P(i - 1) + 8" />
    </g>
    <Stone v-for="(b, i) in blacks" :key="`b${i}`" :cx="P(b[0]) + 8" :cy="P(b[1]) - 10" :r="6.5" black />
    <Stone v-for="(w, i) in whites" :key="`w${i}`" :cx="P(w[0]) + 8" :cy="P(w[1]) - 10" :r="6.5" />
    <g v-if="active" class="drop"><Stone :cx="P(6) + 8" :cy="P(1) - 10" :r="6.5" black /></g>
    <line v-if="active" class="win" :x1="P(2) + 2" :y1="P(5) - 4" :x2="P(6) + 14" :y2="P(1) - 16" />
  </svg>
</template>

<style scoped>
.cover {
  width: 100%;
  height: 100%;
  overflow: visible;
}
.drop {
  transform-box: fill-box;
  transform-origin: center;
  animation: drop 380ms var(--ease-back) 120ms both;
}
@keyframes drop {
  from {
    opacity: 0;
    transform: translateY(-16px) scale(1.4);
  }
}
.win {
  stroke: var(--color-red);
  stroke-width: 3.5;
  stroke-linecap: round;
  stroke-dasharray: 100;
  animation: draw 460ms var(--ease-in-out) 480ms both;
}
@keyframes draw {
  from {
    stroke-dashoffset: 100;
  }
  to {
    stroke-dashoffset: 0;
  }
}
</style>
