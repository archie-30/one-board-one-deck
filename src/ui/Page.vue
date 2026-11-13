<script setup lang="ts">
// 一般頁面（規則、設定）：左上大標題、右上小標籤、一條粗黑線，左下返回
import { back } from '@/core/nav'
import { S } from '@/data/strings'
import Btn from './Btn.vue'

defineProps<{ title: string; label?: string; num?: string }>()
</script>

<template>
  <section class="page">
    <header class="head">
      <h1 class="t-black title"><span class="mask"><span>{{ title }}</span></span></h1>
      <p v-if="label" class="t-label rise" style="--i: 2">{{ label }}</p>
      <span v-if="num" class="t-slab num rise" style="--i: 1">{{ num }}</span>
    </header>
    <div class="rule wipe" style="--i: 2" />
    <div class="body"><slot /></div>
    <footer class="foot rise" style="--i: 4">
      <Btn icon="back" size="sm" @click="back()">{{ S.common.back }}</Btn>
      <slot name="foot" />
    </footer>
  </section>
</template>

<style scoped>
.page {
  display: flex;
  height: 100%;
  flex-direction: column;
  padding: 0.9rem max(1.6rem, env(safe-area-inset-right)) 0.8rem max(1.6rem, env(safe-area-inset-left));
}
.head {
  display: flex;
  align-items: baseline;
  gap: 1.2rem;
}
.title {
  font-size: 2.3rem;
  line-height: 1.1;
}
.num {
  margin-left: auto;
  font-size: 1.6rem;
  color: var(--color-red);
}
.rule {
  height: 0.22rem;
  margin: 0.35rem 0 0.7rem;
  background: var(--color-ink);
}
.body {
  position: relative;
  min-height: 0;
  flex: 1;
}
.foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding-top: 0.5rem;
}
</style>
