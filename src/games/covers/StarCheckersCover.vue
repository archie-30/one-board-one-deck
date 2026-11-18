<script setup lang="ts">
// 星形跳棋封面：小小的六角星棋盤，三個角各擺著自己顏色的彈珠。停在這張卡片上時循環播放：藍彈珠連跳三次往上衝 → 停一下 → 回到原位
import { CELLS, CORNER_CELLS, cellAt } from '@/engine/starcheckers/rules'

defineProps<{ active?: boolean }>()
const R = 4.6
const X0 = 100
const Y0 = 66
const pt = (q: number, r: number) => ({ x: X0 + Math.sqrt(3) * (q + r / 2) * R, y: Y0 + 1.5 * r * R })
const holes = CELLS.map((h) => pt(h.q, h.r))
// 三個角的彈珠（跳的那顆另外畫）
const start = cellAt(-2, 6)
const homes = [
  { cells: CORNER_CELLS['r+'].filter((i) => i !== start), color: 'var(--color-blue)' },
  { cells: CORNER_CELLS['s+'], color: 'var(--color-red)' },
  { cells: CORNER_CELLS['q+'], color: 'var(--color-yellow)' },
]
/** 被跳過的彈珠（路上的） */
const stepping = [
  { at: pt(-2, 3), color: 'var(--color-red)' },
  { at: pt(-2, 1), color: 'var(--color-yellow)' },
]
const from = pt(-2, 6)
/** 一次跳兩格的位移 */
const dx = -Math.sqrt(3) * R
const dy = -3 * R
</script>

<template>
  <svg viewBox="0 0 200 130" class="cover" :class="{ active }" aria-hidden="true" :style="{ '--dx': `${dx}px`, '--dy': `${dy}px` }">
    <g>
      <circle v-for="(p, i) in holes" :key="`b${i}`" :cx="p.x" :cy="p.y" r="4.4" fill="var(--color-card)" stroke="var(--color-ink)" stroke-width="1.6" />
      <circle v-for="(p, i) in holes" :key="`h${i}`" :cx="p.x" :cy="p.y" r="4" fill="var(--color-card)" />
      <circle v-for="(p, i) in holes" :key="`p${i}`" :cx="p.x" :cy="p.y" r="1.2" fill="rgb(20 20 20 / 0.3)" />
    </g>
    <g v-for="(h, k) in homes" :key="`m${k}`">
      <circle v-for="i in h.cells" :key="i" :cx="holes[i].x" :cy="holes[i].y" r="3.5" :fill="h.color" stroke="var(--color-ink)" stroke-width="0.9" />
    </g>
    <circle :cx="pt(-2, 5).x" :cy="pt(-2, 5).y" r="3.5" fill="var(--color-blue)" stroke="var(--color-ink)" stroke-width="0.9" />
    <circle v-for="(m, k) in stepping" :key="`s${k}`" :cx="m.at.x" :cy="m.at.y" r="3.5" :fill="m.color" stroke="var(--color-ink)" stroke-width="0.9" />
    <!-- 連跳的那顆 -->
    <g class="mover">
      <circle :cx="from.x + 0.6" :cy="from.y + 0.8" r="3.9" fill="var(--color-ink)" />
      <circle :cx="from.x" :cy="from.y" r="3.9" fill="var(--color-blue)" stroke="var(--color-ink)" stroke-width="1" />
      <circle :cx="from.x - 1.2" :cy="from.y - 1.3" r="1.1" fill="var(--color-card)" opacity="0.8" />
    </g>
  </svg>
</template>

<style scoped>
.cover {
  width: 100%;
  height: 100%;
  overflow: hidden;
}
.active .mover {
  animation: hop 4.2s var(--ease-in-out) infinite;
}
/* 連跳三次：每次往上兩格，中間抬高一點 */
@keyframes hop {
  0%,
  10% {
    transform: none;
  }
  17% {
    transform: translate(calc(var(--dx) * 0.5), calc(var(--dy) * 0.5)) scale(1.35);
  }
  24% {
    transform: translate(var(--dx), var(--dy));
  }
  31% {
    transform: translate(calc(var(--dx) * 1.5), calc(var(--dy) * 1.5)) scale(1.35);
  }
  38% {
    transform: translate(calc(var(--dx) * 2), calc(var(--dy) * 2));
  }
  45% {
    transform: translate(calc(var(--dx) * 2.5), calc(var(--dy) * 2.5)) scale(1.35);
  }
  52%,
  84% {
    transform: translate(calc(var(--dx) * 3), calc(var(--dy) * 3));
  }
  94%,
  100% {
    transform: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .active .mover {
    animation: none;
  }
}
</style>
