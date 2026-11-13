<script setup lang="ts">
// 圍棋封面：黑白交纏的一角；選起時中間那顆白子被提走
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
    <g v-if="active" class="drop"><Stone :cx="P(3) + 8" :cy="P(4) - 10" :r="7" black /></g>
  </svg>
</template>

<style scoped>
.cover {
  width: 100%;
  height: 100%;
  overflow: visible;
}
.victim {
  transform-box: fill-box;
  transform-origin: center;
  transition:
    opacity 400ms ease 420ms,
    transform 500ms var(--ease-out) 420ms;
}
.active .victim {
  opacity: 0;
  transform: translateY(-14px) scale(0.6);
}
.drop {
  transform-box: fill-box;
  transform-origin: center;
  animation: drop 360ms var(--ease-back) 80ms both;
}
@keyframes drop {
  from {
    opacity: 0;
    transform: translateY(-16px) scale(1.4);
  }
}
</style>
