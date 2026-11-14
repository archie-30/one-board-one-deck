<script setup lang="ts">
// 左右滑動的開關：黑框膠囊，圓鈕往右＝開（底色變黃），往左＝關
import { playSound } from '@/core/audio'

const props = defineProps<{ on: boolean; label: string; disabled?: boolean }>()
const emit = defineEmits<{ change: [on: boolean] }>()
function toggle() {
  if (props.disabled) return
  emit('change', !props.on)
  playSound('tap')
}
</script>

<template>
  <button class="switch" :class="{ on }" role="switch" :aria-checked="on" :aria-label="label" :disabled="disabled" @click="toggle">
    <span class="knob" />
  </button>
</template>

<style scoped>
.switch {
  position: relative;
  flex-shrink: 0;
  width: 3.4rem;
  height: 1.8rem;
  border: 0.13rem solid var(--color-ink);
  border-radius: 999px;
  background: var(--color-paper-2);
  padding: 0;
  box-shadow: 0.15rem 0.15rem 0 var(--color-ink);
  transition: background-color 220ms ease;
}
.switch.on {
  background: var(--color-yellow);
}
.switch:disabled {
  opacity: 0.4;
}
.knob {
  position: absolute;
  left: 0.16rem;
  top: 50%;
  width: 1.25rem;
  height: 1.25rem;
  border: 0.13rem solid var(--color-ink);
  border-radius: 50%;
  background: var(--color-card);
  translate: 0 -50%;
  transition: left 260ms var(--ease-back);
}
.on .knob {
  left: calc(100% - 1.41rem);
}
</style>
