<script setup lang="ts">
// SVG 裡的一張牌（70×100，圓角）。正面：紙白底、粗黑體點數、只用紅黑兩色；
// 背面：紙底、紅色內框、墨色交叉排線，中間一顆棋子壓在黑桃上（一副牌＋一張棋盤）。
import { computed } from 'vue'
import { TONE, roundRectPts, type Prim } from './ink'
import Sketch from './Sketch.vue'
import { SUIT_PATHS, isRedSuit } from './suits'

const props = withDefaults(defineProps<{ rank?: string; suit?: number; back?: boolean; seed?: number; still?: boolean }>(), {
  rank: 'A',
  suit: 3,
  seed: 1,
})

const box = roundRectPts(0, 0, 70, 100, 7)
const inner = roundRectPts(6, 6, 58, 88, 4)
const facePrims = computed<Prim[]>(() => [
  { k: 'fill', pts: box, tone: TONE.white },
  { k: 'hatch', pts: [[70, 66], [70, 93], [63, 100], [36, 100]], tone: TONE.far, spacing: 3.2, width: 0.9, angle: -0.9 },
])
const backPrims = computed<Prim[]>(() => [
  { k: 'fill', pts: box, tone: TONE.white },
  { k: 'hatch', pts: inner, tone: TONE.near, spacing: 4.6, width: 0.8, cross: true, opacity: 0.55 },
  { k: 'disc', c: [35, 50], r: 13, tone: TONE.white },
  { k: 'disc', c: [38.5, 54], r: 7.5, tone: TONE.ink },
  { k: 'loop', pts: inner, w: 1.5, tone: TONE.red },
  { k: 'ring', c: [35, 50], r: 13, w: 1.4, tone: TONE.red },
])
const outline = computed<Prim[]>(() => [{ k: 'loop', pts: box, w: 2.4, tone: TONE.ink }])
const color = computed(() => (isRedSuit(props.suit) ? 'var(--color-red)' : 'var(--color-ink)'))
</script>

<template>
  <g>
    <template v-if="back">
      <Sketch :prims="backPrims" :seed="seed * 7" :still="still" />
      <path :d="SUIT_PATHS[3]" fill="var(--color-red)" transform="translate(25.5 38) scale(.62)" />
    </template>
    <template v-else>
      <Sketch :prims="facePrims" :seed="seed * 7" still />
      <text
        :x="rank === '10' ? 4.5 : 8"
        y="27"
        font-size="25"
        class="font-display"
        font-weight="900"
        :fill="color"
        :textLength="rank === '10' ? 25 : undefined"
        lengthAdjust="spacingAndGlyphs"
      >
        {{ rank }}
      </text>
      <path :d="SUIT_PATHS[suit]" :fill="color" transform="translate(8.5 32) scale(.6)" />
      <path :d="SUIT_PATHS[suit]" :fill="color" transform="translate(29 50) scale(1.45)" />
    </template>
    <Sketch :prims="outline" :seed="seed * 7 + 3" :still="still" />
  </g>
</template>
