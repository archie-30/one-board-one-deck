<script setup lang="ts">
// 電腦對手：三種長相的小機器人。mood 用在選擇電腦強度。
import { computed } from 'vue'
import { polyFill, rectPts, roughPoly } from './sketch'

const props = withDefaults(defineProps<{ variant?: number; mood?: 'easy' | 'normal' }>(), { variant: 0 })

const TONES = ['var(--color-deck-soft)', 'var(--color-leaf-soft)', 'var(--color-sun)', 'var(--color-wood-soft)']
const ACCENTS = ['var(--color-deck)', 'var(--color-leaf)', 'var(--color-red)', 'var(--color-wood-deep)']
const head = rectPts(11, 17, 42, 34)
const outline = computed(() => roughPoly(head, props.variant * 17 + 5, 1, 2))
const tone = computed(() => TONES[props.variant % 4])
const accent = computed(() => ACCENTS[props.variant % 4])
const look = computed(() => props.mood ?? ['dots', 'visor', 'square'][props.variant % 3])
</script>

<template>
  <svg viewBox="0 0 64 64" class="robot" fill="none" stroke="var(--color-ink)" stroke-width="2.200" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path :d="polyFill(rectPts(16, 22, 42, 34))" fill="url(#hatch)" stroke="none" />
    <path d="M32 17V8.500" />
    <circle cx="32" cy="6.500" r="3.600" :fill="accent" />
    <path d="M6.500 29h4.500v11H6.500ZM53 29h4.500v11H53Z" :fill="accent" />
    <path :d="polyFill(head)" :fill="tone" stroke="none" />
    <path :d="polyFill(rectPts(44, 18, 9, 32))" fill="url(#hatch-soft)" stroke="none" />
    <path :d="outline" />
    <template v-if="look === 'easy'">
      <path d="M18.500 32q4.500-5.500 9 0M36.500 32q4.500-5.500 9 0" stroke-width="2.600" />
      <path d="M25 41q7 5 14 0" />
    </template>
    <template v-else-if="look === 'normal'">
      <circle cx="23.500" cy="32.500" r="3.200" fill="var(--color-ink)" stroke="none" />
      <circle cx="40.500" cy="32.500" r="3.200" fill="var(--color-ink)" stroke="none" />
      <path d="M17.500 24.500l10 3M46.500 24.500l-10 3" stroke-width="2.800" />
      <path d="M25 43h14" />
    </template>
    <template v-else-if="look === 'dots'">
      <circle cx="23.500" cy="31" r="3.400" fill="var(--color-ink)" stroke="none" />
      <circle cx="40.500" cy="31" r="3.400" fill="var(--color-ink)" stroke="none" />
      <path d="M25 41q7 4.500 14 0" />
    </template>
    <template v-else-if="look === 'visor'">
      <path d="M16.500 26.500h31v9h-31Z" fill="var(--color-ink)" />
      <path d="M22 31h5M37 31h5" stroke="var(--color-card)" stroke-width="2.600" />
      <path d="M26 43.500h12" />
    </template>
    <template v-else>
      <path d="M19 27h8v8h-8ZM37 27h8v8h-8Z" fill="var(--color-card)" />
      <circle cx="23" cy="31" r="1.800" fill="var(--color-ink)" stroke="none" />
      <circle cx="41" cy="31" r="1.800" fill="var(--color-ink)" stroke="none" />
      <path d="M24 41h16v5H24ZM29.300 41v5M34.700 41v5" stroke-width="1.600" />
    </template>
  </svg>
</template>

<style scoped>
.robot {
  display: block;
  overflow: visible;
}
</style>
