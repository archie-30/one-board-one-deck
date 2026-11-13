<script setup lang="ts">
// 對手頭像：一個幾何形狀，兩點眼睛。表情靠眼睛與小動作表達：
//   think 眼睛左右看、happy 彈跳＋笑眼、sad 往下沉＋垂眼、smug 半瞇、shock 圓眼＋抖一下
import { computed, useId } from 'vue'
import type { Look, Mood } from './look'

const props = withDefaults(defineProps<{ look: Look; mood?: Mood; flip?: boolean }>(), { mood: 'idle' })
const id = useId()

const TONE: Record<Look['tone'], string> = {
  red: 'var(--color-red)',
  blue: 'var(--color-blue)',
  yellow: 'var(--color-yellow)',
  ink: 'var(--color-ink)',
  card: 'var(--color-card)',
}
const fill = computed(() => TONE[props.look.tone])
const light = computed(() => props.look.tone === 'ink' || props.look.tone === 'blue' || props.look.tone === 'red')
const eye = computed(() => (light.value ? 'var(--color-card)' : 'var(--color-ink)'))

const SHAPES: Record<Look['shape'], string> = {
  circle: 'M30 4a26 26 0 1 1 0 52a26 26 0 1 1 0-52z',
  square: 'M6 6h48v48H6z',
  triangle: 'M30 3 57 55H3z',
  diamond: 'M30 2 58 30 30 58 2 30z',
  half: 'M4 50a26 26 0 0 1 52 0z',
  pill: 'M18 8h24a12 12 0 0 1 12 12v20a12 12 0 0 1-12 12H18A12 12 0 0 1 6 40V20A12 12 0 0 1 18 8z',
}
// 眼睛的位置跟著形狀走
const EYE_Y: Record<Look['shape'], number> = { circle: 28, square: 27, triangle: 38, diamond: 29, half: 38, pill: 27 }
const ey = computed(() => EYE_Y[props.look.shape])
</script>

<template>
  <svg class="avatar" :class="[`m-${mood}`, { flip }]" viewBox="-2 -2 66 66" aria-hidden="true">
    <defs>
      <pattern :id="`dt${id}`" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="2.5" cy="2.5" r="1.1" :fill="light ? 'rgb(251 248 241 / .4)' : 'rgb(20 20 20 / .25)'" /></pattern>
      <pattern :id="`st${id}`" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2.2" height="6" :fill="light ? 'rgb(251 248 241 / .3)' : 'rgb(20 20 20 / .2)'" /></pattern>
    </defs>
    <g class="body">
      <path :d="SHAPES[look.shape]" fill="var(--color-ink)" transform="translate(3 3)" />
      <path :d="SHAPES[look.shape]" :fill="fill" stroke="var(--color-ink)" stroke-width="2.4" stroke-linejoin="round" />
      <path v-if="look.fill !== 'solid'" :d="SHAPES[look.shape]" :fill="`url(#${look.fill === 'dots' ? 'dt' : 'st'}${id})`" />
      <g class="eyes" :fill="eye" :stroke="eye" stroke-width="2.4" stroke-linecap="round">
        <template v-if="mood === 'happy'">
          <path :d="`M20 ${ey + 2}q3-5 6 0M34 ${ey + 2}q3-5 6 0`" fill="none" />
        </template>
        <template v-else-if="mood === 'sad'">
          <path :d="`M20 ${ey + 1}h6M34 ${ey + 1}h6`" />
          <path :d="`M21 ${ey - 5}l5 2M39 ${ey - 5}l-5 2`" />
        </template>
        <template v-else-if="mood === 'smug'">
          <path :d="`M20 ${ey}h6M34 ${ey}h6`" />
          <circle cx="24" :cy="ey + 2" r="1.4" stroke="none" />
          <circle cx="38" :cy="ey + 2" r="1.4" stroke="none" />
        </template>
        <template v-else-if="mood === 'shock'">
          <circle cx="23" :cy="ey" r="3.6" fill="none" stroke-width="1.8" />
          <circle cx="37" :cy="ey" r="3.6" fill="none" stroke-width="1.8" />
        </template>
        <g v-else class="dots">
          <rect x="21" :y="ey - 4" width="4" height="8" rx="2" stroke="none" />
          <rect x="35" :y="ey - 4" width="4" height="8" rx="2" stroke="none" />
        </g>
      </g>
    </g>
  </svg>
</template>

<style scoped>
.avatar {
  display: block;
  overflow: visible;
}
.flip .eyes {
  transform: scaleX(-1);
  transform-origin: 30px 0;
}
.body,
.eyes,
.dots {
  transform-box: view-box;
}
.body {
  transform-origin: 30px 58px;
}
/* 眨眼 */
.dots {
  transform-origin: 30px 28px;
  animation: blink 4.6s infinite;
}
@keyframes blink {
  0%,
  93%,
  100% {
    transform: scaleY(1);
  }
  96% {
    transform: scaleY(0.1);
  }
}
/* 思考：眼睛左右看 */
.m-think .dots {
  animation: look 1.6s ease-in-out infinite;
}
@keyframes look {
  0%,
  100% {
    transform: translate(-3px, -2px);
  }
  50% {
    transform: translate(3px, -2px);
  }
}
.m-happy .body {
  animation: hop 0.9s var(--ease-out) infinite;
}
@keyframes hop {
  0%,
  100% {
    transform: none;
  }
  15% {
    transform: scale(1.08, 0.9);
  }
  45% {
    transform: translateY(-10px) scale(0.96, 1.05);
  }
  75% {
    transform: scale(1.04, 0.96);
  }
}
.m-sad .body {
  transform: translateY(3px) rotate(-6deg);
  transition: transform 400ms var(--ease-out);
}
.m-shock .body {
  animation: shiver 0.4s linear 1;
}
@keyframes shiver {
  25% {
    transform: translateX(-3px);
  }
  50% {
    transform: translateX(3px);
  }
  75% {
    transform: translateX(-2px);
  }
}
</style>
