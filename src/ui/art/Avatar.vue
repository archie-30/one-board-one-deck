<script setup lang="ts">
// 對手頭像：一個幾何形狀，兩點眼睛。表情靠眼睛與小動作表達：
//   think 眼睛左右看、happy 彈跳＋笑眼、sad 往下沉＋垂眼、smug 半瞇、shock 圓眼＋抖一下
// talk（電腦對手才開）：表情一變，頭旁邊冒出一個顏文字泡泡，停一下就消失（想事情時偶爾才冒）
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'
import { KAOMOJI } from '@/data/kaomoji'
import type { Look, Mood } from './look'

const props = withDefaults(defineProps<{ look: Look; mood?: Mood; flip?: boolean; talk?: boolean }>(), { mood: 'idle' })
const id = useId()

// 顏文字泡泡：表情一變就冒一個（想事情時偶爾才冒），停 3 秒。
// 畫在最上層（Teleport 到 body），位置照頭像在螢幕上的位置算：放頭上，頭上沒空間就放頭下，左右不超出螢幕；
// 不加外框，字外圍一圈紙色描邊，蓋在別的東西上面也看得清楚。
const root = ref<SVGSVGElement>()
const bubble = ref<{ text: string; key: number; x: number; y: number; below: boolean } | null>(null)
let bubbleTimer = 0
watch(
  () => props.mood,
  (m) => {
    if (!props.talk) return
    const pool = KAOMOJI[m as keyof typeof KAOMOJI]
    if (!pool || (m === 'think' && Math.random() > 0.3) || !root.value) return
    const r = root.value.getBoundingClientRect()
    if (!r.width) return
    const below = r.top < 34
    bubble.value = {
      text: pool[Math.floor(Math.random() * pool.length)],
      key: Date.now(),
      x: Math.min(window.innerWidth - 56, Math.max(56, r.left + r.width / 2)),
      y: below ? r.bottom + 2 : r.top - 2,
      below,
    }
    window.clearTimeout(bubbleTimer)
    bubbleTimer = window.setTimeout(() => (bubble.value = null), 3000)
  },
)
onBeforeUnmount(() => window.clearTimeout(bubbleTimer))
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
  hex: 'M30 3 54 16.5v27L30 57 6 43.5v-27z',
  drop: 'M30 3C40 16 54 28 54 38a24 19 0 0 1-48 0C6 28 20 16 30 3z',
}
// 眼睛的位置跟著形狀走
const EYE_Y: Record<Look['shape'], number> = { circle: 28, square: 27, triangle: 38, diamond: 29, half: 38, pill: 27, hex: 29, drop: 38 }
const ey = computed(() => EYE_Y[props.look.shape])
// 頭頂的高度（帽子、皇冠、蝴蝶結放這裡）
const TOP_Y: Record<Look['shape'], number> = { circle: 4, square: 6, triangle: 5, diamond: 4, half: 24, pill: 8, hex: 4, drop: 5 }
const top = computed(() => TOP_Y[props.look.shape])
const acc = computed(() => props.look.acc ?? 'none')
/** 飾品線條：墨黑的頭用米白，不然看不到 */
const line = computed(() => (props.look.tone === 'ink' ? 'var(--color-card)' : 'var(--color-ink)'))
const shade = computed(() => (light.value ? 'rgb(251 248 241 / .3)' : 'rgb(20 20 20 / .2)'))
</script>

