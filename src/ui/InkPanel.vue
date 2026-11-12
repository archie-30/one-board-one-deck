<script setup lang="ts">
// 全螢幕面板（規則、設定）：INKRAGE 武器頁的版型。手繪大外框、左上標題、底下一條墨線、左下返回。
import { back } from '@/core/nav'
import { S } from '@/data/strings'
import InkFrame from './art/InkFrame.vue'
import MenuButton from './MenuButton.vue'

defineProps<{ title: string; sub?: string }>()
</script>

<template>
  <section class="panel">
    <InkFrame fill="rgb(242 240 235 / 0.94)" :weight="2.6" :seed="12" />
    <header class="head slide-in">
      <h1 class="font-display title">{{ title }}</h1>
      <p v-if="sub" class="sub">{{ sub }}</p>
      <div class="ml-auto flex items-center gap-[0.6rem]"><slot name="actions" /></div>
    </header>
    <svg class="rule swipe" viewBox="0 0 100 4" preserveAspectRatio="none" aria-hidden="true" style="--i: 2">
      <path d="M0 2C18 .8 40 1.300 62 1.600S88 1 100 1.800C86 3.400 64 3 44 3S14 3.600 0 2Z" fill="var(--color-mid)" />
    </svg>
    <div class="body"><slot /></div>
    <footer class="foot">
      <div class="w-[9rem] slide-in" style="--i: 3"><MenuButton :label="S.common.back" icon="back" size="sm" :chevron="false" :seed="31" @click="back()" /></div>
      <slot name="foot" />
    </footer>
  </section>
</template>

<style scoped>
.panel {
  position: absolute;
  inset: max(0.6rem, env(safe-area-inset-top)) max(0.9rem, env(safe-area-inset-right)) 0.6rem max(0.9rem, env(safe-area-inset-left));
  display: flex;
  flex-direction: column;
  padding: 0.7rem 1.4rem 0.8rem;
}
.head {
  position: relative;
  display: flex;
  align-items: baseline;
  gap: 1rem;
}
.title {
  font-size: 1.85rem;
  font-weight: 900;
  line-height: 1.2;
}
.sub {
  font-size: 0.92rem;
  color: var(--color-ink-soft);
}
.rule {
  position: relative;
  width: 100%;
  height: 0.3rem;
  margin: 0.35rem 0 0.6rem;
}
.body {
  position: relative;
  min-height: 0;
  flex: 1;
}
.foot {
  position: relative;
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
  padding-top: 0.5rem;
}
</style>
