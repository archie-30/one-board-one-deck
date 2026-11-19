<script setup lang="ts">
// 九九封面：桌上一張 9、右邊是總數 90；停在這張卡片上時循環播放：一張 K 從右上飛進來壓在 9 上面，總數跳成 99 → 收回
import Card from '@/ui/art/Card.vue'
defineProps<{ active?: boolean }>()
</script>

<template>
  <svg viewBox="0 0 200 130" class="cover" :class="{ active }" aria-hidden="true">
    <g transform="translate(14 18) rotate(-6 37 52)"><Card rank="9" :suit="1" /></g>
    <g class="fly"><g transform="translate(30 14) rotate(5 37 52)"><Card rank="K" :suit="3" /></g></g>
    <g class="num t-slab">
      <text class="n90" x="150" y="78" text-anchor="middle">90</text>
      <text class="n99" x="150" y="78" text-anchor="middle">99</text>
    </g>
    <text class="lab" x="150" y="98" text-anchor="middle">TOTAL</text>
  </svg>
</template>

<style scoped>
.cover {
  width: 100%;
  height: 100%;
  overflow: visible;
}
.num text {
  font-family: 'Alfa Slab One', serif;
  font-size: 40px;
  fill: var(--color-ink);
}
.n99 {
  fill: var(--color-red) !important;
  opacity: 0;
}
.lab {
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.2em;
  fill: var(--color-ink-2);
}
.fly {
  opacity: 0;
  transform-box: view-box;
}
.n90,
.n99 {
  transform-box: fill-box;
  transform-origin: center;
}
.active .fly {
  animation: fly 3.2s var(--ease-out) infinite;
}
.active .n90 {
  animation: out90 3.2s linear infinite;
}
.active .n99 {
  animation: in99 3.2s var(--ease-back) infinite;
}
@keyframes fly {
  0%,
  8% {
    transform: translate(70px, -40px) rotate(24deg);
    opacity: 0;
  }
  28%,
  80% {
    transform: none;
    opacity: 1;
  }
  92%,
  100% {
    transform: translate(70px, -40px) rotate(24deg);
    opacity: 0;
  }
}
@keyframes out90 {
  0%,
  28% {
    opacity: 1;
  }
  32%,
  86% {
    opacity: 0;
  }
  92%,
  100% {
    opacity: 1;
  }
}
@keyframes in99 {
  0%,
  28% {
    opacity: 0;
    transform: scale(0.6);
  }
  36%,
  84% {
    opacity: 1;
    transform: none;
  }
  90%,
  100% {
    opacity: 0;
    transform: scale(0.8);
  }
}
@media (prefers-reduced-motion: reduce) {
  .active .fly,
  .active .n90,
  .active .n99 {
    animation: none;
  }
}
</style>
