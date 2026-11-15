<script setup lang="ts">
// 象棋封面：黃色棋盤的一角與九宮斜線，紅帥、紅兵、黑車。停在這張卡片上時循環播放：紅炮翻過兵（炮架）吃掉黑車 → 停一下 → 回到原位，黑車放回
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
    <g v-for="(p, i) in pieces" :key="i" :class="{ victim: i === 0 }">
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
}
.victim {
  transform-box: fill-box;
  transform-origin: center;
}
.active .jump {
  animation: jump 3.2s var(--ease-in-out) infinite;
}
.active .victim {
  animation: taken 3.2s var(--ease-out) infinite;
}
/* 炮：往前走，經過兵（炮架）時跳起來翻過去，落在車上 */
@keyframes jump {
  0%,
  8% {
    transform: translate(76px, 108px);
  }
  22% {
    transform: translate(76px, 76px);
  }
  32% {
    transform: translate(76px, 42px) scale(1.3);
  }
  42%,
  70% {
    transform: translate(76px, 12px);
  }
  86% {
    transform: translate(76px, 108px);
    opacity: 1;
  }
  100% {
    transform: translate(76px, 108px);
  }
}
@keyframes taken {
  0%,
  40% {
    opacity: 1;
    transform: none;
  }
  48%,
  80% {
    opacity: 0;
    transform: translateY(-10px) scale(0.6);
  }
  92%,
  100% {
    opacity: 1;
    transform: none;
  }
}
</style>
