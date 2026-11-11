<script setup lang="ts">
// 一張牌：只有紅、黑兩色。點數與花色放左上角，疊起來時也看得清楚。
import { computed } from 'vue'
import { RANK_LABELS, isRed, rankOf, suitOf, type Card } from '@/engine/bigtwo/cards'
import SuitIcon from '@/ui/SuitIcon.vue'

const props = defineProps<{ card: Card }>()
const rank = computed(() => RANK_LABELS[rankOf(props.card)])
const suit = computed(() => suitOf(props.card))
</script>

<template>
  <div class="card" :class="{ red: isRed(card), wide: rank === '10' }">
    <span class="rank font-display">{{ rank }}</span>
    <SuitIcon :suit="suit" class="pip" />
    <SuitIcon :suit="suit" class="big" />
  </div>
</template>

<style scoped>
.card {
  --w: var(--cw, 3.9rem);
  position: relative;
  width: var(--w);
  height: calc(var(--w) * 1.42);
  flex-shrink: 0;
  border: calc(var(--w) * 0.036) solid var(--color-ink);
  border-radius: calc(var(--w) * 0.13) calc(var(--w) * 0.09) calc(var(--w) * 0.14) calc(var(--w) * 0.08);
  background: var(--color-card);
  color: var(--color-ink);
}
.card::before {
  content: '';
  position: absolute;
  inset: calc(var(--w) * -0.035) calc(var(--w) * -0.02) calc(var(--w) * -0.015) calc(var(--w) * -0.04);
  border: calc(var(--w) * 0.016) solid var(--color-ink);
  border-radius: calc(var(--w) * 0.1) calc(var(--w) * 0.14) calc(var(--w) * 0.09) calc(var(--w) * 0.13);
  opacity: 0.45;
  transform: rotate(0.7deg);
  pointer-events: none;
}
.card::after {
  content: '';
  position: absolute;
  left: 6%;
  right: 4%;
  bottom: 3%;
  height: 9%;
  background-image: repeating-linear-gradient(-52deg, var(--color-ink) 0 calc(var(--w) * 0.012), transparent calc(var(--w) * 0.012) calc(var(--w) * 0.06));
  opacity: 0.22;
  pointer-events: none;
}
.card.red {
  color: var(--color-red);
}
.rank {
  position: absolute;
  left: calc(var(--w) * 0.07);
  top: calc(var(--w) * 0.02);
  width: calc(var(--w) * 0.46);
  text-align: center;
  font-size: calc(var(--w) * 0.44);
  line-height: 1.12;
  -webkit-text-stroke: calc(var(--w) * 0.014) currentColor;
}
.wide .rank {
  letter-spacing: -0.09em;
  font-size: calc(var(--w) * 0.4);
  line-height: 1.22;
}
.pip {
  position: absolute;
  left: calc(var(--w) * 0.14);
  top: calc(var(--w) * 0.52);
  width: calc(var(--w) * 0.3);
}
.big {
  position: absolute;
  right: calc(var(--w) * 0.09);
  bottom: calc(var(--w) * 0.1);
  width: calc(var(--w) * 0.5);
  opacity: 0.9;
}
</style>
