<script setup lang="ts">
// 點格棋封面：米白底上一片墨黑點陣，已經畫了一些紅線、藍線，左上一格是藍的。
// 停在這張卡片上時循環播放：紅線補上中間那格的第四邊 → 那格塗紅 → 再畫一條，右邊那格也圍住塗紅（連吃）→ 停一下 → 淡掉重來
defineProps<{ active?: boolean }>()
const S = 26
const X0 = 48
const Y0 = 14
const COLS = 4
const ROWS = 3
const px = (c: number) => X0 + c * S
const py = (r: number) => Y0 + r * S
const dots = Array.from({ length: (COLS + 1) * (ROWS + 1) }, (_, k) => [k % (COLS + 1), Math.floor(k / (COLS + 1))] as const)
/** 畫好的線：[x1, y1, x2, y2]（點的行列）, 誰的顏色 */
const H = (c: number, r: number) => [c, r, c + 1, r] as const
const V = (c: number, r: number) => [c, r, c, r + 1] as const
const drawn: { l: readonly [number, number, number, number]; red: boolean }[] = [
  // 左上那格（藍的）
  { l: H(0, 0), red: false },
  { l: H(0, 1), red: true },
  { l: V(0, 0), red: false },
  { l: V(1, 0), red: false },
  // 中間那格（第 1 列第 1 行）差右邊一條，右邊那格（第 1 列第 2 行）差右邊一條
  { l: H(1, 1), red: false },
  { l: H(1, 2), red: true },
  { l: V(1, 1), red: true },
  { l: H(2, 1), red: false },
  { l: H(2, 2), red: true },
  // 其他零星的線
  { l: H(3, 0), red: true },
  { l: V(4, 2), red: false },
  { l: H(0, 3), red: false },
  { l: V(0, 2), red: true },
]
const seg = (l: readonly [number, number, number, number]) => ({ x1: px(l[0]), y1: py(l[1]), x2: px(l[2]), y2: py(l[3]) })
</script>

<template>
  <svg viewBox="0 0 200 130" class="cover" :class="{ active }" aria-hidden="true">
    <rect :x="X0 - 9" :y="Y0 - 9" :width="COLS * S + 18" :height="ROWS * S + 18" fill="var(--color-ink)" transform="translate(3 3)" />
    <rect :x="X0 - 9" :y="Y0 - 9" :width="COLS * S + 18" :height="ROWS * S + 18" fill="var(--color-card)" stroke="var(--color-ink)" stroke-width="2.2" />
    <!-- 藍的那格 -->
    <rect :x="px(0) + 2.4" :y="py(0) + 2.4" :width="S - 4.8" :height="S - 4.8" rx="1.6" class="b1" />
    <!-- 連吃的兩格 -->
    <rect :x="px(1) + 2.4" :y="py(1) + 2.4" :width="S - 4.8" :height="S - 4.8" rx="1.6" class="b0 g1" />
    <rect :x="px(2) + 2.4" :y="py(1) + 2.4" :width="S - 4.8" :height="S - 4.8" rx="1.6" class="b0 g2" />
    <line v-for="(d, k) in drawn" :key="k" v-bind="seg(d.l)" class="ln" :class="d.red ? 'l0' : 'l1'" />
    <!-- 補上的兩條紅線 -->
    <line v-bind="seg(V(2, 1))" class="ln l0 new n1" />
    <line v-bind="seg(V(3, 1))" class="ln l0 new n2" />
    <circle v-for="([c, r], k) in dots" :key="`d${k}`" :cx="px(c)" :cy="py(r)" r="2.6" fill="var(--color-ink)" />
  </svg>
</template>

<style scoped>
.cover {
  width: 100%;
  height: 100%;
  overflow: hidden;
}
.ln {
  stroke-width: 3;
  stroke-linecap: round;
}
.l0 {
  stroke: var(--color-red);
}
.l1 {
  stroke: var(--color-blue);
}
.b0 {
  fill: color-mix(in srgb, var(--color-card) 55%, var(--color-red));
  transform-box: fill-box;
  transform-origin: center;
}
.b1 {
  fill: color-mix(in srgb, var(--color-card) 55%, var(--color-blue));
}
/* 停著不動時：兩格已經是紅的、兩條線也畫好了 */
.new {
  stroke-dasharray: 26;
}
.active .n1 {
  animation: n1 4.6s var(--ease-out) infinite;
}
.active .n2 {
  animation: n2 4.6s var(--ease-out) infinite;
}
.active .g1 {
  animation: g1 4.6s var(--ease-back) infinite;
}
.active .g2 {
  animation: g2 4.6s var(--ease-back) infinite;
}
/* 第一條線：一開始還沒畫 → 畫過去 */
@keyframes n1 {
  0%,
  10% {
    stroke-dashoffset: 26;
    opacity: 1;
  }
  20%,
  86% {
    stroke-dashoffset: 0;
    opacity: 1;
  }
  94%,
  100% {
    stroke-dashoffset: 0;
    opacity: 0;
  }
}
@keyframes g1 {
  0%,
  20% {
    transform: scale(0.2);
    opacity: 0;
  }
  28%,
  86% {
    transform: none;
    opacity: 1;
  }
  94%,
  100% {
    opacity: 0;
  }
}
/* 第二條線：連吃，接著畫 */
@keyframes n2 {
  0%,
  38% {
    stroke-dashoffset: 26;
    opacity: 1;
  }
  48%,
  86% {
    stroke-dashoffset: 0;
    opacity: 1;
  }
  94%,
  100% {
    stroke-dashoffset: 0;
    opacity: 0;
  }
}
@keyframes g2 {
  0%,
  48% {
    transform: scale(0.2);
    opacity: 0;
  }
  56%,
  86% {
    transform: none;
    opacity: 1;
  }
  94%,
  100% {
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .active .n1,
  .active .n2,
  .active .g1,
  .active .g2 {
    animation: none;
  }
}
</style>
