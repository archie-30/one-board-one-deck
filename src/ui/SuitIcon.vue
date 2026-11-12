<script setup lang="ts">
// 自己畫的花色符號：只有紅、黑兩色，靠形狀分辨
import { SUIT_PATHS } from './art/suits'
defineProps<{ suit: number }>()
</script>

<template>
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path :d="SUIT_PATHS[suit]" /></svg>
</template>
