<script setup lang="ts">
// 分段選擇：一排相連的方格，選中的那格塗黑
import { playSound } from '@/core/audio'

defineProps<{ choices: { value: string; label: string }[]; value: string }>()
const emit = defineEmits<{ change: [value: string] }>()
function pick(v: string) {
  playSound('tap')
  emit('change', v)
}
</script>

<template>
  <div class="tabs" role="radiogroup">
    <button v-for="c in choices" :key="c.value" class="tab" :class="{ on: c.value === value }" role="radio" :aria-checked="c.value === value" @click="c.value !== value && pick(c.value)">
      <span class="fill" />
      <span class="relative">{{ c.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.tabs {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.15rem;
  padding: 0.2rem;
  border-radius: 0.75rem;
  background: var(--color-paper-2);
}
.tab {
  position: relative;
  border: 0;
  border-radius: 0.55rem;
  background: none;
  padding: 0.25rem 0.8rem;
  font-size: 0.8rem;
  font-weight: 900;
  line-height: 1.5;
  white-space: nowrap;
  color: var(--color-ink-2);
  transition: color 160ms ease;
}
.fill {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: var(--color-card);
  box-shadow: var(--shadow-1);
  opacity: 0;
  transform: scale(0.9);
  transition:
    opacity 180ms ease,
    transform 220ms var(--ease-out);
}
.tab.on {
  color: var(--color-ink);
}
.tab.on .fill {
  opacity: 1;
  transform: none;
}
</style>
