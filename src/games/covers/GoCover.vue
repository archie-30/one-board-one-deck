<script setup lang="ts">
// 圍棋封面：黑白交纏的一角。停在這張卡片上時循環播放：黑子落下圍住 → 中間那顆白子往上飄走（提子）→ 白子放回、黑子收回
import Stone from '@/ui/art/Stone.vue'
defineProps<{ active?: boolean }>()
const P = (i: number) => 22 + i * 16
const blacks = [
  [3, 2],
  [2, 3],
  [4, 3],
  [5, 4],
  [1, 4],
]
const whites = [
  [4, 2],
  [5, 3],
  [2, 4],
  [3, 5],
  [6, 4],
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
    <Stone v-for="(b, i) in blacks" :key="`b${i}`" :cx="P(b[0]) + 8" :cy="P(b[1]) - 10" :r="7" black />
    <Stone v-for="(w, i) in whites" :key="`w${i}`" :cx="P(w[0]) + 8" :cy="P(w[1]) - 10" :r="7" />
    <g class="victim"><Stone :cx="P(3) + 8" :cy="P(3) - 10" :r="7" /></g>
    <g class="drop"><Stone :cx="P(3) + 8" :cy="P(4) - 10" :r="7" black /></g>
  </svg>
</template>

<style scoped>
.cover {
  width: 100%;
  height: 100%;
  overflow: visible;
}
.victim,
.drop {
  transform-box: fill-box;
  transform-origin: center;
}
.drop {
  opacity: 0;
}
.active .drop {
  animation: drop 3.2s var(--ease-back) infinite;
}
.active .victim {
  animation: lift 3.2s var(--ease-out) infinite;
}
@keyframes drop {
  0%,
  6% {
    opacity: 0;
    transform: translateY(-18px) scale(1.5);
  }
  18% {
    opacity: 1;
    transform: scale(1.12, 0.88);
  }
  24%,
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
@keyframes lift {
  0%,
  28% {
    opacity: 1;
    transform: none;
  }
  52%,
  84% {
    opacity: 0;
    transform: translateY(-18px) scale(0.6);
  }
  85% {
    opacity: 0;
    transform: scale(0.6);
  }
  100% {
    opacity: 1;
    transform: none;
  }
}
</style>
