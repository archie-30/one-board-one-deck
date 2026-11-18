<script setup lang="ts">
// 西洋跳棋封面：鈷藍深色格的棋盤一角。停在這張卡片上時循環播放：黑子連跳兩顆紅子 → 到底線冒出皇冠升王 → 停一下 → 回到原位
defineProps<{ active?: boolean }>()
const W = 22
const x = (c: number) => 34 + W / 2 + c * W
const y = (r: number) => 10 + W / 2 + r * W
const dark = (r: number, c: number) => (r + c) % 2 === 1
const squares = Array.from({ length: 30 }, (_, k) => [Math.floor(k / 6), k % 6] as const).filter(([r, c]) => dark(r, c))
/** 旁邊擺著不動的子 */
const still = [
  { r: 0, c: 1, red: true },
  { r: 4, c: 3, red: false },
  { r: 3, c: 4, red: true },
]
</script>

<template>
  <svg viewBox="0 0 200 130" class="cover" :class="{ active }" aria-hidden="true">
    <rect x="38" y="14" width="132" height="110" fill="var(--color-ink)" />
    <rect x="34" y="10" width="132" height="110" fill="var(--color-card)" stroke="var(--color-ink)" stroke-width="2.4" />
    <rect v-for="([r, c], k) in squares" :key="k" :x="34 + c * W" :y="10 + r * W" :width="W" :height="W" fill="var(--color-blue)" />
    <rect x="34" y="10" width="132" height="110" fill="none" stroke="var(--color-ink)" stroke-width="2.4" />
    <g v-for="(p, k) in still" :key="`s${k}`">
      <circle :cx="x(p.c) + 1" :cy="y(p.r) + 1.2" r="8.6" fill="var(--color-ink)" />
      <circle :cx="x(p.c)" :cy="y(p.r)" r="8.6" :fill="p.red ? 'var(--color-red)' : 'var(--color-ink)'" stroke="var(--color-ink)" stroke-width="1.3" />
    </g>
    <!-- 被跳過、吃掉的兩顆紅子 -->
    <g class="v1">
      <circle :cx="x(2) + 1" :cy="y(3) + 1.2" r="8.6" fill="var(--color-ink)" />
      <circle :cx="x(2)" :cy="y(3)" r="8.6" fill="var(--color-red)" stroke="var(--color-ink)" stroke-width="1.3" />
    </g>
    <g class="v2">
      <circle :cx="x(4) + 1" :cy="y(1) + 1.2" r="8.6" fill="var(--color-ink)" />
      <circle :cx="x(4)" :cy="y(1)" r="8.6" fill="var(--color-red)" stroke="var(--color-ink)" stroke-width="1.3" />
    </g>
    <!-- 連跳的黑子：到底線冒出皇冠 -->
    <g :transform="`translate(${x(1)} ${y(4)})`">
      <g class="mover">
        <circle cx="1" cy="1.2" r="8.6" fill="var(--color-ink)" />
        <circle cx="0" cy="0" r="8.6" fill="var(--color-ink)" stroke="var(--color-ink)" stroke-width="1.3" />
        <circle cx="0" cy="0" r="6" fill="none" stroke="var(--color-card)" stroke-width="0.8" opacity="0.6" />
        <path class="crown" d="M-5 3 L-4.4 -3.4 L-1.8 -0.6 L0 -4.6 L1.8 -0.6 L4.4 -3.4 L5 3 Z" />
      </g>
    </g>
  </svg>
</template>

<style scoped>
.cover {
  width: 100%;
  height: 100%;
  overflow: hidden;
}
.crown {
  fill: var(--color-yellow);
  stroke: var(--color-ink);
  stroke-width: 0.8;
  stroke-linejoin: round;
  transform-box: fill-box;
  transform-origin: center;
  transform: scale(0);
}
.v1,
.v2 {
  transform-box: fill-box;
  transform-origin: center;
}
.active .mover {
  animation: hop 4s var(--ease-in-out) infinite;
}
.active .crown {
  animation: crown 4s var(--ease-back) infinite;
}
.active .v1 {
  animation: v1 4s var(--ease-out) infinite;
}
.active .v2 {
  animation: v2 4s var(--ease-out) infinite;
}
/* 兩次跳：每次往右上兩格（44px），中間抬高一點 */
@keyframes hop {
  0%,
  12% {
    transform: none;
  }
  21% {
    transform: translate(22px, -26px) scale(1.18);
  }
  30% {
    transform: translate(44px, -44px);
  }
  39% {
    transform: translate(66px, -70px) scale(1.18);
  }
  48%,
  84% {
    transform: translate(88px, -88px);
  }
  94%,
  100% {
    transform: none;
  }
}
@keyframes crown {
  0%,
  50% {
    transform: scale(0);
  }
  58%,
  84% {
    transform: none;
  }
  90%,
  100% {
    transform: scale(0);
  }
}
@keyframes v1 {
  0%,
  24% {
    opacity: 1;
    transform: none;
  }
  32%,
  86% {
    opacity: 0;
    transform: scale(0.3);
  }
  96%,
  100% {
    opacity: 1;
    transform: none;
  }
}
@keyframes v2 {
  0%,
  42% {
    opacity: 1;
    transform: none;
  }
  50%,
  86% {
    opacity: 0;
    transform: scale(0.3);
  }
  96%,
  100% {
    opacity: 1;
    transform: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .active .mover,
  .active .crown,
  .active .v1,
  .active .v2 {
    animation: none;
  }
}
</style>
