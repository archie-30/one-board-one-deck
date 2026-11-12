<script setup lang="ts">
// 教學用的便條：用紙膠帶貼著，寫著這一步要做什麼；答對時打勾、答錯時紅字提醒
import { S } from '@/data/strings'
import InkFrame from './art/InkFrame.vue'

defineProps<{ step: number; total: number; text: string; ok?: string; solved?: boolean; misses?: number }>()
</script>

<template>
  <div :key="step" class="note pop">
    <InkFrame block fill="var(--color-card)" :weight="2.3" :seed="step * 3 + 5" />
    <span class="tape" />
    <p class="head font-display">
      <span>{{ S.tutorial.title }}</span>
      <span class="count">{{ S.tutorial.step(step + 1, total) }}</span>
    </p>
    <p class="text">{{ text }}</p>
    <p v-if="solved && ok" class="ok slide-in"><span class="tick font-display">✓</span>{{ ok }}</p>
    <p v-else-if="misses" :key="misses" class="miss slide-in">{{ S.tutorial.tryAgain }}</p>
  </div>
</template>

<style scoped>
.note {
  position: relative;
  padding: 0.9rem 1.1rem 0.9rem;
  transform-origin: 30% 0;
}
.tape {
  position: absolute;
  top: -0.5rem;
  left: 40%;
  width: 3.6rem;
  height: 1.05rem;
  background: repeating-linear-gradient(-52deg, var(--color-far) 0 0.28rem, var(--color-paper-deep) 0.28rem 0.5rem);
  box-shadow: 0 0 0 0.06rem var(--color-mid);
  transform: rotate(-4deg);
}
.head {
  position: relative;
  display: flex;
  justify-content: space-between;
  font-size: 0.82rem;
  color: var(--color-ink-soft);
}
.text {
  position: relative;
  padding-top: 0.25rem;
  font-size: 1.02rem;
  line-height: 1.65;
  text-wrap: pretty;
}
.ok,
.miss {
  position: relative;
  margin-top: 0.5rem;
  font-size: 0.95rem;
  line-height: 1.55;
}
.tick {
  display: inline-grid;
  width: 1.3rem;
  height: 1.3rem;
  margin-right: 0.35rem;
  place-items: center;
  border-radius: 50%;
  background: var(--color-ink);
  color: var(--color-paper);
  font-size: 0.75rem;
}
.miss {
  color: var(--color-red);
}
</style>
