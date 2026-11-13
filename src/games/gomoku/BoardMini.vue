<script setup lang="ts">
// 小棋盤插圖（選擇畫面用）：busy 時再落下三顆棋子
import Stone from '@/ui/art/Stone.vue'

defineProps<{ busy?: boolean }>()
const step = 120 / 6
const p = (i: number) => 40 + i * step
const base = [
  [3, 3, true],
  [4, 2, false],
] as const
const more = [
  [2, 4, true],
  [4, 3, false],
  [1, 5, true],
] as const
</script>

<template>
  <svg viewBox="0 0 200 150" class="mini" aria-hidden="true">
    <rect x="44" y="9" width="124" height="124" fill="var(--color-ink)" />
    <rect x="38" y="3" width="124" height="124" fill="var(--color-yellow)" stroke="var(--color-ink)" stroke-width="2.4" />
    <g stroke="var(--color-ink)" stroke-width="1.1">
      <line v-for="i in 7" :key="`h${i}`" :x1="p(0)" :x2="p(6)" :y1="p(i - 1) - 35" :y2="p(i - 1) - 35" />
      <line v-for="i in 7" :key="`v${i}`" :y1="p(0) - 35" :y2="p(6) - 35" :x1="p(i - 1)" :x2="p(i - 1)" />
    </g>
    <Stone v-for="(s, i) in base" :key="`b${i}`" :cx="p(s[0])" :cy="p(s[1]) - 35" :r="8" :black="s[2]" />
    <template v-if="busy">
      <g v-for="(s, i) in more" :key="`m${i}`" class="drop" :style="{ '--i': i }"><Stone :cx="p(s[0])" :cy="p(s[1]) - 35" :r="8" :black="s[2]" /></g>
    </template>
  </svg>
</template>

<style scoped>
.mini {
  width: 100%;
  height: 100%;
  overflow: visible;
}
.drop {
  transform-box: fill-box;
  transform-origin: center;
  animation: drop 360ms var(--ease-back) both;
  animation-delay: calc(260ms + var(--i) * 180ms);
}
@keyframes drop {
  from {
    opacity: 0;
    transform: translateY(-18px) scale(1.4);
  }
}
</style>
