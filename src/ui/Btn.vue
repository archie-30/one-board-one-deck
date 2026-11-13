<script setup lang="ts">
// 方塊按鈕：實心色塊＋黑框＋右下實心陰影（復古印刷感）。按下時整顆往陰影方向壓下去。
import { playSound } from '@/core/audio'
import Icon from './art/Icon.vue'
import type { IconName } from './art/icons'

withDefaults(defineProps<{ tone?: 'red' | 'ink' | 'blue' | 'yellow' | 'plain'; size?: 'lg' | 'md' | 'sm'; icon?: IconName; arrow?: boolean; disabled?: boolean; block?: boolean }>(), {
  tone: 'plain',
  size: 'md',
})
const emit = defineEmits<{ click: [] }>()
function onClick() {
  playSound('tap')
  emit('click')
}
</script>

<template>
  <button class="btn" :class="[`t-${tone}`, `s-${size}`, { block }]" :disabled="disabled" @click="onClick">
    <span class="face">
      <Icon v-if="icon" :name="icon" class="ic" />
      <span class="lb"><slot /></span>
      <Icon v-if="arrow" name="arrow" class="ar" />
    </span>
  </button>
</template>

<style scoped>
.btn {
  position: relative;
  display: inline-block;
  border: 0;
  background: none;
  padding: 0;
  text-align: left;
}
.btn.block {
  display: block;
  width: 100%;
}
.face {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  height: var(--h);
  padding: 0 1rem;
  border-radius: var(--radius-sm);
  background: var(--bg);
  color: var(--fg);
  font-weight: 900;
  font-size: var(--fs);
  box-shadow: var(--sh, var(--shadow-1));
  transition:
    transform 140ms var(--ease-out),
    box-shadow 140ms var(--ease-out),
    background-color 160ms ease;
}
.s-lg {
  --h: 3.1rem;
  --fs: 1.2rem;
}
.s-lg .face {
  border-radius: var(--radius);
  padding: 0 1.2rem;
}
.s-md {
  --h: 2.4rem;
  --fs: 0.95rem;
}
.s-sm {
  --h: 1.9rem;
  --fs: 0.8rem;
}
.s-sm .face {
  padding: 0 0.75rem;
}
.t-plain {
  --bg: var(--color-card);
  --fg: var(--color-ink);
}
.t-red {
  --bg: var(--color-red);
  --fg: #fff;
  --sh: 0 2px 4px rgb(240 74 42 / 0.25), 0 10px 24px rgb(240 74 42 / 0.25);
}
.t-ink {
  --bg: var(--color-ink);
  --fg: #fff;
}
.t-blue {
  --bg: var(--color-blue);
  --fg: #fff;
}
.t-yellow {
  --bg: var(--color-yellow);
  --fg: var(--color-ink);
}
.ic,
.ar {
  width: 1.05em;
  height: 1.05em;
  flex-shrink: 0;
}
.lb {
  flex: 1;
  white-space: nowrap;
}
.ar {
  transition: transform 220ms var(--ease-out);
}
.btn:active:not(:disabled) .face {
  transform: scale(0.97);
}
.btn:active:not(:disabled) .ar {
  transform: translateX(0.25rem);
}
@media (hover: hover) and (pointer: fine) {
  .btn:hover:not(:disabled) .face {
    transform: translateY(-1px);
    box-shadow: var(--shadow-2);
  }
  .btn:hover:not(:disabled) .ar {
    transform: translateX(0.25rem);
  }
}
.btn:disabled {
  cursor: default;
}
.btn:disabled .face {
  --bg: var(--color-paper-2);
  --fg: var(--color-ink-3);
  box-shadow: none;
}
</style>
