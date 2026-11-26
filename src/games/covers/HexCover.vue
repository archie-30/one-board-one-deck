<script setup lang="ts">
// 海克斯封面：5 × 5 的小菱形棋盤，上下紅邊、左右藍邊，紅子從上往下差一格就連通。
// 停在這張卡片上時循環播放：紅子落在缺口 → 整串亮起黃圈（連通了）→ 淡回來
defineProps<{ active?: boolean }>()
const N = 5
const R = 12
const WX = Math.sqrt(3) * R
const cx = (r: number, c: number) => 100 + (c - (N - 1) / 2) * WX + (r - (N - 1) / 2) * (WX / 2)
const cy = (r: number) => 65 + (r - (N - 1) / 2) * 1.5 * R
const hex = (r: number, c: number) =>
  Array.from({ length: 6 }, (_, k) => {
    const a = ((-90 + 60 * k) * Math.PI) / 180
    return `${cx(r, c) + R * Math.cos(a)},${cy(r) + R * Math.sin(a)}`
  }).join(' ')
const cells = Array.from({ length: N * N }, (_, i) => [Math.floor(i / N), i % N] as const)
const red: [number, number][] = [
  [0, 2],
  [1, 2],
  [3, 1],
  [4, 1],
]
const blue: [number, number][] = [
  [2, 2],
  [1, 3],
  [3, 3],
  [2, 0],
]
const drop: [number, number] = [2, 1]
const chain = [...red.slice(0, 2), drop, ...red.slice(2)]
// 四條邊：沿著最外圈的格子，往外推一點
const edge = (pts: [number, number][]) => pts.map(([x, y]) => `${x},${y}`).join(' ')
const vtx = (r: number, c: number, k: number): [number, number] => {
  const a = ((-90 + 60 * k) * Math.PI) / 180
  return [cx(r, c) + R * Math.cos(a), cy(r) + R * Math.sin(a)]
}
const top = edge(Array.from({ length: N }, (_, c) => [vtx(0, c, 5), vtx(0, c, 0)]).flat().concat([vtx(0, N - 1, 1)]))
const bottom = edge(Array.from({ length: N }, (_, c) => [vtx(N - 1, c, 4), vtx(N - 1, c, 3)]).flat().concat([vtx(N - 1, N - 1, 2)]))
const left = edge(Array.from({ length: N }, (_, r) => [vtx(r, 0, 5), vtx(r, 0, 4), vtx(r, 0, 3)]).flat())
const right = edge(Array.from({ length: N }, (_, r) => [vtx(r, N - 1, 0), vtx(r, N - 1, 1), vtx(r, N - 1, 2)]).flat())
</script>

<template>
  <svg viewBox="0 0 200 130" class="cover" :class="{ active }" aria-hidden="true">
    <polyline :points="left" class="edge e1" />
    <polyline :points="right" class="edge e1" />
    <polyline :points="top" class="edge e0" />
    <polyline :points="bottom" class="edge e0" />
    <polygon v-for="[r, c] in cells" :key="`${r}-${c}`" :points="hex(r, c)" class="cell" />
    <g v-for="[r, c] in blue" :key="`b${r}${c}`">
      <circle :cx="cx(r, c) + 0.8" :cy="cy(r) + 1" :r="R * 0.6" fill="var(--color-ink)" />
      <circle :cx="cx(r, c)" :cy="cy(r)" :r="R * 0.6" class="s1" />
    </g>
    <g v-for="[r, c] in red" :key="`r${r}${c}`">
      <circle :cx="cx(r, c) + 0.8" :cy="cy(r) + 1" :r="R * 0.6" fill="var(--color-ink)" />
      <circle :cx="cx(r, c)" :cy="cy(r)" :r="R * 0.6" class="s0" />
    </g>
    <g class="drop" :style="{ transformOrigin: `${cx(drop[0], drop[1])}px ${cy(drop[0])}px` }">
      <circle :cx="cx(drop[0], drop[1]) + 0.8" :cy="cy(drop[0]) + 1" :r="R * 0.6" fill="var(--color-ink)" />
      <circle :cx="cx(drop[0], drop[1])" :cy="cy(drop[0])" :r="R * 0.6" class="s0" />
    </g>
    <circle v-for="([r, c], k) in chain" :key="`g${k}`" :cx="cx(r, c)" :cy="cy(r)" :r="R * 0.78" class="ring" :style="{ '--k': k }" />
  </svg>
</template>

<style scoped>
.cover {
  width: 100%;
  height: 100%;
  overflow: visible;
}
.edge {
  fill: none;
  stroke-width: 4;
  stroke-linejoin: round;
  stroke-linecap: round;
}
.e0 {
  stroke: var(--color-red);
}
.e1 {
  stroke: var(--color-blue);
}
.cell {
  fill: var(--color-card);
  stroke: var(--color-ink);
  stroke-width: 0.7;
}
.s0,
.s1 {
  stroke: var(--color-ink);
  stroke-width: 0.9;
}
.s0 {
  fill: var(--color-red);
}
.s1 {
  fill: var(--color-blue);
}
.drop {
  opacity: 0;
}
.ring {
  fill: none;
  stroke: var(--color-yellow);
  stroke-width: 2;
  opacity: 0;
}
.active .drop {
  animation: drop 3.2s var(--ease-in-out) infinite;
}
.active .ring {
  animation: glow 3.2s ease-out infinite;
  animation-delay: calc(var(--k) * 70ms);
}
@keyframes drop {
  0%,
  12% {
    opacity: 0;
    transform: translateY(-14px) scale(1.25);
  }
  26% {
    opacity: 1;
    transform: scale(0.9, 0.84);
  }
  32%,
  84% {
    opacity: 1;
    transform: none;
  }
  96%,
  100% {
    opacity: 0;
    transform: none;
  }
}
@keyframes glow {
  0%,
  34% {
    opacity: 0;
  }
  44%,
  80% {
    opacity: 1;
  }
  92%,
  100% {
    opacity: 0;
  }
}
</style>
