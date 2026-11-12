<script setup lang="ts">
// 棋罐（從上往下看）
import { TONE, circlePts, type Prim } from './ink'
import ArtStone from './ArtStone.vue'
import Sketch from './Sketch.vue'

defineProps<{ black?: boolean }>()
const base: Prim[] = [
  { k: 'hatch', pts: circlePts(37, 37, 27, 0, Math.PI * 2, 18), tone: TONE.near, spacing: 3, width: 1, angle: -0.9, cross: true, opacity: 0.7 },
  { k: 'disc', c: [32, 32], r: 27, tone: TONE.kraftL },
  { k: 'hatch', pts: [...circlePts(32, 32, 27, -0.5, 2.1, 12), ...circlePts(32, 32, 20, 2.1, -0.5, 12)], tone: TONE.kraftM, spacing: 2.6, width: 1, angle: -0.9 },
  { k: 'disc', c: [32, 32], r: 20, tone: TONE.near },
  { k: 'hatch', pts: circlePts(32, 32, 20, 0, Math.PI * 2, 16), tone: TONE.ink, spacing: 3, width: 0.9, angle: 0.6, opacity: 0.6 },
]
const rim: Prim[] = [
  { k: 'ring', c: [32, 32], r: 20, w: 1.6, tone: TONE.ink },
  { k: 'ring', c: [32, 32], r: 27, w: 2.4, tone: TONE.ink },
]
const stones = [
  [26, 27],
  [38, 26],
  [22, 37],
  [42, 37],
  [32, 25],
  [32, 36],
]
</script>

<template>
  <svg viewBox="0 0 64 64" class="bowl" aria-hidden="true">
    <Sketch :prims="base" :seed="5" still />
    <ArtStone v-for="(s, i) in stones" :key="i" :cx="s[0]" :cy="s[1]" :r="6.4" :black="black" :seed="i + 3" :shadow="false" />
    <Sketch :prims="rim" :seed="9" />
  </svg>
</template>

<style scoped>
.bowl {
  display: block;
  overflow: visible;
}
</style>
