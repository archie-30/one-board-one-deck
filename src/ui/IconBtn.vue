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
  border: 0.13rem solid var(--color-ink);
  border-radius: 50%;
  background: var(--color-card);
  box-shadow: 0.15rem 0.15rem 0 var(--color-ink);
  transition:
    transform 110ms var(--ease-out),
    box-shadow 110ms var(--ease-out);
}
.icon-btn svg {
  width: 48%;
  height: 48%;
}
/* 按下時整顆往右下移；多一圈看不見的點擊範圍，放開的位置才不會落在按鈕外面（不然要按兩次） */
.icon-btn {
  position: relative;
}
.icon-btn::after {
  content: '';
  position: absolute;
  inset: -0.3rem;
}
.icon-btn:active {
  transform: translate(0.15rem, 0.15rem);
  box-shadow: 0 0 0 var(--color-ink);
}
</style>
