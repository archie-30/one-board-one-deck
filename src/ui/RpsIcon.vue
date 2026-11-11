<script setup lang="ts">
// 石頭、剪刀、布：畫成真的石頭、剪刀與一張紙
import type { RpsHand } from '@/engine/common/rps'
defineProps<{ hand: RpsHand }>()
</script>

<template>
  <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <template v-if="hand === 'rock'">
      <path d="M9 30.500c-2.500-6 .5-13.500 6.500-17 5-3 12.500-3.500 17.500.5 5.500 4.300 8 12 5 18-2.600 5.200-9 7.500-15.500 7.500S11.200 36 9 30.500z" fill="var(--color-paper-deep)" />
      <path d="M17 21.500c2-2.500 4.500-3.800 7.500-4M29 31.500c2.200-.6 3.800-2 4.800-4" stroke-width="1.800" />
    </template>
    <template v-else-if="hand === 'paper'">
      <path d="M12.500 6.500 30 6l7 7.500.5 28-25.500.5z" fill="var(--color-card)" />
      <path d="M30 6.300 30.300 13.500l6.500.2M17.500 20.500h13M17.300 26.500h14M17.600 32.500h9" stroke-width="1.800" />
    </template>
    <template v-else>
      <path d="M15.500 8 27 28M32.500 8 21 28" />
      <circle cx="17.500" cy="34.500" r="5.500" fill="var(--color-red-soft)" />
      <circle cx="30.500" cy="34.500" r="5.500" fill="var(--color-red-soft)" />
    </template>
  </svg>
</template>
