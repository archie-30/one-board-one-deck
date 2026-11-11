<script setup lang="ts">
// 手繪外框：四條略不規則、稍微畫出頭的線。會隨容器大小伸縮，線寬不變。
import { computed } from 'vue'

const props = withDefaults(defineProps<{ fill?: string; variant?: number; weight?: number; dashed?: boolean }>(), {
  variant: 0,
  weight: 2,
})

const VARIANTS = [
  ['M -0.8 3 Q 40 -1.5 100.7 2', 'M 99.5 -5 Q 100.1 50 99.3 105', 'M 100.9 97.5 Q 55 101.5 -0.9 98', 'M 0.6 106 Q -0.1 45 0.5 -6'],
  ['M -1 1.5 Q 60 3.5 100.8 1', 'M 99.3 -6 Q 99.9 40 99.6 104', 'M 100.7 98.6 Q 40 97 -0.7 99.5', 'M 0.4 104 Q 0.8 60 0.3 -5'],
  ['M -0.6 2.6 Q 30 0 100.6 3', 'M 99.6 -4 Q 99.2 55 99.8 106', 'M 101 99 Q 70 102 -1 97.4', 'M 0.7 105 Q 0.1 30 0.4 -4'],
]
const lines = computed(() => VARIANTS[props.variant % VARIANTS.length])
</script>

<template>
  <svg class="sketch" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    <path v-if="fill" d="M 0.5 2 L 99.5 1.8 L 99.5 98.4 L 0.5 98 Z" :fill="fill" />
    <path
      v-for="d in lines"
      :key="d"
      :d="d"
      fill="none"
      stroke="currentColor"
      :stroke-width="weight"
      :stroke-dasharray="dashed ? '7 6' : undefined"
      stroke-linecap="round"
      vector-effect="non-scaling-stroke"
    />
  </svg>
</template>

<style scoped>
.sketch {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
}
</style>
