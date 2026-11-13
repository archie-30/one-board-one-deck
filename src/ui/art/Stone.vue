<script setup lang="ts">
// 一顆棋子：平面圓形＋柔和陰影
withDefaults(defineProps<{ cx: number; cy: number; r: number; black?: boolean; shadow?: boolean }>(), { shadow: true })
</script>

<template>
  <g>
    <circle v-if="shadow" :cx="cx" :cy="cy + r * 0.14" :r="r" fill="rgb(23 23 26 / .22)" />
    <circle :cx="cx" :cy="cy" :r="r" :fill="black ? '#1d1d21' : '#fbfbfa'" :stroke="black ? 'none' : 'rgb(23 23 26 / .18)'" :stroke-width="r * 0.08" />
    <circle :cx="cx - r * 0.3" :cy="cy - r * 0.32" :r="r * 0.22" :fill="black ? 'rgb(255 255 255 / .18)' : 'rgb(255 255 255 / .9)'" />
  </g>
</template>
