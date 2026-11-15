<script setup lang="ts">
// 五子棋封面：棋盤一角，黑棋斜連四顆。停在這張卡片上時循環播放：第五顆黑子落下 → 紅線劃過五連 → 收回
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
    <rect x="26" y="5" width="160" height="126" fill="var(--color-ink)" />
    <rect x="22" y="1" width="160" height="126" fill="var(--color-yellow)" stroke="var(--color-ink)" stroke-width="2.4" />
    <g stroke="var(--color-ink)" stroke-width="1">
      <line v-for="i in 8" :key="`h${i}`" x1="30" x2="174" :y1="P(i - 1) - 10" :y2="P(i - 1) - 10" />
      <line v-for="i in 9" :key="`v${i}`" y1="6" y2="124" :x1="P(i - 1) + 8" :x2="P(i - 1) + 8" />
    </g>
    <Stone v-for="(b, i) in blacks" :key="`b${i}`" :cx="P(b[0]) + 8" :cy="P(b[1]) - 10" :r="6.5" black />
    <Stone v-for="(w, i) in whites" :key="`w${i}`" :cx="P(w[0]) + 8" :cy="P(w[1]) - 10" :r="6.5" />
    <g class="drop"><Stone :cx="P(6) + 8" :cy="P(1) - 10" :r="6.5" black /></g>
    <line class="win" :x1="P(2) + 2" :y1="P(5) - 4" :x2="P(6) + 14" :y2="P(1) - 16" />
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
  opacity: 0;
}
.win {
  stroke: var(--color-red);
  stroke-width: 3.5;
  stroke-linecap: round;
  stroke-dasharray: 100;
  stroke-dashoffset: 100;
}
.active .drop {
  animation: drop 3s var(--ease-back) infinite;
}
.active .win {
  animation: draw 3s var(--ease-in-out) infinite;
}
@keyframes drop {
  0%,
  8% {
    opacity: 0;
    transform: translateY(-18px) scale(1.5);
  }
  20% {
    opacity: 1;
    transform: scale(1.12, 0.88);
  }
  26%,
  80% {
    opacity: 1;
    transform: none;
  }
  92%,
  100% {
    opacity: 0;
    transform: none;
  }
}
@keyframes draw {
  0%,
  30% {
    stroke-dashoffset: 100;
    opacity: 1;
  }
  50%,
  80% {
    stroke-dashoffset: 0;
    opacity: 1;
  }
  92%,
  100% {
    stroke-dashoffset: 0;
    opacity: 0;
  }
}
</style>
