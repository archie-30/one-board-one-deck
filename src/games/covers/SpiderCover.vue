<script setup lang="ts">
// 蜘蛛接龍封面：左邊一串黑桃從 K 往下排，右邊是一疊疊的牌堆。
// 停在這張卡片上時循環播放：牌堆飛出黑桃 9 接到 10 下面 → 整串收攏、往右下收走 → 淡回來
import Card from '@/ui/art/Card.vue'
defineProps<{ active?: boolean }>()
const run = ['K', 'Q', 'J', '10']
</script>

<template>
  <svg viewBox="0 0 200 130" class="cover" :class="{ active }" aria-hidden="true">
    <g v-for="k in 3" :key="`b${k}`" :transform="`translate(${150 - k * 7} ${34 + k * 3}) scale(.72) rotate(${k * 2 - 4})`"><Card back /></g>
    <g class="run">
      <g v-for="(r, i) in run" :key="r" class="rc" :style="{ '--i': i }"><g :transform="`translate(20 ${-10 + i * 16}) scale(.8)`"><Card :rank="r" :suit="3" /></g></g>
      <g class="fly"><g transform="scale(.8)"><Card rank="9" :suit="3" /></g></g>
    </g>
  </svg>
</template>

<style scoped>
.cover {
  width: 100%;
  height: 100%;
  overflow: visible;
}
.run,
.fly,
.rc {
  transform-box: view-box;
}
.fly {
  transform: translate(140px, 38px) rotate(6deg);
  opacity: 0;
}
.active .fly {
  animation: fly 3.4s var(--ease-in-out) infinite;
}
.active .run {
  animation: away 3.4s var(--ease-in-out) infinite;
}
.active .rc {
  animation: gather 3.4s var(--ease-in-out) infinite;
}
@keyframes fly {
  0%,
  6% {
    transform: translate(140px, 38px) rotate(6deg);
    opacity: 1;
  }
  32%,
  100% {
    transform: translate(20px, 54px) rotate(0deg);
    opacity: 1;
  }
}
/* 整串往上收攏成一疊 */
@keyframes gather {
  0%,
  40% {
    transform: none;
  }
  56%,
  100% {
    transform: translateY(calc(var(--i) * -16px));
  }
}
@keyframes away {
  0%,
  40% {
    transform: none;
    opacity: 1;
  }
  56% {
    transform: none;
    opacity: 1;
  }
  76% {
    transform: translate(60px, 40px) scale(0.7);
    opacity: 0;
  }
  88% {
    transform: none;
    opacity: 0;
  }
  100% {
    transform: none;
    opacity: 1;
  }
}
</style>
