<script setup lang="ts">
// 九子棋封面：三個套在一起的正方形，紅藍兩色的子。
// 停在這張卡片上時循環播放：紅子沿著右邊的線往上走到右上角 → 上面一排三顆紅子成三（亮黃線）→ 一顆藍子飄走 → 淡回來
import { MILLS, XY } from '@/engine/morris/rules'
defineProps<{ active?: boolean }>()
const U = 15
const X0 = 55
const Y0 = 20
const x = (p: number) => X0 + XY[p][0] * U
const y = (p: number) => Y0 + XY[p][1] * U
const R = 5.4
const reds = [0, 1, 10, 16]
const blues = [9, 13, 18, 22]
/** 會走的紅子：從 14 沿著右邊的線走到 2；被拿走的藍子：13 */
const from = 14
const to = 2
const gone = 13
</script>

<template>
  <svg viewBox="0 0 200 130" class="cover" :class="{ active }" aria-hidden="true">
    <line v-for="(m, k) in MILLS" :key="k" :x1="x(m[0])" :y1="y(m[0])" :x2="x(m[2])" :y2="y(m[2])" class="ln" />
    <line :x1="x(0)" :y1="y(0)" :x2="x(2)" :y2="y(2)" class="mill" />
    <circle v-for="p in 24" :key="`d${p}`" :cx="x(p - 1)" :cy="y(p - 1)" r="1.4" class="dot" />
    <g v-for="p in reds" :key="`r${p}`">
      <circle :cx="x(p) + 0.9" :cy="y(p) + 1.1" :r="R" fill="var(--color-ink)" />
      <circle :cx="x(p)" :cy="y(p)" :r="R" class="s0" />
    </g>
    <g v-for="p in blues.filter((q) => q !== gone)" :key="`b${p}`">
      <circle :cx="x(p) + 0.9" :cy="y(p) + 1.1" :r="R" fill="var(--color-ink)" />
      <circle :cx="x(p)" :cy="y(p)" :r="R" class="s1" />
    </g>
    <g class="gone" :style="{ transformOrigin: `${x(gone)}px ${y(gone)}px` }">
      <circle :cx="x(gone) + 0.9" :cy="y(gone) + 1.1" :r="R" fill="var(--color-ink)" />
      <circle :cx="x(gone)" :cy="y(gone)" :r="R" class="s1" />
    </g>
    <g class="mover" :style="{ '--dx': `${x(to) - x(from)}px`, '--dy': `${y(to) - y(from)}px` }">
      <circle :cx="x(from) + 0.9" :cy="y(from) + 1.1" :r="R" fill="var(--color-ink)" />
      <circle :cx="x(from)" :cy="y(from)" :r="R" class="s0" />
    </g>
  </svg>
</template>

<style scoped>
.cover {
  width: 100%;
  height: 100%;
  overflow: visible;
}
.ln {
  stroke: var(--color-ink);
  stroke-width: 1.2;
  stroke-linecap: round;
}
.dot {
  fill: var(--color-ink);
}
.s0,
.s1 {
  stroke: var(--color-ink);
  stroke-width: 1;
}
.s0 {
  fill: var(--color-red);
}
.s1 {
  fill: var(--color-blue);
}
.mill {
  stroke: var(--color-yellow);
  stroke-width: 5;
  stroke-linecap: round;
  opacity: 0;
}
.mover,
.gone {
  transform-box: view-box;
}
.active .mover {
  animation: walk 3.4s var(--ease-in-out) infinite;
}
.active .mill {
  animation: mill 3.4s ease-out infinite;
}
.active .gone {
  animation: gone 3.4s ease-in infinite;
}
/* 紅子從 14 往上走到 2 */
@keyframes walk {
  0%,
  12% {
    transform: none;
  }
  32%,
  86% {
    transform: translate(var(--dx), var(--dy));
  }
  96%,
  100% {
    transform: none;
    opacity: 1;
  }
  90% {
    opacity: 0;
  }
}
@keyframes mill {
  0%,
  32% {
    opacity: 0;
  }
  42%,
  80% {
    opacity: 0.85;
  }
  92%,
  100% {
    opacity: 0;
  }
}
@keyframes gone {
  0%,
  46% {
    transform: none;
    opacity: 1;
  }
  62%,
  90% {
    transform: translateY(-10px) scale(0.5);
    opacity: 0;
  }
  100% {
    transform: none;
    opacity: 1;
  }
}
</style>
