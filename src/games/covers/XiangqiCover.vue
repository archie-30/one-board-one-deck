<script setup lang="ts">
// 象棋封面：黃色棋盤的一角與九宮斜線，紅帥、黑車；選起時紅炮跳過炮架吃過去
defineProps<{ active?: boolean }>()
const C = 24
const x = (c: number) => 28 + c * C
const y = (r: number) => 12 + r * C
const pieces = [
  { c: 2, r: 0, t: '車', red: false },
  { c: 4, r: 3, t: '帥', red: true },
  { c: 2, r: 2, t: '兵', red: true },
]
</script>

<template>
  <svg viewBox="0 0 200 130" class="cover" :class="{ active }" aria-hidden="true">
    <rect x="22" y="6" width="160" height="130" fill="var(--color-ink)" />
    <rect x="18" y="2" width="160" height="130" fill="var(--color-yellow)" stroke="var(--color-ink)" stroke-width="2.4" />
    <g stroke="var(--color-ink)" stroke-width="1.2">
      <line v-for="r in 5" :key="`h${r}`" :x1="x(0)" :x2="x(6)" :y1="y(r - 1)" :y2="y(r - 1)" />
      <line v-for="c in 7" :key="`v${c}`" :x1="x(c - 1)" :x2="x(c - 1)" :y1="y(0)" :y2="y(4.5)" />
      <path :d="`M${x(3)} ${y(2)}l${C * 2} ${C * 2}M${x(5)} ${y(2)}l${-C * 2} ${C * 2}`" />
    </g>
    <g v-for="(p, i) in pieces" :key="i">
      <circle :cx="x(p.c) + 1.5" :cy="y(p.r) + 1.8" r="10.5" fill="var(--color-ink)" />
      <circle :cx="x(p.c)" :cy="y(p.r)" r="10.5" fill="var(--color-card)" stroke="var(--color-ink)" stroke-width="1.4" />
      <text :x="x(p.c)" :y="y(p.r) + 4.3" class="t" :fill="p.red ? 'var(--color-red)' : 'var(--color-ink)'">{{ p.t }}</text>
    </g>
    <g class="jump">
      <circle cx="1.5" cy="1.8" r="10.5" fill="var(--color-ink)" />
      <circle cx="0" cy="0" r="10.5" fill="var(--color-card)" stroke="var(--color-ink)" stroke-width="1.4" />
      <text x="0" y="4.3" class="t" fill="var(--color-red)">炮</text>
    </g>
  </svg>
</template>

<style scoped>
.cover {
  width: 100%;
  height: 100%;
  overflow: hidden;
}
.t {
  font-size: 12px;
  font-weight: 900;
  text-anchor: middle;
}
.jump {
  transform-box: view-box;
  transform: translate(76px, 108px);
  transition: transform 560ms var(--ease-back);
}
.active .jump {
  transform: translate(76px, 12px);
}
</style>
