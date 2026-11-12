<script setup lang="ts">
import { playSound } from '@/core/audio'
import SketchBox from './SketchBox.vue'

withDefaults(
  defineProps<{ tone?: 'plain' | 'red' | 'deck' | 'wood' | 'leaf'; variant?: number; disabled?: boolean; size?: 'md' | 'lg' | 'sm' }>(),
  { tone: 'plain', variant: 0, size: 'md' },
)
const emit = defineEmits<{ click: [] }>()

function onClick() {
  playSound('tap')
  emit('click')
}
</script>

<template>
  <button class="ink-btn font-display" :class="[`tone-${tone}`, `size-${size}`]" :disabled="disabled" @click="onClick">
    <SketchBox fill="var(--btn-fill)" :variant="variant" shadow :tone="tone === 'red' ? 'var(--color-red)' : undefined" shade="var(--btn-shade)" />
    <span class="relative flex items-center justify-center gap-[0.5em]"><slot /></span>
  </button>
</template>

<style scoped>
.ink-btn {
  --btn-fill: var(--color-card);
  --btn-shade: var(--color-far);
  position: relative;
  font-weight: 800;
  border: 0;
  background: none;
  padding: 0.55rem 1.3rem;
  font-size: 1.15rem;
  line-height: 1.3;
  white-space: nowrap;
  transition:
    transform 160ms var(--ease-out),
    opacity 160ms ease;
}
.size-lg {
  padding: 0.8rem 1.6rem;
  font-size: 1.45rem;
}
.size-sm {
  padding: 0.35rem 0.8rem;
  font-size: 1rem;
}
.tone-red {
  --btn-fill: #f7e3e0;
  --btn-shade: var(--color-red-soft);
  color: var(--color-red);
}
.tone-deck {
  --btn-fill: #dfe5ee;
  --btn-shade: var(--color-deck-soft);
}
.tone-wood {
  --btn-fill: var(--color-wood-soft);
  --btn-shade: var(--color-wood);
}
.tone-leaf {
  --btn-fill: #e3e8d6;
  --btn-shade: var(--color-leaf-soft);
}
.ink-btn:active:not(:disabled) {
  transform: scale(0.97);
}
.ink-btn:disabled {
  opacity: 0.38;
  cursor: default;
}
@media (hover: hover) and (pointer: fine) {
  .ink-btn:hover:not(:disabled) {
    transform: translateY(-0.08rem);
  }
  .ink-btn:hover:active:not(:disabled) {
    transform: scale(0.97);
  }
}
</style>
