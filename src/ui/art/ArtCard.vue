<script setup lang="ts">
// SVG 裡的一張牌（70×100）：紙白底、右下角有鉛筆暗面、粗細不一的墨線外框
import { computed } from 'vue'
import { TONE, rectPts, type Prim, type Pt } from './ink'
import Sketch from './Sketch.vue'
import { SUIT_PATHS, isRedSuit } from './suits'

const props = withDefaults(defineProps<{ rank?: string; suit?: number; back?: boolean; seed?: number; shadow?: boolean; still?: boolean }>(), {
  rank: 'A',
  suit: 3,
  seed: 1,
})
const box = rectPts(0, 0, 70, 100)
const shadowPts: Pt[] = [
  [7, 100],
  [70, 100],
  [70, 8],
  [77, 8],
  [77, 108],
  [7, 108],
]
const under = computed<Prim[]>(() => {
  const out: Prim[] = []
  if (props.shadow) out.push({ k: 'hatch', pts: shadowPts, tone: TONE.near, spacing: 3.4, width: 1, angle: -0.9, opacity: 0.75 })
  if (props.back) {
    out.push({ k: 'fill', pts: box, tone: TONE.indigoL })
    out.push({ k: 'hatch', pts: rectPts(7, 7, 56, 86), tone: TONE.indigoM, spacing: 5, width: 1.1, cross: true })
    out.push({ k: 'hatch', pts: [[70, 30], [70, 100], [20, 100]], tone: TONE.indigoD, spacing: 3.6, width: 0.9, angle: -0.9, opacity: 0.55 })
    out.push({ k: 'poly', pts: rectPts(7, 7, 56, 86), w: 1.3, tone: TONE.indigoD, over: 0.5 })
  } else {
    out.push({ k: 'fill', pts: box, tone: TONE.white })
    out.push({ k: 'hatch', pts: [[70, 62], [70, 100], [34, 100]], tone: TONE.far, spacing: 3.2, width: 0.9, angle: -0.9 })
  }
  return out
})
const outline = computed<Prim[]>(() => [{ k: 'poly', pts: box, w: 2.3, tone: TONE.ink }])
const color = computed(() => (isRedSuit(props.suit) ? 'var(--color-red)' : 'var(--color-ink)'))
</script>

<template>
  <g>
    <Sketch :prims="under" :seed="seed * 7" still />
    <template v-if="!back">
      <text :x="rank === '10' ? 4 : 8" y="28" font-size="27" class="font-display" :fill="color" :textLength="rank === '10' ? 27 : undefined" lengthAdjust="spacingAndGlyphs">{{ rank }}</text>
      <path :d="SUIT_PATHS[suit]" :fill="color" transform="translate(8 33) scale(.64)" />
      <path :d="SUIT_PATHS[suit]" :fill="color" transform="translate(28 52) scale(1.45)" />
    </template>
    <Sketch :prims="outline" :seed="seed * 7 + 3" :still="still" />
  </g>
</template>
