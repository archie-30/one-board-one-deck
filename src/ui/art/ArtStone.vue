<script setup lang="ts">
// 一顆棋子：黑棋是深灰加亮面的幾筆，白棋是紙白加右下的排線暗面
import { computed } from 'vue'
import { TONE, circlePts, type Prim, type Pt } from './ink'
import Sketch from './Sketch.vue'

const props = withDefaults(defineProps<{ cx: number; cy: number; r: number; black?: boolean; seed?: number; shadow?: boolean }>(), { seed: 1, shadow: true })

const prims = computed<Prim[]>(() => {
  const { cx, cy, r } = props
  const lw = Math.max(r * 0.16, 0.5)
  const out: Prim[] = []
  if (props.shadow) out.push({ k: 'hatch', pts: circlePts(cx + r * 0.3, cy + r * 0.34, r * 0.98, 0, Math.PI * 2, 14), tone: TONE.near, spacing: r * 0.3, width: lw * 0.55, angle: -0.9, opacity: 0.7 })
  out.push({ k: 'disc', c: [cx, cy], r, tone: props.black ? TONE.ink : TONE.white })
  // 暗面／亮面：一片新月形
  const moon: Pt[] = props.black
    ? [...circlePts(cx, cy, r * 0.78, Math.PI * 1.05, Math.PI * 1.6, 8), ...circlePts(cx + r * 0.16, cy + r * 0.16, r * 0.62, Math.PI * 1.6, Math.PI * 1.05, 8)]
    : [...circlePts(cx, cy, r * 0.86, -0.25, Math.PI * 0.75, 10), ...circlePts(cx - r * 0.24, cy - r * 0.24, r * 0.74, Math.PI * 0.75, -0.25, 10)]
  out.push({ k: 'hatch', pts: moon, tone: props.black ? TONE.mid : TONE.mid, spacing: r * 0.2, width: lw * 0.5, angle: props.black ? 0.7 : -0.9, opacity: props.black ? 0.85 : 0.9 })
  out.push({ k: 'ring', c: [cx, cy], r, w: lw, tone: TONE.ink })
  return out
})
</script>

<template>
  <Sketch :prims="prims" :seed="seed" still />
</template>
