<script setup lang="ts">
// SVG 裡的一張牌（70×100）。放在別的 <svg> 裡，用 transform 擺位置。
import { computed } from 'vue'
import { polyFill, rectPts, roughPoly } from './sketch'
import { SUIT_PATHS, isRedSuit } from './suits'

const props = withDefaults(defineProps<{ rank?: string; suit?: number; back?: boolean; seed?: number; shadow?: boolean }>(), {
  rank: 'A',
  suit: 3,
  seed: 1,
})
const pts = rectPts(0, 0, 70, 100)
const outline = computed(() => roughPoly(pts, props.seed, 0.9, 1.6))
const inner = computed(() => roughPoly(rectPts(8, 8, 54, 84), props.seed + 9, 0.6, 0.5, 1))
const color = computed(() => (isRedSuit(props.suit) ? 'var(--color-red)' : 'var(--color-ink)'))
</script>

<template>
  <g>
    <path v-if="shadow" :d="polyFill(rectPts(6, 7, 70, 100))" fill="url(#hatch)" />
    <template v-if="back">
      <path :d="polyFill(pts)" fill="var(--color-deck)" />
      <path :d="polyFill(rectPts(8, 8, 54, 84))" fill="url(#hatch-w)" />
      <path :d="inner" fill="none" stroke="var(--color-card)" stroke-width="1.4" stroke-linecap="round" opacity=".8" />
    </template>
    <template v-else>
      <path :d="polyFill(pts)" fill="var(--color-card)" />
      <text :x="rank === '10' ? 3 : 8" y="27" font-size="25" class="font-display" :fill="color" :stroke="color" stroke-width=".7" :textLength="rank === '10' ? 24 : undefined" lengthAdjust="spacingAndGlyphs">{{ rank }}</text>
      <path :d="SUIT_PATHS[suit]" :fill="color" transform="translate(8 32) scale(.62)" />
      <path :d="SUIT_PATHS[suit]" :fill="color" transform="translate(27 51) scale(1.5)" />
    </template>
    <path :d="outline" fill="none" stroke="var(--color-ink)" stroke-width="1.5" stroke-linecap="round" />
  </g>
</template>
