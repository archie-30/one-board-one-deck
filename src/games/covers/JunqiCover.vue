<script setup lang="ts">
// 軍棋封面：一段鐵路（黑白線）、中間的山界，左邊紅子、右邊藍色的暗子。
// 停在這張卡片上時循環播放：紅色「師」沿著鐵路衝過山界 → 碰到藍色暗子，暗子翻出「營」→ 火花、營淡掉 → 淡回來
defineProps<{ active?: boolean }>()
const TW = 32
const TH = 25
/** 鐵路那一排的高度、師的起點與終點 */
const RY = 65
const FROM = 40
const TO = 158
</script>

<template>
  <svg viewBox="0 0 200 130" class="cover" :class="{ active }" aria-hidden="true">
    <!-- 山界 -->
    <rect x="86" y="12" width="26" height="106" class="front" />
    <path d="M 92 44 l 5 -9 3 4 2 -3 6 8 z M 92 100 l 5 -9 3 4 2 -3 6 8 z" class="mt" />
    <!-- 公路 -->
    <line x1="40" y1="24" x2="40" y2="106" class="road" />
    <line x1="158" y1="24" x2="158" y2="106" class="road" />
    <!-- 鐵路 -->
    <line x1="14" :y1="RY" x2="186" :y2="RY" class="rail" />
    <line x1="14" :y1="RY" x2="186" :y2="RY" class="tie" />
    <!-- 行營 -->
    <circle cx="70" cy="30" r="10" class="camp" />
    <circle cx="126" cy="100" r="10" class="camp" />
    <!-- 其他的子 -->
    <g>
      <rect :x="40 - TW / 2 + 1.4" :y="24 - TH / 2 + 1.6" :width="TW" :height="TH" rx="3" fill="var(--color-ink)" />
      <rect :x="40 - TW / 2" :y="24 - TH / 2" :width="TW" :height="TH" rx="3" class="s0" />
      <text x="40" y="24.6" class="ch">工</text>
    </g>
    <g>
      <rect :x="40 - TW / 2 + 1.4" :y="106 - TH / 2 + 1.6" :width="TW" :height="TH" rx="3" fill="var(--color-ink)" />
      <rect :x="40 - TW / 2" :y="106 - TH / 2" :width="TW" :height="TH" rx="3" class="s0" />
      <text x="40" y="106.6" class="ch">旅</text>
    </g>
    <g>
      <rect :x="158 - TW / 2 + 1.4" :y="24 - TH / 2 + 1.6" :width="TW" :height="TH" rx="3" fill="var(--color-ink)" />
      <rect :x="158 - TW / 2" :y="24 - TH / 2" :width="TW" :height="TH" rx="3" class="s1" />
      <path d="M 158 18 l 2 4.4 4.8 0.4 -3.6 3.2 1.2 4.8 -4.4 -2.4 -4.4 2.4 1.2 -4.8 -3.6 -3.2 4.8 -0.4 z" class="star" />
    </g>
    <!-- 被吃的藍子：先是暗子，翻出「營」再淡掉 -->
    <g class="foe" :style="{ transformOrigin: `${TO}px ${RY}px` }">
      <rect :x="TO - TW / 2 + 1.4" :y="RY - TH / 2 + 1.6" :width="TW" :height="TH" rx="3" fill="var(--color-ink)" />
      <rect :x="TO - TW / 2" :y="RY - TH / 2" :width="TW" :height="TH" rx="3" class="s1" />
      <path :d="`M ${TO} ${RY - 7} l 2 4.4 4.8 0.4 -3.6 3.2 1.2 4.8 -4.4 -2.4 -4.4 2.4 1.2 -4.8 -3.6 -3.2 4.8 -0.4 z`" class="star hid" />
      <text :x="TO" :y="RY + 0.6" class="ch shown">營</text>
    </g>
    <!-- 衝過去的師 -->
    <g class="mover" :style="{ '--dx': `${TO - FROM}px` }">
      <rect :x="FROM - TW / 2 + 1.4" :y="RY - TH / 2 + 1.6" :width="TW" :height="TH" rx="3" fill="var(--color-ink)" />
      <rect :x="FROM - TW / 2" :y="RY - TH / 2" :width="TW" :height="TH" rx="3" class="s0" />
      <text :x="FROM" :y="RY + 0.6" class="ch">師</text>
    </g>
    <!-- 火花 -->
    <path class="burst" :style="{ transformOrigin: `${TO}px ${RY}px` }" :d="`M ${TO} ${RY - 18} l 4 10 11 -3 -7 9 9 6 -11 1 1 11 -7 -9 -7 9 1 -11 -11 -1 9 -6 -7 -9 11 3 z`" />
  </svg>
</template>

<style scoped>
.cover {
  width: 100%;
  height: 100%;
  overflow: visible;
}
.front {
  fill: color-mix(in srgb, var(--color-yellow) 35%, var(--color-card));
}
.mt {
  fill: color-mix(in srgb, var(--color-ink) 25%, transparent);
}
.road {
  stroke: var(--color-ink);
  stroke-width: 1;
}
.rail {
  stroke: var(--color-ink);
  stroke-width: 5;
}
.tie {
  stroke: var(--color-card);
  stroke-width: 1.8;
  stroke-dasharray: 4 4;
}
.camp {
  fill: color-mix(in srgb, var(--color-yellow) 30%, var(--color-card));
  stroke: var(--color-ink);
  stroke-width: 1.2;
}
.s0,
.s1 {
  stroke: var(--color-ink);
  stroke-width: 1.2;
}
.s0 {
  fill: var(--color-red);
}
.s1 {
  fill: var(--color-blue);
}
.ch {
  fill: var(--color-paper);
  font-size: 17px;
  font-weight: 900;
  text-anchor: middle;
  dominant-baseline: central;
}
.star {
  fill: var(--color-paper);
}
.shown {
  opacity: 0;
}
.burst {
  fill: var(--color-yellow);
  stroke: var(--color-ink);
  stroke-width: 1;
  opacity: 0;
}
.mover,
.foe,
.burst {
  transform-box: view-box;
}
.active .mover {
  animation: dash 3.6s var(--ease-in-out) infinite;
}
.active .foe {
  animation: foe 3.6s ease-in infinite;
}
.active .hid {
  animation: hid 3.6s steps(1) infinite;
}
.active .shown {
  animation: shown 3.6s steps(1) infinite;
}
.active .burst {
  animation: burst 3.6s ease-out infinite;
}
/* 師從左邊沿鐵路衝到右邊，停一下，淡掉回原位 */
@keyframes dash {
  0%,
  12% {
    transform: none;
    opacity: 1;
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
/* 暗子翻出「營」之後被吃掉、淡掉 */
@keyframes foe {
  0%,
  42% {
    transform: none;
    opacity: 1;
  }
  56%,
  92% {
    transform: translateY(-8px) scale(0.7);
    opacity: 0;
  }
  100% {
    transform: none;
    opacity: 1;
  }
}
@keyframes hid {
  0%,
  33% {
    opacity: 1;
  }
  34%,
  95% {
    opacity: 0;
  }
  96% {
    opacity: 1;
  }
}
@keyframes shown {
  0%,
  33% {
    opacity: 0;
  }
  34%,
  95% {
    opacity: 1;
  }
  96% {
    opacity: 0;
  }
}
@keyframes burst {
  0%,
  34% {
    opacity: 0;
    transform: scale(0.4);
  }
  42% {
    opacity: 1;
    transform: scale(1.1);
  }
  56%,
  100% {
    opacity: 0;
    transform: scale(1.3);
  }
}
</style>
