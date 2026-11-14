<script setup lang="ts">
// 接龍封面：左邊一串紅黑交錯往下接的牌，右邊收牌區一張 A；選起時紅 10 從牌堆飛過來接上去
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
    <g class="fly"><g transform="scale(.85)"><Card rank="10" :suit="1" /></g></g>
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
  transition: transform 620ms var(--ease-back);
}
.active .fly {
  transform: translate(18px, 52px) rotate(0deg);
}
</style>
