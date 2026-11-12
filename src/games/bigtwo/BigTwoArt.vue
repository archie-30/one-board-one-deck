<script setup lang="ts">
// 大老二的代表圖：一手攤開的牌，最上面是黑桃 2
import ArtCard from '@/ui/art/ArtCard.vue'

defineProps<{ animate?: boolean }>()

const cards = [
  { rank: '3', suit: 0, a: -30 },
  { rank: '7', suit: 1, a: -15 },
  { rank: 'J', suit: 3, a: 0 },
  { rank: 'A', suit: 2, a: 15 },
  { rank: '2', suit: 3, a: 30 },
]
</script>

<template>
  <svg viewBox="0 0 260 180" class="bigtwo-art" :class="{ animate }" aria-hidden="true">
    <g v-for="(c, i) in cards" :key="i" class="fan" :style="{ '--a': `${c.a}deg`, '--i': i }">
      <ArtCard :rank="c.rank" :suit="c.suit" :seed="i * 13 + 3" shadow transform="translate(95 58)" />
    </g>
  </svg>
</template>

<style scoped>
.bigtwo-art {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.fan {
  transform-origin: 130px 215px;
  transform: rotate(calc(var(--a) * var(--spread, 1)));
  transition: transform 260ms var(--ease-out);
}
@keyframes fan-open {
  from {
    transform: rotate(0deg) translateY(30px);
    opacity: 0;
  }
}
.animate .fan {
  animation: fan-open 420ms var(--ease-out) both;
  animation-delay: calc(140ms + var(--i) * 45ms);
}
</style>
