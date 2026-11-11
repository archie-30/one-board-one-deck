<script setup lang="ts">
// 棋罐（從上往下看），裡面裝著黑棋或白棋
import ArtStone from './ArtStone.vue'
import { roughCircle } from './sketch'

defineProps<{ black?: boolean }>()
const outer = roughCircle(32, 32, 27, 4, 0.03)
const inner = roughCircle(32, 32, 20.5, 8, 0.03, 1)
const stones = [
  [26, 27],
  [38, 26],
  [32, 36],
  [22, 37],
  [42, 37],
  [32, 24],
  [33, 31],
]
</script>

<template>
  <svg viewBox="0 0 64 64" class="bowl" aria-hidden="true">
    <circle cx="35.500" cy="36" r="27" fill="url(#hatch-x)" />
    <circle cx="32" cy="32" r="27" fill="var(--color-wood-deep)" />
    <circle cx="32" cy="32" r="20.500" fill="var(--color-ink)" opacity=".8" />
    <ArtStone v-for="(s, i) in stones" :key="i" :cx="s[0]" :cy="s[1]" :r="6.200" :black="black" :seed="i + 3" />
    <path :d="inner" fill="none" stroke="var(--color-ink)" stroke-width="1.500" />
    <path :d="outer" fill="none" stroke="var(--color-ink)" stroke-width="2" stroke-linecap="round" />
  </svg>
</template>

<style scoped>
.bowl {
  display: block;
  overflow: visible;
}
</style>
