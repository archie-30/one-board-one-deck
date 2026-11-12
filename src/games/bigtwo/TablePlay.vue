<script setup lang="ts">
// 桌面中央目前要壓過的牌。新的牌從出牌者的方向滑進來。
import type { Card } from '@/engine/bigtwo/cards'
import PlayingCard from './PlayingCard.vue'

defineProps<{ cards: readonly Card[] | null; from?: number; caption?: string }>()
</script>

<template>
  <div class="table-play">
    <Transition name="play">
      <div v-if="cards" :key="cards.join('-')" class="spread" :class="`from-${from ?? 0}`">
        <div class="cards">
          <PlayingCard v-for="(card, i) in cards" :key="card" :card="card" :style="{ '--r': `${(i - (cards.length - 1) / 2) * 2.2}deg` }" />
        </div>
        <p v-if="caption" class="caption">{{ caption }}</p>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.table-play {
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
}
.spread {
  --cw: 3.3rem;
  grid-area: 1 / 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
}
.cards {
  display: flex;
}
.cards :deep(.card) {
  margin-left: calc(var(--cw) * -0.3);
  transform: rotate(var(--r));
}
.cards :deep(.card:first-child) {
  margin-left: 0;
}
.caption {
  font-size: 0.85rem;
  line-height: 1.3;
  color: var(--color-ink-soft);
}
.from-0 {
  --fx: 0rem;
  --fy: 4.5rem;
}
.from-1 {
  --fx: 9rem;
  --fy: 0rem;
}
.from-2 {
  --fx: 0rem;
  --fy: -4.5rem;
}
.from-3 {
  --fx: -9rem;
  --fy: 0rem;
}
.play-enter-active {
  transition:
    transform 260ms var(--ease-out),
    opacity 140ms ease;
}
.play-leave-active {
  transition:
    opacity 200ms ease,
    transform 200ms ease;
}
.play-enter-from {
  opacity: 0;
  transform: translate(var(--fx), var(--fy)) rotate(-5deg) scale(0.95);
}
.play-leave-to {
  opacity: 0;
  transform: scale(0.94);
}
</style>
