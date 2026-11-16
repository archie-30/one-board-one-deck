<script setup lang="ts">
// 排七封面：桌上一排紅心 7、6，停在這張卡片上時循環播放：紅心 8 從右邊飛進來接在 7 旁邊 → 收回
import Card from '@/ui/art/Card.vue'
defineProps<{ active?: boolean }>()
</script>

<template>
  <svg viewBox="0 0 200 130" class="cover" :class="{ active }" aria-hidden="true">
    <g transform="translate(18 16)"><Card rank="6" :suit="2" /></g>
    <g transform="translate(62 12)"><Card rank="7" :suit="2" /></g>
    <g class="fly"><Card rank="8" :suit="2" transform="translate(106 16)" /></g>
  </svg>
</template>

<style scoped>
.cover {
  width: 100%;
  height: 100%;
  overflow: visible;
}
.fly {
  transform-box: view-box;
}
.active .fly {
  animation: fly 3s var(--ease-out) infinite;
}
@keyframes fly {
  0%,
  8% {
    transform: translate(60px, -30px) rotate(18deg);
    opacity: 0;
  }
  30%,
  80% {
    transform: none;
    opacity: 1;
  }
  92%,
  100% {
    transform: translate(60px, -30px) rotate(18deg);
    opacity: 0;
  }
}
</style>
