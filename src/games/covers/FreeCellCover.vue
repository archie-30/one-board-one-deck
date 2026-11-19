<script setup lang="ts">
// 新接龍封面：左上兩個虛線暫存格，下面兩疊翻開的牌。
// 停在這張卡片上時循環播放：紅心 K 飛進暫存格 → 露出來的紅心 8 接到黑桃 9 下面 → 淡回原樣
import Card from '@/ui/art/Card.vue'
defineProps<{ active?: boolean }>()
</script>

<template>
  <svg viewBox="0 0 200 130" class="cover" :class="{ active }" aria-hidden="true">
    <rect v-for="k in 2" :key="k" :x="8 + (k - 1) * 48" y="-6" width="44" height="61" rx="5" class="cell" />
    <g transform="translate(112 -2) scale(.72) rotate(-2)"><Card rank="10" :suit="3" /></g>
    <g transform="translate(112 14) scale(.72) rotate(1)"><Card rank="9" :suit="3" /></g>
    <g transform="translate(154 12) scale(.72) rotate(2)"><Card rank="Q" :suit="0" /></g>
    <g class="eight"><g transform="scale(.72)"><Card rank="8" :suit="2" /></g></g>
    <g class="king"><g transform="scale(.72)"><Card rank="K" :suit="2" /></g></g>
  </svg>
</template>

<style scoped>
.cover {
  width: 100%;
  height: 100%;
  overflow: visible;
}
.cell {
  fill: rgb(20 20 20 / 0.04);
  stroke: rgb(20 20 20 / 0.3);
  stroke-width: 1.6;
  stroke-dasharray: 4 3;
}
.king,
.eight {
  transform-box: view-box;
}
.king {
  transform: translate(154px, 44px) rotate(-3deg);
}
.eight {
  transform: translate(154px, 28px) rotate(2deg);
}
.active .king {
  animation: king 3.4s var(--ease-in-out) infinite;
}
.active .eight {
  animation: eight 3.4s var(--ease-in-out) infinite;
}
@keyframes king {
  0%,
  8% {
    transform: translate(154px, 44px) rotate(-3deg);
    opacity: 1;
  }
  30%,
  80% {
    transform: translate(9px, -5px) rotate(0deg);
    opacity: 1;
  }
  90% {
    transform: translate(9px, -5px) rotate(0deg);
    opacity: 0;
  }
  91%,
  99% {
    transform: translate(154px, 44px) rotate(-3deg);
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}
@keyframes eight {
  0%,
  38% {
    transform: translate(154px, 28px) rotate(2deg);
    opacity: 1;
  }
  58%,
  80% {
    transform: translate(112px, 30px) rotate(0deg);
    opacity: 1;
  }
  90% {
    transform: translate(112px, 30px) rotate(0deg);
    opacity: 0;
  }
  91%,
  99% {
    transform: translate(154px, 28px) rotate(2deg);
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}
</style>
