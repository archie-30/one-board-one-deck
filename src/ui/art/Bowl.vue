<script setup lang="ts">
// 棋罐（從上往下看）：一個圓，裡面幾顆棋子
import Stone from './Stone.vue'
defineProps<{ black?: boolean }>()
const stones = [
  [24, 26],
  [38, 24],
  [31, 36],
  [21, 39],
  [42, 37],
]
</script>

<template>
  <svg viewBox="0 0 64 64" class="bowl" aria-hidden="true">
    <circle cx="34" cy="35" r="27" fill="var(--color-ink)" />
    <circle cx="31" cy="31" r="27" fill="var(--color-paper-2)" stroke="var(--color-ink)" stroke-width="2.4" />
    <circle cx="31" cy="31" r="20" fill="none" stroke="var(--color-ink)" stroke-width="1.2" stroke-dasharray="3 2.4" />
    <Stone v-for="(s, i) in stones" :key="i" :cx="s[0]" :cy="s[1]" :r="6.4" :black="black" :shadow="false" />
  </svg>
</template>

<style scoped>
.bowl {
  display: block;
  overflow: visible;
}
</style>
