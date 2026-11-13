<script setup lang="ts">
// 圓形線框圖示按鈕（返回、選單、設定）
import { playSound } from '@/core/audio'
import Icon from './art/Icon.vue'
import type { IconName } from './art/icons'

withDefaults(defineProps<{ icon: IconName; label: string; size?: string }>(), { size: '2.4rem' })
const emit = defineEmits<{ click: [] }>()
function onClick() {
  playSound('tap')
  emit('click')
}
</script>

<template>
  <button class="icon-btn" :aria-label="label" :style="{ '--s': size }" @click="onClick"><Icon :name="icon" /></button>
</template>

<style scoped>
.icon-btn {
  display: grid;
  width: var(--s);
  height: var(--s);
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: var(--color-card);
  box-shadow: var(--shadow-1);
  transition: transform 140ms var(--ease-out);
}
.icon-btn svg {
  width: 44%;
  height: 44%;
}
.icon-btn:active {
  transform: scale(0.92);
}
</style>
