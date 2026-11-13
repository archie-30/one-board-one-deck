<script setup lang="ts">
// 一顆棋子：平面圓形＋黑框＋右下實心陰影
withDefaults(defineProps<{ cx: number; cy: number; r: number; black?: boolean; shadow?: boolean }>(), { shadow: true })
</script>

<template>
  <g>
    <circle v-if="shadow" :cx="cx + r * 0.16" :cy="cy + r * 0.2" :r="r" fill="var(--color-ink)" />
    <circle :cx="cx" :cy="cy" :r="r" :fill="black ? 'var(--color-ink)' : 'var(--color-card)'" stroke="var(--color-ink)" :stroke-width="r * 0.2" />
    <circle v-if="black" :cx="cx - r * 0.32" :cy="cy - r * 0.32" :r="r * 0.18" fill="rgb(251 248 241 / .45)" />
  </g>
</template>
