<script setup lang="ts">
// 小圓標籤：顯示牌型、「勝」之類的短字
withDefaults(defineProps<{ tone?: 'yellow' | 'red' | 'blue' | 'ink'; size?: string }>(), { tone: 'yellow', size: '3.6rem' })
</script>

<template>
  <span class="badge" :class="`b-${tone}`" :style="{ minWidth: size, height: `calc(${size} * 0.52)` }"><slot /></span>
</template>

<style scoped>
.badge {
  display: inline-grid;
  flex-shrink: 0;
  place-items: center;
  padding: 0 0.6rem;
  border-radius: 999px;
  font-weight: 900;
  font-size: 0.8rem;
  line-height: 1.15;
  text-align: center;
  white-space: nowrap;
  box-shadow: var(--shadow-1);
}
.b-yellow {
  background: var(--color-yellow);
  color: var(--color-ink);
}
.b-red {
  background: var(--color-red);
  color: #fff;
}
.b-blue {
  background: var(--color-blue);
  color: #fff;
}
.b-ink {
  background: var(--color-ink);
  color: #fff;
}
</style>
