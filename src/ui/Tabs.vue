<script setup lang="ts">
// 分段選擇：一排相連的方格，選中的那格塗黑
// hot：特別的那一格（例如難度「挑戰」），選中時改塗朱紅到橘色的漸層
import { playSound } from '@/core/audio'

defineProps<{ choices: { value: string; label: string }[]; value: string; hot?: string }>()
const emit = defineEmits<{ change: [value: string] }>()
function pick(v: string) {
  playSound('tap')
  emit('change', v)
}
</script>

<template>
  <div class="tabs" role="radiogroup">
    <button v-for="c in choices" :key="c.value" class="tab" :class="{ on: c.value === value, hot: c.value === hot }" role="radio" :aria-checked="c.value === value" @click="c.value !== value && pick(c.value)">
      <span class="fill" />
      <span class="relative">{{ c.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.tabs {
  display: inline-flex;
  flex-wrap: wrap;
  border: 0.13rem solid var(--color-ink);
  background: var(--color-card);
  box-shadow: 0.16rem 0.16rem 0 var(--color-ink);
}
.tab {
  position: relative;
  border: 0;
  border-right: 0.13rem solid var(--color-ink);
  background: none;
  padding: 0.25rem 0.8rem;
  font-size: 0.82rem;
  font-weight: 900;
  line-height: 1.5;
  white-space: nowrap;
}
.tab:last-child {
  border-right: 0;
}
.fill {
  position: absolute;
  inset: 0;
  background: var(--color-ink);
  transform: scaleY(0);
  transform-origin: bottom;
  transition: transform 220ms var(--ease-out);
}
.tab.on {
  color: var(--color-card);
}
.tab.on .fill {
  transform: none;
}
/* 挑戰：朱紅到橘色，網點輕輕流動 */
.tab.hot .fill {
  background-color: var(--color-red);
  background-image:
    radial-gradient(rgb(251 248 241 / 0.22) 22%, transparent 25%),
    linear-gradient(100deg, var(--color-red) 0%, #ff7a1a 55%, #ffa031 100%);
  background-size:
    0.45rem 0.45rem,
    100% 100%;
  animation: hot-dots 2.4s linear infinite;
}
@keyframes hot-dots {
  to {
    background-position:
      0.9rem 0,
      0 0;
  }
}
</style>
