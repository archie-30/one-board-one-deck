<script setup lang="ts">
// 復古鋸齒徽章：放牌型名稱、「勝」之類的短字
withDefaults(defineProps<{ tone?: 'yellow' | 'red' | 'blue' | 'ink'; size?: string }>(), { tone: 'yellow', size: '3.6rem' })
</script>

<template>
  <span class="burst" :class="`b-${tone}`" :style="{ width: size, height: size }">
    <span class="shadow-layer" />
    <span class="face" />
    <span class="txt"><slot /></span>
  </span>
</template>

<style scoped>
.burst {
  position: relative;
  display: inline-grid;
  place-items: center;
  flex-shrink: 0;
}
.shadow-layer,
.face {
  position: absolute;
  inset: 0;
  clip-path: polygon(50% 0, 61% 12%, 75% 6%, 79% 21%, 94% 25%, 88% 39%, 100% 50%, 88% 61%, 94% 75%, 79% 79%, 75% 94%, 61% 88%, 50% 100%, 39% 88%, 25% 94%, 21% 79%, 6% 75%, 12% 61%, 0 50%, 12% 39%, 6% 25%, 21% 21%, 25% 6%, 39% 12%);
}
.shadow-layer {
  background: var(--color-ink);
  transform: translate(0.15rem, 0.18rem);
}
.face {
  background: var(--color-ink);
}
.face::after {
  content: '';
  position: absolute;
  inset: 0.12rem;
  clip-path: inherit;
  background: var(--bg);
}
.b-yellow {
  --bg: var(--color-yellow);
  color: var(--color-ink);
}
.b-red {
  --bg: var(--color-red);
  color: var(--color-card);
}
.b-blue {
  --bg: var(--color-blue);
  color: var(--color-card);
}
.txt {
  position: relative;
  font-weight: 900;
  font-size: 0.82rem;
  line-height: 1.1;
  text-align: center;
}
</style>
