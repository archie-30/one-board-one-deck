<script setup lang="ts">
// 大老二封面：一手五張牌，選起時往外展開
import Card from '@/ui/art/Card.vue'
defineProps<{ active?: boolean }>()
const fan = [
  { rank: '3', suit: 0 },
  { rank: '9', suit: 2 },
  { rank: 'J', suit: 3 },
  { rank: 'A', suit: 1 },
  { rank: '2', suit: 3 },
]
</script>

<template>
  <svg viewBox="0 0 200 130" class="cover" :class="{ active }" aria-hidden="true">
    <g v-for="(c, i) in fan" :key="i" class="c" :style="{ '--a': `${(i - 2) * 10}deg`, '--i': i }"><Card :rank="c.rank" :suit="c.suit" transform="translate(65 20)" /></g>
  </svg>
</template>

<style scoped>
.cover {
  width: 100%;
  height: 100%;
  overflow: visible;
}
.c {
  transform-box: view-box;
  transform-origin: 100px 170px;
  transform: rotate(var(--a));
  transition: transform 520ms var(--ease-back);
  transition-delay: calc(var(--i) * 35ms);
}
.active .c {
  transform: rotate(calc(var(--a) * 1.7));
}
</style>
