<script setup lang="ts">
// 大老二封面：一手五張牌。停在這張卡片上時循環播放：扇形打開 → 一張張輪流抽高（像在挑牌）→ 收回
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
    <g v-for="(c, i) in fan" :key="i" class="c" :style="{ '--a': `${(i - 2) * 10}deg`, '--i': i }">
      <g class="lift"><Card :rank="c.rank" :suit="c.suit" transform="translate(65 20)" /></g>
    </g>
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
}
.lift {
  transform-box: view-box;
}
.active .c {
  animation: fan 3.2s var(--ease-in-out) infinite;
}
.active .lift {
  animation: lift 3.2s var(--ease-out) infinite;
  animation-delay: calc(var(--i) * 0.16s);
}
@keyframes fan {
  0%,
  100% {
    transform: rotate(var(--a));
  }
  18%,
  78% {
    transform: rotate(calc(var(--a) * 1.7));
  }
}
@keyframes lift {
  0%,
  22%,
  42%,
  100% {
    transform: translateY(0);
  }
  30% {
    transform: translateY(-12px);
  }
}
</style>
