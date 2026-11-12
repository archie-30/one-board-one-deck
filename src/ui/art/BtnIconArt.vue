<script setup lang="ts">
// 按鈕圓圈：紙底（主要按鈕是紅底）＋墨線圓框＋一直在輕輕動的小圖示（像 INKRAGE 選單）
import { computed } from 'vue'
import { btnIcon, type BtnIcon } from './btnIcons'
import Sketch from './Sketch.vue'

const props = defineProps<{ name: BtnIcon; primary?: boolean; seed?: number }>()
const fill = computed(() => (props.primary ? 'var(--color-card)' : 'var(--color-ink)'))
const icon = computed(() => btnIcon(props.name, fill.value))
const ring = computed(() => [{ k: 'ring' as const, c: [50, 50] as [number, number], r: 46, w: 4, tone: props.primary ? 'var(--color-red-dark)' : 'var(--color-ink)' }])
</script>

<template>
  <svg class="btn-icon" :class="[`i-${name}`, { primary }]" viewBox="0 0 100 100" aria-hidden="true" :style="{ '--btn-face': primary ? 'var(--color-red)' : 'var(--color-card)' }">
    <circle cx="50" cy="50" r="46" :fill="primary ? 'var(--color-red)' : 'var(--color-card)'" />
    <g class="glyph"><g transform="translate(18 18)"><Sketch :prims="icon" :seed="seed ?? name.length * 7" /></g></g>
    <g v-if="name === 'play'" class="speed" :stroke="fill" stroke-width="3" stroke-linecap="round">
      <line x1="16" y1="40" x2="28" y2="40" />
      <line x1="12" y1="50" x2="26" y2="50" />
      <line x1="16" y1="60" x2="28" y2="60" />
    </g>
    <Sketch :prims="ring" :seed="(seed ?? 3) + 51" />
  </svg>
</template>

<style scoped>
.btn-icon {
  display: block;
  overflow: visible;
}
.glyph {
  transform-box: view-box;
  transform-origin: 50px 50px;
}
/* 每種圖示都有自己的小動作，週期錯開，看起來像各自活著 */
.i-gear .glyph {
  animation: spin 9s linear infinite;
}
.i-book .glyph,
.i-tutor .glyph,
.i-cards .glyph,
.i-score .glyph {
  animation: sway 2.6s ease-in-out infinite alternate;
}
.i-tutor .glyph {
  animation-duration: 1.1s;
}
.i-back .glyph {
  animation: nudge-l 1.6s ease-in-out infinite;
}
.i-exit .glyph,
.i-pass .glyph {
  animation: nudge-r 1.6s ease-in-out infinite;
}
.i-again .glyph {
  animation: spin-step 3.2s var(--ease-back) infinite;
}
.i-bulb .glyph {
  animation: flicker 2.4s steps(1) infinite;
}
.i-board .glyph,
.i-stone .glyph {
  animation: bob 2.2s ease-in-out infinite;
}
.i-sound .glyph {
  animation: bob 1.4s ease-in-out infinite;
}
.speed line {
  animation: stream 0.9s linear infinite;
  opacity: 0.6;
}
.speed line:nth-child(2) {
  animation-delay: 0.3s;
}
.speed line:nth-child(3) {
  animation-delay: 0.6s;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@keyframes spin-step {
  0%,
  60% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
@keyframes sway {
  from {
    transform: rotate(-7deg);
  }
  to {
    transform: rotate(6deg);
  }
}
@keyframes nudge-l {
  50% {
    transform: translateX(-5px);
  }
}
@keyframes nudge-r {
  50% {
    transform: translateX(5px);
  }
}
@keyframes bob {
  50% {
    transform: translateY(-4px);
  }
}
@keyframes flicker {
  0%,
  70%,
  78% {
    opacity: 1;
  }
  74% {
    opacity: 0.45;
  }
}
@keyframes stream {
  from {
    transform: translateX(6px);
    opacity: 0;
  }
  30% {
    opacity: 0.7;
  }
  to {
    transform: translateX(-12px);
    opacity: 0;
  }
}
</style>
