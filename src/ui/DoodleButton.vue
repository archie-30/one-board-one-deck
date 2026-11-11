<script setup lang="ts">
// 圖示按鈕：一個大的手繪圖示加一行手寫字。選中時外面多一圈紅筆。
import { playSound } from '@/core/audio'
import { roughCircle } from './art/sketch'

withDefaults(defineProps<{ label?: string; selected?: boolean; disabled?: boolean; size?: string; row?: boolean }>(), { size: '4.6rem' })
const emit = defineEmits<{ click: [] }>()
const ring = roughCircle(50, 50, 47, 21, 0.05, 2)

function onClick() {
  playSound('tap')
  emit('click')
}
</script>

<template>
  <button class="doodle-btn" :class="{ selected, row }" :disabled="disabled" :style="{ '--size': size }" @click="onClick">
    <span class="art">
      <svg v-if="selected" class="pick-ring" viewBox="0 0 100 100" aria-hidden="true"><path class="draw" pathLength="1" :d="ring" /></svg>
      <slot />
    </span>
    <span v-if="label" class="label font-display">{{ label }}</span>
  </button>
</template>

<style scoped>
.doodle-btn {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  border: 0;
  background: none;
  padding: 0.2rem;
  transition: opacity 160ms ease;
}
.doodle-btn.row {
  flex-direction: row;
  gap: 0.5rem;
}
.art {
  position: relative;
  display: block;
  width: var(--size);
  height: var(--size);
  transition: transform 200ms var(--ease-out);
}
.art > :deep(svg:not(.pick-ring)) {
  width: 100%;
  height: 100%;
}
.label {
  font-size: 1.15rem;
  line-height: 1.25;
  white-space: nowrap;
}
.pick-ring {
  position: absolute;
  inset: -14%;
  width: 128%;
  height: 128%;
  overflow: visible;
  fill: none;
  stroke: var(--color-red);
  stroke-width: 3;
  stroke-linecap: round;
}
.pick-ring .draw {
  animation-duration: 380ms;
}
.doodle-btn:active:not(:disabled) .art {
  transform: scale(0.92) rotate(-3deg);
}
.doodle-btn:disabled {
  opacity: 0.32;
  cursor: default;
}
@media (hover: hover) and (pointer: fine) {
  .doodle-btn:hover:not(:disabled) .art {
    transform: translateY(-0.2rem) rotate(-4deg);
  }
}
</style>
