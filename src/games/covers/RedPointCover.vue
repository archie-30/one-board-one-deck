<script setup lang="ts">
// 撿紅點封面：桌上三張牌。停在這張卡片上時循環播放：手上的 7 滑過去壓住紅心 3（湊成十）→ 兩張一起被收走 → 重新來
import Card from '@/ui/art/Card.vue'
defineProps<{ active?: boolean }>()
</script>

<template>
  <svg viewBox="0 0 200 130" class="cover" :class="{ active }" aria-hidden="true">
    <g transform="translate(18 26) rotate(-8)"><Card rank="K" :suit="3" /></g>
    <g transform="translate(112 22) rotate(7)"><Card rank="9" :suit="1" /></g>
    <g class="three"><Card rank="3" :suit="2" /></g>
    <g class="hand"><Card rank="7" :suit="0" /></g>
  </svg>
</template>

<style scoped>
.cover {
  width: 100%;
  height: 100%;
  overflow: visible;
}
.three {
  transform-box: view-box;
  transform: translate(64px, 14px) rotate(-2deg);
}
.hand {
  transform-box: view-box;
  transform: translate(104px, 56px) rotate(14deg);
}
.active .three {
  animation: three 3.4s var(--ease-in-out) infinite;
}
.active .hand {
  animation: hand 3.4s var(--ease-in-out) infinite;
}
/* 7：滑過去壓在 3 上 → 兩張一起往下收走、淡掉 → 從手上重新出現 */
@keyframes hand {
  0%,
  8% {
    transform: translate(104px, 56px) rotate(14deg);
    opacity: 1;
  }
  28%,
  50% {
    transform: translate(70px, 20px) rotate(4deg);
    opacity: 1;
  }
  70% {
    transform: translate(150px, 120px) rotate(24deg) scale(0.7);
    opacity: 0;
  }
  86% {
    transform: translate(104px, 76px) rotate(14deg);
    opacity: 0;
  }
  100% {
    transform: translate(104px, 56px) rotate(14deg);
    opacity: 1;
  }
}
@keyframes three {
  0%,
  50% {
    transform: translate(64px, 14px) rotate(-2deg);
    opacity: 1;
  }
  70% {
    transform: translate(146px, 116px) rotate(18deg) scale(0.7);
    opacity: 0;
  }
  86% {
    transform: translate(64px, 14px) rotate(-2deg) scale(0.9);
    opacity: 0;
  }
  100% {
    transform: translate(64px, 14px) rotate(-2deg);
    opacity: 1;
  }
}
</style>
