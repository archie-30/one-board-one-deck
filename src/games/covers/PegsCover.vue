<script setup lang="ts">
// 孔明棋封面：十字形的板子上一排朱紅圓珠。
// 停在這張卡片上時循環播放：右邊一顆跳過旁邊那顆、落到正中間的空孔 → 被跳過的那顆往上飄走 → 淡回來
import { HOLES, N } from '@/engine/pegs/rules'
defineProps<{ active?: boolean }>()
const U = 17.4
const X0 = 100 - 3.5 * U
const Y0 = 65 - 3.5 * U
const x = (i: number) => X0 + (i % N) * U + U / 2
const y = (i: number) => Y0 + Math.floor(i / N) * U + U / 2
const R = 6
/** 擺著的子：中間空、少幾顆，看起來像下到一半 */
const EMPTY = new Set([24, 10, 16, 30, 38, 46, 20])
const pegs = HOLES.filter((i) => !EMPTY.has(i))
const from = 26
const over = 25
const to = 24
const CROSS = `M ${X0 + 2 * U} ${Y0} h ${3 * U} v ${2 * U} h ${2 * U} v ${3 * U} h ${-2 * U} v ${2 * U} h ${-3 * U} v ${-2 * U} h ${-2 * U} v ${-3 * U} h ${2 * U} z`
</script>

<template>
  <svg viewBox="0 0 200 130" class="cover" :class="{ active }" aria-hidden="true">
    <path :d="CROSS" transform="translate(1.6 1.9)" fill="var(--color-ink)" />
    <path :d="CROSS" class="board" />
    <circle v-for="i in HOLES" :key="`h${i}`" :cx="x(i)" :cy="y(i)" r="2.8" class="hole" />
    <g v-for="i in pegs.filter((p) => p !== from && p !== over)" :key="`p${i}`">
      <circle :cx="x(i) + 0.9" :cy="y(i) + 1.1" :r="R" fill="var(--color-ink)" />
      <circle :cx="x(i)" :cy="y(i)" :r="R" class="peg" />
    </g>
    <g class="gone" :style="{ transformOrigin: `${x(over)}px ${y(over)}px` }">
      <circle :cx="x(over) + 0.9" :cy="y(over) + 1.1" :r="R" fill="var(--color-ink)" />
      <circle :cx="x(over)" :cy="y(over)" :r="R" class="peg" />
    </g>
    <g class="mover" :style="{ '--dx': `${x(to) - x(from)}px`, transformOrigin: `${x(from)}px ${y(from)}px` }">
      <circle :cx="x(from) + 0.9" :cy="y(from) + 1.1" :r="R" fill="var(--color-ink)" />
      <circle :cx="x(from)" :cy="y(from)" :r="R" class="peg" />
    </g>
  </svg>
</template>

<style scoped>
.cover {
  width: 100%;
  height: 100%;
  overflow: visible;
}
.board {
  fill: var(--color-card);
  stroke: var(--color-ink);
  stroke-width: 1.2;
  stroke-linejoin: round;
}
.hole {
  fill: color-mix(in srgb, var(--color-ink) 22%, transparent);
}
.peg {
  fill: var(--color-red);
  stroke: var(--color-ink);
  stroke-width: 1;
}
.mover,
.gone {
  transform-box: view-box;
}
.active .mover {
  animation: hop 3.2s var(--ease-in-out) infinite;
}
.active .gone {
  animation: gone 3.2s ease-in infinite;
}
/* 跳過旁邊那顆落到中間（拱起來放大一下），停一下，淡掉回原位 */
@keyframes hop {
  0%,
  14% {
    transform: none;
    opacity: 1;
  }
  24% {
    transform: translateX(calc(var(--dx) * 0.5)) translateY(-6px) scale(1.3);
  }
  34%,
  84% {
    transform: translateX(var(--dx));
    opacity: 1;
  }
  90% {
    transform: translateX(var(--dx));
    opacity: 0;
  }
  96%,
  100% {
    transform: none;
    opacity: 1;
  }
}
@keyframes gone {
  0%,
  32% {
    transform: none;
    opacity: 1;
  }
  48%,
  92% {
    transform: translateY(-10px) scale(0.5);
    opacity: 0;
  }
  100% {
    transform: none;
    opacity: 1;
  }
}
</style>
