<script setup lang="ts">
// 一排可以點選的手牌。出掉的牌往上飛走，剩下的牌滑動補位。
import { playSound } from '@/core/audio'
import type { Card } from '@/engine/bigtwo/cards'
import PlayingCard from './PlayingCard.vue'

const props = defineProps<{ cards: readonly Card[]; selected: readonly Card[]; disabled?: boolean; dealKey?: number }>()
const emit = defineEmits<{ 'update:selected': [cards: Card[]] }>()

function toggle(card: Card) {
  if (props.disabled) return
  playSound('tap')
  emit('update:selected', props.selected.includes(card) ? props.selected.filter((c) => c !== card) : [...props.selected, card])
}
</script>

<template>
  <TransitionGroup :key="dealKey" tag="div" name="hand" class="hand" :class="{ disabled }">
    <button
      v-for="(card, i) in cards"
      :key="card"
      class="slot"
      :class="{ up: selected.includes(card) }"
      :style="{ '--i': i }"
      :aria-pressed="selected.includes(card)"
      @click="toggle(card)"
    >
      <PlayingCard :card="card" />
    </button>
  </TransitionGroup>
</template>

<style scoped>
.hand {
  --cw: 3.9rem;
  display: flex;
  justify-content: center;
  padding-top: 1rem;
}
.slot {
  border: 0;
  background: none;
  padding: 0;
  margin-left: calc(var(--cw) * -0.4);
  /* 發牌：一張張從下方滑進來 */
  animation: deal 320ms var(--ease-out) both;
  animation-delay: calc(var(--i) * 26ms);
}
.slot:first-child {
  margin-left: 0;
}
.slot :deep(.card) {
  transition: transform 150ms var(--ease-out);
}
.slot.up :deep(.card) {
  transform: translateY(-0.95rem);
}
.hand.disabled .slot {
  cursor: default;
}
@keyframes deal {
  from {
    opacity: 0;
    transform: translateY(2.2rem) rotate(4deg);
  }
}
.hand-move {
  transition: transform 240ms var(--ease-out);
}
.hand-leave-active {
  position: absolute;
  transition:
    transform 180ms var(--ease-out),
    opacity 160ms ease;
}
.hand-leave-to {
  opacity: 0;
  transform: translateY(-3rem);
}
</style>
