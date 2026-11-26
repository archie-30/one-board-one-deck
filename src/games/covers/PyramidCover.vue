<script setup lang="ts">
// 金字塔接龍封面：四排疊成的小金字塔，左邊一疊牌堆。
// 停在這張卡片上時循環播放：最下面一排的 6 和 7 靠在一起（加起來 13）→ 一起往右上飛走 → 淡回來
import Card from '@/ui/art/Card.vue'
defineProps<{ active?: boolean }>()
const S = 0.36
const GX = 29
const DY = 17
/** [第幾排, 第幾張, 點數, 花色] */
const cells: [number, number, string, number][] = [
  [0, 0, 'K', 3],
  [1, 0, 'Q', 2],
  [1, 1, '3', 0],
  [2, 0, '9', 1],
  [2, 1, 'J', 3],
  [2, 2, '4', 2],
  [3, 0, '2', 0],
  [3, 3, '8', 1],
]
const pos = (r: number, c: number) => `translate(${110 + (c - r / 2) * GX - 13.3} ${14 + r * DY}) scale(${S})`
</script>

<template>
  <svg viewBox="0 0 200 130" class="cover" :class="{ active }" aria-hidden="true">
    <g v-for="k in 3" :key="`b${k}`" :transform="`translate(${14 + k * 1.2} ${40 - k * 1.5}) scale(${S}) rotate(${k * 2 - 4})`"><Card back /></g>
    <g v-for="[r, c, rank, suit] in cells" :key="`${r}${c}`" :transform="pos(r, c)"><Card :rank="rank" :suit="suit" /></g>
    <g class="pair a"><g :transform="pos(3, 1)"><Card rank="6" :suit="3" /></g></g>
    <g class="pair b"><g :transform="pos(3, 2)"><Card rank="7" :suit="2" /></g></g>
  </svg>
</template>

<style scoped>
.cover {
  width: 100%;
  height: 100%;
  overflow: visible;
}
.pair {
  transform-box: view-box;
}
.active .a {
  animation: pa 3.2s var(--ease-in-out) infinite;
}
.active .b {
  animation: pb 3.2s var(--ease-in-out) infinite;
}
/* 6 往右、7 往左靠在一起，抬起來，再一起往右上飛走 */
@keyframes pa {
  0%,
  12% {
    transform: none;
    opacity: 1;
  }
  34%,
  46% {
    transform: translate(10px, -6px) rotate(-4deg);
    opacity: 1;
  }
  70% {
    transform: translate(90px, -40px) rotate(14deg);
    opacity: 0;
  }
  86% {
    transform: none;
    opacity: 0;
  }
  100% {
    transform: none;
    opacity: 1;
  }
}
@keyframes pb {
  0%,
  12% {
    transform: none;
    opacity: 1;
  }
  34%,
  46% {
    transform: translate(-10px, -6px) rotate(4deg);
    opacity: 1;
  }
  72% {
    transform: translate(70px, -44px) rotate(20deg);
    opacity: 0;
  }
  86% {
    transform: none;
    opacity: 0;
  }
  100% {
    transform: none;
    opacity: 1;
  }
}
</style>
