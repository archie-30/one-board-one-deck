<script setup lang="ts">
// 對手：塗鴉小人。用 look 這個數字決定長相（頭型、帽子、眼睛、衣服的顏色），所以每個名字各有一張臉。
import { computed } from 'vue'
import { TONE, circlePts, rectPts, type Prim, type Pt } from './ink'
import Sketch from './Sketch.vue'

const props = withDefaults(defineProps<{ look?: number; mood?: 'easy' | 'normal' }>(), { look: 0 })

// [淺, 中] 兩階，衣服用淺色打底、中色排線
const CLOTHES: [string, string][] = [
  [TONE.far, TONE.mid],
  [TONE.indigoL, TONE.indigoM],
  [TONE.kraftL, TONE.kraftM],
  [TONE.mossL, TONE.mossM],
  [TONE.redLight, TONE.red],
  [TONE.markerLight, TONE.marker],
  [TONE.mid, TONE.near],
]

const prims = computed<Prim[]>(() => {
  const n = props.look
  const [light, dark] = CLOTHES[n % CLOTHES.length]
  const hat = Math.floor(n / 1) % 5
  const eyes = props.mood ? (props.mood === 'easy' ? 4 : 5) : Math.floor(n / 2) % 4
  const square = n % 3 === 1
  const body: Pt[] = [
    [21, 33],
    [43, 33],
    [45.5, 53],
    [18.5, 53],
  ]
  const out: Prim[] = [
    { k: 'hatch', pts: [[14, 58], [50, 58], [52, 62], [16, 62]], tone: TONE.near, spacing: 2.2, width: 0.9, opacity: 0.7 },
    // 腳與手
    { k: 'path', pts: [[26, 53], [25.5, 60]], w: 2.6 },
    { k: 'path', pts: [[38, 53], [38.5, 60]], w: 2.6 },
    { k: 'path', pts: [[21, 37], [12, 44]], w: 2.4 },
    { k: 'path', pts: [[43, 37], [52, 43]], w: 2.4 },
    // 身體：淺色底＋半邊排線
    { k: 'fill', pts: body, tone: light },
    { k: 'hatch', pts: [[30, 33], [43, 33], [45.5, 53], [24, 53]], tone: dark, spacing: 2.6, width: 1 },
    { k: 'poly', pts: body, w: 2.2 },
  ]
  // 頭
  const head: Pt[] = square ? rectPts(20.5, 9, 23, 21) : circlePts(32, 20, 11.5, 0, Math.PI * 2, 18).slice(0, -1)
  out.push({ k: 'fill', pts: head, tone: TONE.white })
  out.push({ k: 'hatch', pts: square ? [[37, 9], [43.5, 9], [43.5, 30], [33, 30]] : [...circlePts(32, 20, 11.5, -0.9, 1.5, 8), ...circlePts(29, 19, 9.5, 1.5, -0.9, 8)], tone: TONE.far, spacing: 2.2, width: 0.9 })
  out.push(square ? { k: 'poly', pts: head, w: 2.2 } : { k: 'ring', c: [32, 20], r: 11.5, w: 2.2 })
  // 帽子／頭髮
  if (hat === 1) {
    out.push({ k: 'fill', pts: [[22, 11], [32, -3], [42, 11]], tone: TONE.near })
    out.push({ k: 'poly', pts: [[22, 11], [32, -3], [42, 11]], w: 2 })
  } else if (hat === 2) {
    out.push({ k: 'fill', pts: rectPts(24, 2, 16, 8), tone: TONE.near })
    out.push({ k: 'poly', pts: rectPts(24, 2, 16, 8), w: 2 })
    out.push({ k: 'path', pts: [[18, 10.5], [46, 10.5]], w: 2.6 })
  } else if (hat === 3) {
    out.push({ k: 'path', pts: [[27, 9.5], [25, 3]], w: 2 })
    out.push({ k: 'path', pts: [[32, 8.5], [32.5, 1]], w: 2 })
    out.push({ k: 'path', pts: [[37, 9.5], [40, 3.5]], w: 2 })
  } else if (hat === 4) {
    out.push({ k: 'hatch', pts: [...circlePts(32, 20, 12.5, Math.PI * 1.08, Math.PI * 1.92, 8), [41, 13], [23, 13]], tone: TONE.ink, spacing: 1.6, width: 1.1, angle: 0.3 })
  }
  // 眼睛與嘴
  const eye = (x: number): Prim[] => {
    if (eyes === 1) return [{ k: 'path', pts: [[x - 2.4, 17.5], [x + 2.4, 22.5]], w: 1.7 }, { k: 'path', pts: [[x + 2.4, 17.5], [x - 2.4, 22.5]], w: 1.7 }]
    if (eyes === 2) return [{ k: 'path', pts: [[x - 2.6, 20], [x + 2.6, 20]], w: 2 }]
    if (eyes === 3) return [{ k: 'ring', c: [x, 20], r: 2.8, w: 1.3 }, { k: 'disc', c: [x + 0.4, 20.3], r: 1.1, tone: TONE.ink }]
    if (eyes === 4) return [{ k: 'path', pts: [[x - 2.8, 21], [x, 18.6], [x + 2.8, 21]], w: 1.9 }]
    if (eyes === 5) return [{ k: 'disc', c: [x, 21], r: 1.9, tone: TONE.ink }, { k: 'path', pts: [[x + (x < 32 ? -3.4 : 3.4), 15.2], [x + (x < 32 ? 2.6 : -2.6), 17.6]], w: 2 }]
    return [{ k: 'disc', c: [x, 20], r: 2, tone: TONE.ink }]
  }
  out.push(...eye(27.5), ...eye(36.5))
  if (eyes === 4) out.push({ k: 'path', pts: [[28.5, 25], [32, 27], [35.5, 25]], w: 1.6 })
  else if (eyes === 5) out.push({ k: 'path', pts: [[29, 26.5], [35, 26.5]], w: 1.7 })
  else out.push({ k: 'path', pts: [[29.5, 25.5], [32, 26.6], [34.5, 25.5]], w: 1.5 })
  return out
})
</script>

<template>
  <svg viewBox="0 -4 64 68" class="buddy" aria-hidden="true"><Sketch :prims="prims" :seed="look * 29 + 2" /></svg>
</template>

<style scoped>
.buddy {
  display: block;
  overflow: visible;
}
</style>
