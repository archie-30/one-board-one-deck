<script setup lang="ts">
// INKRAGE 的分頁選擇：一個手繪框分成幾格，選中的那格塗成墨黑、字變紙色
import { playSound } from '@/core/audio'
import InkFrame from './art/InkFrame.vue'

defineProps<{ choices: { value: string; label: string }[]; value: string }>()
const emit = defineEmits<{ change: [value: string] }>()
function pick(v: string) {
  playSound('tap')
  emit('change', v)
}
</script>

<template>
  <div class="tabs" role="radiogroup">
    <InkFrame block fill="var(--color-card)" :weight="2" :seed="choices.length * 5" />
    <button
      v-for="c in choices"
      :key="c.value"
      class="tab font-display"
      :class="{ on: c.value === value }"
      role="radio"
      :aria-checked="c.value === value"
      @click="c.value !== value && pick(c.value)"
    >
      <span class="ink" />
      <span class="relative">{{ c.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.tabs {
  position: relative;
  display: inline-flex;
  padding: 0.2rem;
}
.tab {
  position: relative;
  border: 0;
  background: none;
  padding: 0.25rem 0.9rem;
  font-size: 0.92rem;
  line-height: 1.5;
  white-space: nowrap;
  transition: color 120ms ease;
}
.ink {
  position: absolute;
  inset: 0.05rem;
  background: var(--color-ink);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 220ms var(--ease-out);
}
.tab.on {
  color: var(--color-paper);
}
.tab.on .ink {
  transform: scaleX(1);
}
.tab:active:not(.on) {
  transform: scale(1.05) rotate(-0.7deg);
}
</style>
