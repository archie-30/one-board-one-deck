<script setup lang="ts">
// 棋罐（從上往下看）：一個淺色圓碗，裡面幾顆棋子
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
    <circle cx="32" cy="34" r="27" fill="rgb(23 23 26 / .1)" />
    <circle cx="32" cy="32" r="27" fill="#d9b678" />
    <circle cx="32" cy="32" r="21" fill="#c79f5f" />
    <Stone v-for="(s, i) in stones" :key="i" :cx="s[0]" :cy="s[1]" :r="6.4" :black="black" />
  </svg>
</template>

<style scoped>
.bowl {
  display: block;
  overflow: visible;
}
</style>
