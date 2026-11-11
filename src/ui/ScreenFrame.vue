<script setup lang="ts">
// 一般頁面的框架：左上返回、標題、右上可放東西
import { back } from '@/core/nav'
import { playSound } from '@/core/audio'
import { S } from '@/data/strings'
import InkIcon from './InkIcon.vue'

defineProps<{ title: string; lead?: string }>()
const emit = defineEmits<{ back: [] }>()

function onBack() {
  playSound('tap')
  emit('back')
  back()
}
</script>

<template>
  <section class="flex h-full flex-col px-[max(1.6rem,env(safe-area-inset-left))] pt-[0.9rem] pb-[1rem]">
    <header class="flex shrink-0 items-end gap-[0.9rem] pb-[0.5rem]">
      <button class="back-btn" :aria-label="S.common.back" @click="onBack"><InkIcon name="back" class="h-[1.5rem] w-[1.5rem]" /></button>
      <h1 class="font-display text-[1.9rem] leading-none">{{ title }}</h1>
      <p v-if="lead" class="pb-[0.1rem] text-[0.9rem] leading-none text-ink-soft">{{ lead }}</p>
      <div class="ml-auto flex items-center gap-[0.6rem]"><slot name="actions" /></div>
    </header>
    <svg class="h-[0.4rem] w-full shrink-0 overflow-visible text-ink" viewBox="0 0 100 4" preserveAspectRatio="none" aria-hidden="true">
      <path d="M 0 2.4 Q 30 0.6 60 2.2 T 100 1.6" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linecap="round" />
    </svg>
    <div class="min-h-0 flex-1 pt-[0.8rem]"><slot /></div>
  </section>
</template>

<style scoped>
.back-btn {
  display: grid;
  place-items: center;
  width: 2.4rem;
  height: 2.4rem;
  margin: -0.3rem 0 -0.3rem -0.5rem;
  border: 0;
  background: none;
  transition: transform 160ms var(--ease-out);
}
.back-btn:active {
  transform: scale(0.92) translateX(-0.15rem);
}
</style>
