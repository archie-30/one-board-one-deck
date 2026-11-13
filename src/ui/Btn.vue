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
  --sh: 0.22rem;
  position: relative;
  display: inline-block;
  border: 0;
  background: none;
  padding: 0 var(--sh) var(--sh) 0;
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
  gap: 0.55rem;
  height: var(--h);
  padding: 0 1rem;
  border: 0.13rem solid var(--color-ink);
  background: var(--bg);
  color: var(--fg);
  font-weight: 900;
  font-size: var(--fs);
  letter-spacing: 0.02em;
  box-shadow: var(--sh) var(--sh) 0 var(--color-ink);
  transition:
    transform 110ms var(--ease-out),
    box-shadow 110ms var(--ease-out),
    background-color 160ms ease;
}
.s-lg {
  --h: 3rem;
  --fs: 1.25rem;
  --sh: 0.28rem;
}
.s-md {
  --h: 2.4rem;
  --fs: 1rem;
}
.s-sm {
  --h: 1.9rem;
  --fs: 0.82rem;
  --sh: 0.16rem;
}
.s-sm .face {
  padding: 0 0.7rem;
}
.t-plain {
  --bg: var(--color-card);
  --fg: var(--color-ink);
}
.t-red {
  --bg: var(--color-red);
  --fg: var(--color-card);
}
.t-ink {
  --bg: var(--color-ink);
  --fg: var(--color-card);
}
.t-blue {
  --bg: var(--color-blue);
  --fg: var(--color-card);
}
.t-yellow {
  --bg: var(--color-yellow);
  --fg: var(--color-ink);
}
.t-ink .face {
  box-shadow: var(--sh) var(--sh) 0 var(--color-red);
}
.ic {
  width: 1.1em;
  height: 1.1em;
  flex-shrink: 0;
}
.lb {
  flex: 1;
  white-space: nowrap;
}
.ar {
  width: 1.1em;
  height: 1.1em;
  flex-shrink: 0;
  transition: transform 200ms var(--ease-out);
}
.btn:active:not(:disabled) .face {
  transform: translate(var(--sh), var(--sh));
  box-shadow: 0 0 0 var(--color-ink);
}
.btn:active:not(:disabled) .ar {
  transform: translateX(0.25rem);
}
@media (hover: hover) and (pointer: fine) {
  /* 滑鼠移上去：按鈕往左上浮一點、陰影拉長 */
  .btn:hover:not(:disabled):not(:active) .face {
    transform: translate(-0.07rem, -0.07rem);
    box-shadow: calc(var(--sh) + 0.07rem) calc(var(--sh) + 0.07rem) 0 var(--color-ink);
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
  border-color: var(--color-ink-3);
  box-shadow: none;
}
</style>
