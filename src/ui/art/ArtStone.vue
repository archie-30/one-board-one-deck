<script setup lang="ts">
// SVG 裡的一顆棋子，帶一點鉛筆陰影
import { computed } from 'vue'
import { roughCircle } from './sketch'

const props = withDefaults(defineProps<{ cx: number; cy: number; r: number; black?: boolean; seed?: number }>(), { seed: 1 })
const outline = computed(() => roughCircle(props.cx, props.cy, props.r, props.seed, 0.035))
const k = computed(() => props.r / 10)
</script>

<template>
  <g>
    <circle :cx="cx + r * 0.16" :cy="cy + r * 0.2" :r="r" fill="url(#hatch)" />
    <circle :cx="cx" :cy="cy" :r="r" :fill="black ? 'var(--color-ink)' : 'var(--color-card)'" />
    <path
      v-if="black"
      :d="`M${cx - 5.5 * k} ${cy - 2.5 * k}q${1.8 * k} ${-3.6 * k} ${5.6 * k} ${-4.2 * k}`"
      fill="none"
      stroke="var(--color-paper)"
      :stroke-width="1.5 * k"
      stroke-linecap="round"
      opacity=".6"
    />
    <path
      v-else
      :d="`M${cx + 1 * k} ${cy + 6.6 * k}q${4.6 * k} ${-1 * k} ${5.8 * k} ${-6 * k}M${cx + 3.4 * k} ${cy + 4.4 * k}q${2 * k} ${-1 * k} ${2.6 * k} ${-3.4 * k}`"
      fill="none"
      stroke="var(--color-ink)"
      :stroke-width="0.9 * k"
      stroke-linecap="round"
      opacity=".4"
    />
    <path :d="outline" fill="none" stroke="var(--color-ink)" :stroke-width="Math.max(1, 1.3 * k)" stroke-linecap="round" />
  </g>
</template>
