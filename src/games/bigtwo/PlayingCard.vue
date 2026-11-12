<script setup lang="ts">
// 一張牌：只有紅、黑兩色。點數與花色放左上角，疊起來時也看得清楚。
import { computed } from 'vue'
import { RANK_LABELS, rankOf, suitOf, type Card } from '@/engine/bigtwo/cards'
import ArtCard from '@/ui/art/ArtCard.vue'

const props = defineProps<{ card: Card }>()
const rank = computed(() => RANK_LABELS[rankOf(props.card)])
const suit = computed(() => suitOf(props.card))
</script>

<template>
  <svg class="card" viewBox="-3 -3 76 106" aria-hidden="true"><ArtCard :rank="rank" :suit="suit" :seed="card + 1" still /></svg>
</template>

<style scoped>
.card {
  display: block;
  width: var(--cw, 3.9rem);
  height: calc(var(--cw, 3.9rem) * 1.395);
  flex-shrink: 0;
  overflow: visible;
}
</style>
