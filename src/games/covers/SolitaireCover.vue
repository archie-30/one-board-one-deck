<script setup lang="ts">
// 接龍封面：左邊一串紅黑交錯的牌，右上收牌區一張 A，右邊牌堆。
// 停在這張卡片上時循環播放：牌堆翻出紅 10 → 飛過去接在黑 J 下面 → 淡掉，回到牌堆
import Card from '@/ui/art/Card.vue'
defineProps<{ active?: boolean }>()
const column = [
  { rank: 'K', suit: 3 },
  { rank: 'Q', suit: 2 },
  { rank: 'J', suit: 0 },
]
</script>

<template>
  <svg viewBox="0 0 200 130" class="cover" :class="{ active }" aria-hidden="true">
    <g v-for="(c, i) in column" :key="i" :transform="`translate(18 ${-8 + i * 20}) scale(.85)`"><Card :rank="c.rank" :suit="c.suit" /></g>
    <g transform="translate(112 -6) scale(.85) rotate(-3)"><Card rank="A" :suit="1" /></g>
    <g transform="translate(140 30) scale(.85) rotate(5)"><Card back /></g>
    <g class="fly"><g class="face" transform="scale(.85)"><Card rank="10" :suit="1" /></g></g>
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
  transform: translate(146px, 34px) rotate(8deg);
}
.active .fly {
  animation: fly 3s var(--ease-in-out) infinite;
}
@keyframes fly {
  0% {
    transform: translate(146px, 34px) rotate(8deg) scaleX(0.05);
    opacity: 1;
  }
  12% {
    transform: translate(146px, 34px) rotate(8deg) scaleX(1);
  }
  22% {
    transform: translate(146px, 34px) rotate(8deg);
  }
  44%,
  72% {
    transform: translate(18px, 52px) rotate(0deg);
    opacity: 1;
  }
  86% {
    transform: translate(18px, 52px) rotate(0deg);
    opacity: 0;
  }
  87%,
  99% {
    transform: translate(146px, 34px) rotate(8deg) scaleX(0.05);
    opacity: 0;
  }
  100% {
    transform: translate(146px, 34px) rotate(8deg) scaleX(0.05);
    opacity: 1;
  }
}
</style>
