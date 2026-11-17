<script setup lang="ts">
// 暗棋封面：亮黃格子上一排排蓋著的棋。停在這張卡片上時循環播放：一顆蓋著的棋翻開變成紅兵 → 兵往右走一格吃掉黑將 → 停一下 → 回到原位
defineProps<{ active?: boolean }>()
const W = 38
const x = (c: number) => 24 + W / 2 + c * W
const y = (r: number) => 10 + W / 2 + r * W
// 蓋著的棋（第 1 排第 1 顆是要翻開的那顆，另外畫）
const hidden = [
  [0, 0], [0, 1], [0, 3],
  [1, 0], [1, 3],
  [2, 0], [2, 1], [2, 2], [2, 3],
] as const
</script>

<template>
  <svg viewBox="0 0 200 130" class="cover" :class="{ active }" aria-hidden="true">
    <rect x="28" y="14" width="152" height="114" fill="var(--color-ink)" />
    <rect x="24" y="10" width="152" height="114" fill="var(--color-yellow)" stroke="var(--color-ink)" stroke-width="2.4" />
    <g stroke="var(--color-ink)" stroke-width="1" opacity="0.55">
      <line v-for="c in 3" :key="`v${c}`" :x1="24 + c * W" :x2="24 + c * W" y1="10" y2="124" />
      <line v-for="r in 2" :key="`h${r}`" x1="24" x2="176" :y1="10 + r * W" :y2="10 + r * W" />
    </g>
    <g v-for="([r, c], k) in hidden" :key="k">
      <circle :cx="x(c) + 1.5" :cy="y(r) + 1.8" r="14" fill="var(--color-ink)" />
      <circle :cx="x(c)" :cy="y(r)" r="14" fill="var(--color-ink)" stroke="var(--color-ink)" stroke-width="1.4" />
      <circle :cx="x(c)" :cy="y(r)" r="9" fill="none" stroke="rgb(251 248 241 / .35)" stroke-width="1.2" stroke-dasharray="2 2.2" />
      <circle :cx="x(c)" :cy="y(r)" r="2.4" fill="var(--color-red)" />
    </g>
    <!-- 黑將：被吃掉 -->
    <g class="victim">
      <circle :cx="x(2) + 1.5" :cy="y(1) + 1.8" r="14" fill="var(--color-ink)" />
      <circle :cx="x(2)" :cy="y(1)" r="14" fill="var(--color-card)" stroke="var(--color-ink)" stroke-width="1.4" />
      <text :x="x(2)" :y="y(1) + 5.6" class="t" fill="var(--color-ink)">將</text>
    </g>
    <!-- 翻開的那顆：先是背面，翻成紅兵，再往右走 -->
    <g class="mover" :transform="`translate(${x(1)} ${y(1)})`">
      <g class="walk">
        <g class="back">
          <circle cx="1.5" cy="1.8" r="14" fill="var(--color-ink)" />
          <circle cx="0" cy="0" r="14" fill="var(--color-ink)" stroke="var(--color-ink)" stroke-width="1.4" />
          <circle cx="0" cy="0" r="9" fill="none" stroke="rgb(251 248 241 / .35)" stroke-width="1.2" stroke-dasharray="2 2.2" />
          <circle cx="0" cy="0" r="2.4" fill="var(--color-red)" />
        </g>
        <g class="face">
          <circle cx="1.5" cy="1.8" r="14" fill="var(--color-ink)" />
          <circle cx="0" cy="0" r="14" fill="var(--color-card)" stroke="var(--color-ink)" stroke-width="1.4" />
          <text x="0" y="5.6" class="t" fill="var(--color-red)">兵</text>
        </g>
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
.t {
  font-size: 16px;
  font-weight: 900;
  text-anchor: middle;
}
.face {
  transform: scaleX(0);
}
.victim {
  transform-box: fill-box;
  transform-origin: center;
}
.active .back {
  animation: hide 3.6s var(--ease-in-out) infinite;
}
.active .face {
  animation: show 3.6s var(--ease-in-out) infinite;
}
.active .walk {
  animation: walk 3.6s var(--ease-out) infinite;
}
.active .victim {
  animation: taken 3.6s var(--ease-out) infinite;
}
/* 背面縮成一條線、正面再展開：像翻牌 */
@keyframes hide {
  0%,
  10% {
    transform: none;
  }
  20%,
  88% {
    transform: scaleX(0);
  }
  96%,
  100% {
    transform: none;
  }
}
@keyframes show {
  0%,
  20% {
    transform: scaleX(0);
  }
  30%,
  86% {
    transform: none;
  }
  88%,
  100% {
    transform: scaleX(0);
  }
}
@keyframes walk {
  0%,
  40% {
    transform: none;
  }
  52% {
    transform: translate(19px, -6px) scale(1.08);
  }
  58%,
  80% {
    transform: translateX(38px);
  }
  86%,
  100% {
    transform: none;
  }
}
@keyframes taken {
  0%,
  54% {
    opacity: 1;
    transform: none;
  }
  60%,
  84% {
    opacity: 0;
    transform: translateY(-8px) scale(0.6);
  }
  94%,
  100% {
    opacity: 1;
    transform: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .active .back,
  .active .face,
  .active .walk,
  .active .victim {
    animation: none;
  }
}
</style>