<template>
  <svg ref="root" class="avatar" :class="[`m-${mood}`, { flip }]" viewBox="-2 -2 66 66" aria-hidden="true">
    <defs>
      <pattern :id="`dt${id}`" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="2.5" cy="2.5" r="1.1" :fill="light ? 'rgb(251 248 241 / .4)' : 'rgb(20 20 20 / .25)'" /></pattern>
      <pattern :id="`st${id}`" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2.2" height="6" :fill="light ? 'rgb(251 248 241 / .3)' : 'rgb(20 20 20 / .2)'" /></pattern>
      <pattern :id="`ck${id}`" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="5" height="5" :fill="shade" /><rect x="5" y="5" width="5" height="5" :fill="shade" /></pattern>
      <pattern :id="`gr${id}`" width="7" height="7" patternUnits="userSpaceOnUse"><path d="M0 0.6h7M0.6 0v7" :stroke="shade" stroke-width="1.2" /></pattern>
      <clipPath :id="`cl${id}`"><path :d="SHAPES[look.shape]" /></clipPath>
    </defs>
    <g class="body">
      <path :d="SHAPES[look.shape]" fill="var(--color-ink)" transform="translate(3 3)" />
      <path :d="SHAPES[look.shape]" :fill="fill" stroke="var(--color-ink)" stroke-width="2.4" stroke-linejoin="round" />
      <rect v-if="look.fill === 'split'" x="0" y="31" width="60" height="30" :fill="shade" :clip-path="`url(#cl${id})`" />
      <path v-else-if="look.fill !== 'solid'" :d="SHAPES[look.shape]" :fill="`url(#${({ dots: 'dt', stripes: 'st', checker: 'ck', grid: 'gr' } as Record<string, string>)[look.fill]}${id})`" />
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
      <!-- 飾品（玩家頭像才有） -->
      <g v-if="acc !== 'none'" class="acc" stroke-linejoin="round" stroke-linecap="round">
        <g v-if="acc === 'blush'" fill="var(--color-red)" :opacity="look.tone === 'red' ? 0 : 0.5">
          <ellipse cx="17" :cy="ey + 6" rx="3.6" ry="2" />
          <ellipse cx="43" :cy="ey + 6" rx="3.6" ry="2" />
        </g>
        <g v-else-if="acc === 'glasses'" fill="none" :stroke="line" stroke-width="1.8">
          <circle cx="23" :cy="ey" r="5.6" />
          <circle cx="37" :cy="ey" r="5.6" />
          <path :d="`M28.6 ${ey}h2.8M17.4 ${ey - 1}l-4-2M42.6 ${ey - 1}l4-2`" />
        </g>
        <g v-else-if="acc === 'shades'" fill="var(--color-ink)" :stroke="line" stroke-width="1.4">
          <path :d="`M16 ${ey - 4}h12v4a5 5 0 0 1-12 0zM32 ${ey - 4}h12v4a5 5 0 0 1-12 0z`" />
          <path :d="`M28 ${ey - 3}h4`" fill="none" />
        </g>
        <g v-else-if="acc === 'monocle'" fill="none" :stroke="line" stroke-width="1.6">
          <circle cx="37" :cy="ey" r="5.6" />
          <path :d="`M42 ${ey + 3}q4 6 1 12`" stroke-dasharray="1.5 1.5" />
        </g>
        <path v-else-if="acc === 'mustache'" :d="`M30 ${ey + 9}c-3-4-8-4-10 0 3-1 6 1 10 1zM30 ${ey + 9}c3-4 8-4 10 0-3-1-6 1-10 1z`" :fill="line" :stroke="line" stroke-width="1" />
        <g v-else-if="acc === 'bow'" fill="var(--color-red)" stroke="var(--color-ink)" stroke-width="1.6">
          <path :d="`M40 ${top + 2}l-9-5v10zM40 ${top + 2}l9-5v10z`" />
          <circle cx="40" :cy="top + 2" r="2.2" fill="var(--color-yellow)" />
        </g>
        <g v-else-if="acc === 'party'" stroke="var(--color-ink)" stroke-width="1.6">
          <path :d="`M22 ${top + 2}L30 ${top - 16}L38 ${top + 2}z`" fill="var(--color-blue)" />
          <path :d="`M25.5 ${top - 6}l6 3M27.5 ${top - 11}l4 2`" stroke="var(--color-yellow)" stroke-width="2" />
          <circle cx="30" :cy="top - 16" r="2.6" fill="var(--color-yellow)" />
        </g>
        <g v-else-if="acc === 'headphones'" stroke="var(--color-ink)" stroke-width="2.4" fill="var(--color-red)">
          <path :d="`M9 ${ey + 2}V${ey - 4}a21 21 0 0 1 42 0v6`" fill="none" />
          <rect x="4" :y="ey - 4" width="7" height="12" rx="2" />
          <rect x="49" :y="ey - 4" width="7" height="12" rx="2" />
        </g>
        <ellipse v-else-if="acc === 'halo'" cx="30" :cy="top - 7" rx="12" ry="3.2" fill="none" stroke="var(--color-yellow)" stroke-width="3" class="halo" />
        <path v-else-if="acc === 'crown'" :d="`M19 ${top + 3}h22l2-13-7 6-6-9-6 9-7-6z`" fill="var(--color-yellow)" stroke="var(--color-ink)" stroke-width="1.8" />
      </g>
    </g>
  </svg>
  <Teleport to="body">
    <span v-if="bubble" :key="bubble.key" class="kao-bubble t-black" :class="{ below: bubble.below }" :style="{ left: `${bubble.x}px`, top: `${bubble.y}px` }">{{ bubble.text }}</span>
  </Teleport>
</template>

<style scoped>
.avatar {
  display: block;
  overflow: visible;
}
.halo {
  animation: halo 2.4s ease-in-out infinite;
}
@keyframes halo {
  50% {
    transform: translateY(-1.5px);
  }
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
.kao-bubble {
  position: fixed;
  z-index: 2100;
  translate: -50% -100%;
  white-space: nowrap;
  font-size: 0.82rem;
  line-height: 1.2;
  color: var(--color-ink);
  pointer-events: none;
  /* 沒有外框：字的外圍一圈紙色，壓在牌或棋盤上也讀得到 */
  text-shadow:
    0 0 0.12rem var(--color-paper),
    0.08rem 0 0 var(--color-paper),
    -0.08rem 0 0 var(--color-paper),
    0 0.08rem 0 var(--color-paper),
    0 -0.08rem 0 var(--color-paper);
  animation: kao-in 3s var(--ease-out) both;
}
.kao-bubble.below {
  translate: -50% 0;
}
@keyframes kao-in {
  0% {
    opacity: 0;
    scale: 0.5;
  }
  8%,
  88% {
    opacity: 1;
    scale: 1;
  }
  100% {
    opacity: 0;
  }
}
</style>
