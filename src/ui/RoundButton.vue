<script setup lang="ts">
// 圓形圖示按鈕（選單、返回、提示等小功能）
import { playSound } from '@/core/audio'
import BtnIconArt from './art/BtnIconArt.vue'
import type { BtnIcon } from './art/btnIcons'

withDefaults(defineProps<{ icon: BtnIcon; label: string; size?: string; primary?: boolean; disabled?: boolean; showLabel?: boolean }>(), { size: '2.6rem' })
const emit = defineEmits<{ click: [] }>()
function onClick() {
  playSound('tap')
  emit('click')
}
</script>

<template>
  <button class="round-btn" :disabled="disabled" :aria-label="label" :style="{ '--s': size }" @click="onClick">
    <span class="art"><span class="dropshade" /><BtnIconArt :name="icon" :primary="primary" /></span>
    <span v-if="showLabel" class="font-display cap">{{ label }}</span>
  </button>
</template>

<style scoped>
.round-btn {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  border: 0;
  background: none;
  padding: 0;
}
.art {
  position: relative;
  display: block;
  width: var(--s);
  height: var(--s);
  transition: transform 140ms var(--ease-out);
}
.art :deep(svg) {
  position: relative;
  width: 100%;
  height: 100%;
}
.dropshade {
  position: absolute;
  inset: 4% 0 0 4%;
  border-radius: 50%;
  background: var(--color-shadow);
  transform: translate(0.15rem, 0.2rem);
}
.cap {
  font-size: calc(var(--s) * 0.3);
  line-height: 1.2;
}
.round-btn:active:not(:disabled) .art {
  transform: scale(1.1) rotate(-6deg);
}
@media (hover: hover) and (pointer: fine) {
  .round-btn:hover:not(:disabled) .art {
    transform: scale(1.08) rotate(-4deg);
  }
}
.round-btn:disabled {
  opacity: 0.35;
  cursor: default;
}
</style>
