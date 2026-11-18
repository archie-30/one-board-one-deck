<script setup lang="ts">
// 步步為營封面：鈷藍底、米白格子的棋盤一角，紅子在下、藍子在上，已經放了兩道黃牆。
// 停在這張卡片上時循環播放：紅子往上走一格 → 一道黃牆「咚」地落在它前面 → 紅子往旁邊繞一格 → 停一下 → 回到原位
defineProps<{ active?: boolean }>()
const S = 20
const X0 = 40
const Y0 = 10
const COLS = 6
const ROWS = 5
const cx = (c: number) => X0 + c * S + S / 2
const cy = (r: number) => Y0 + r * S + S / 2
const cells = Array.from({ length: COLS * ROWS }, (_, k) => [Math.floor(k / COLS), k % COLS] as const)
</script>

<template>
  <svg viewBox="0 0 200 130" class="cover" :class="{ active }" aria-hidden="true">
    <rect :x="X0 - 3" :y="Y0 - 3" :width="COLS * S + 6" :height="ROWS * S + 6" fill="var(--color-ink)" transform="translate(3 3)" />
    <rect :x="X0 - 3" :y="Y0 - 3" :width="COLS * S + 6" :height="ROWS * S + 6" fill="var(--color-blue)" stroke="var(--color-ink)" stroke-width="2.2" />
    <rect v-for="([r, c], k) in cells" :key="k" :x="X0 + c * S + 1.6" :y="Y0 + r * S + 1.6" :width="S - 3.2" :height="S - 3.2" rx="1.6" :fill="r === 0 ? 'color-mix(in srgb, var(--color-card) 80%, var(--color-red))' : 'var(--color-card)'" />
    <!-- 已經放好的兩道牆 -->
    <rect :x="X0 + 4 * S + 1.2" :y="Y0 + 1 * S - 1.8" :width="2 * S - 2.4" height="3.6" rx="1" class="wall" />
    <rect :x="X0 + 1 * S - 1.8" :y="Y0 + 0 * S + 1.2" width="3.6" :height="2 * S - 2.4" rx="1" class="wall" />
    <!-- 落下來的那道牆：擋在紅子前面 -->
    <rect :x="X0 + 1 * S + 1.2" :y="Y0 + 3 * S - 1.8" :width="2 * S - 2.4" height="3.6" rx="1" class="wall drop" />
    <!-- 藍子 -->
    <g :transform="`translate(${cx(3)} ${cy(1)})`">
      <circle cx="1" cy="1.3" r="6.4" fill="var(--color-ink)" />
      <circle r="6.4" fill="var(--color-blue)" stroke="var(--color-ink)" stroke-width="1.4" />
      <circle cx="-2" cy="-2.2" r="1.6" fill="var(--color-card)" opacity="0.7" />
    </g>
    <!-- 紅子 -->
    <g :transform="`translate(${cx(2)} ${cy(4)})`">
      <g class="mover">
        <circle cx="1" cy="1.3" r="6.4" fill="var(--color-ink)" />
        <circle r="6.4" fill="var(--color-red)" stroke="var(--color-ink)" stroke-width="1.4" />
        <circle cx="-2" cy="-2.2" r="1.6" fill="var(--color-card)" opacity="0.7" />
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
.wall {
  fill: var(--color-yellow);
  stroke: var(--color-ink);
  stroke-width: 1;
  transform-box: fill-box;
  transform-origin: center;
}
.drop {
  opacity: 0;
}
.active .drop {
  animation: drop 4.4s var(--ease-out) infinite;
}
.active .mover {
  animation: walk 4.4s var(--ease-in-out) infinite;
}
/* 紅子：往上一格 → 等牆落下 → 往右繞一格 → 停一下 → 淡掉回原位 */
@keyframes walk {
  0%,
  8% {
    transform: none;
    opacity: 1;
  }
  20%,
  44% {
    transform: translateY(-20px);
  }
  56%,
  84% {
    transform: translate(20px, -20px);
    opacity: 1;
  }
  90% {
    transform: translate(20px, -20px);
    opacity: 0;
  }
  92% {
    transform: none;
    opacity: 0;
  }
  100% {
    transform: none;
    opacity: 1;
  }
}
/* 牆：紅子走上來之後從上面放大落下 */
@keyframes drop {
  0%,
  24% {
    transform: scale(1.6);
    opacity: 0;
  }
  32%,
  86% {
    transform: none;
    opacity: 1;
  }
  92%,
  100% {
    transform: none;
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .active .drop,
  .active .mover {
    animation: none;
  }
}
</style>
