<script setup lang="ts">
// 黑白棋封面：棋盤一角，一排白子夾在兩顆黑子中間的位置。停在這張卡片上時循環播放：
// 黑子落下 → 中間三顆白子依序翻成黑的 → 收回
import Stone from '@/ui/art/Stone.vue'
defineProps<{ active?: boolean }>()
const C = 18
const X = (i: number) => 31 + i * C
const Y = (j: number) => 10 + j * C
const fixed: [number, number, boolean][] = [
  [1, 1, false],
  [2, 2, true],
  [3, 2, false],
  [4, 4, true],
  [5, 1, true],
  [2, 4, false],
  [6, 5, false],
]
const row = [2, 3, 4]
</script>

<template>
  <svg viewBox="0 0 200 130" class="cover" :class="{ active }" aria-hidden="true">
    <rect x="26" y="5" width="160" height="126" fill="var(--color-ink)" />
    <rect x="22" y="1" width="160" height="126" fill="var(--color-card)" stroke="var(--color-ink)" stroke-width="2.4" />
    <g stroke="var(--color-ink)" stroke-width="1">
      <line v-for="i in 7" :key="`h${i}`" x1="22" x2="182" :y1="Y(i) - 9" :y2="Y(i) - 9" />
      <line v-for="i in 8" :key="`v${i}`" y1="1" y2="127" :x1="X(i) - 9" :x2="X(i) - 9" />
    </g>
    <Stone v-for="(f, i) in fixed" :key="`f${i}`" :cx="X(f[0])" :cy="Y(f[1])" :r="7" :black="f[2]" />
    <!-- 第 3 排：左邊一顆黑子，中間三顆白子，右邊空位 -->
    <Stone :cx="X(1)" :cy="Y(3)" :r="7" black />
    <g v-for="(c, i) in row" :key="`r${i}`" class="flip" :style="{ '--i': i }">
      <g class="w"><Stone :cx="X(c)" :cy="Y(3)" :r="7" /></g>
      <g class="b"><Stone :cx="X(c)" :cy="Y(3)" :r="7" black /></g>
    </g>
    <g class="drop"><Stone :cx="X(5)" :cy="Y(3)" :r="7" black /></g>
  </svg>
</template>

<style scoped>
.cover {
  width: 100%;
  height: 100%;
  overflow: visible;
}
.drop,
.w,
.b {
  transform-box: fill-box;
  transform-origin: center;
}
.drop {
  opacity: 0;
}
.b {
  transform: scaleX(0);
}
.active .drop {
  animation: drop 3.2s var(--ease-back) infinite;
}
.active .w {
  animation: w 3.2s linear infinite;
  animation-delay: calc(var(--i) * -0.08s);
}
.active .b {
  animation: b 3.2s linear infinite;
  animation-delay: calc(var(--i) * -0.08s);
}
@keyframes drop {
  0%,
  6% {
    opacity: 0;
    transform: translateY(-18px) scale(1.5);
  }
  16% {
    opacity: 1;
    transform: scale(1.12, 0.88);
  }
  22%,
  82% {
    opacity: 1;
    transform: none;
  }
  92%,
  100% {
    opacity: 0;
    transform: none;
  }
}
/* 白子先壓扁消失，黑子再展開；最後一起翻回白子重來 */
@keyframes w {
  0%,
  30% {
    transform: none;
  }
  34%,
  88% {
    transform: scaleX(0);
  }
  94%,
  100% {
    transform: none;
  }
}
@keyframes b {
  0%,
  34% {
    transform: scaleX(0);
  }
  39%,
  86% {
    transform: none;
  }
  88%,
  100% {
    transform: scaleX(0);
  }
}
</style>
