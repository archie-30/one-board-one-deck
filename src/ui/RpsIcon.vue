<script setup lang="ts">
// 石頭、剪刀、布：畫成真的石頭、剪刀與一張紙
import type { RpsHand } from '@/engine/common/rps'
import Doodle from './art/Doodle.vue'
defineProps<{ hand: RpsHand }>()
</script>

<template>
  <Doodle :name="hand" />
</template>
