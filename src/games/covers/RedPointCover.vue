<script setup lang="ts">
// 撿紅點封面：一張 7 壓在紅心 3 上（湊成十），選起時 7 從手上滑過去
import Card from '@/ui/art/Card.vue'
defineProps<{ active?: boolean }>()
</script>

<template>
  <svg viewBox="0 0 200 130" class="cover" :class="{ active }" aria-hidden="true">
    <g transform="translate(18 26) rotate(-8)"><Card rank="K" :suit="3" /></g>
    <g transform="translate(112 22) rotate(7)"><Card rank="9" :suit="1" /></g>
    <g transform="translate(64 14) rotate(-2)"><Card rank="3" :suit="2" /></g>
    <g class="hand"><Card rank="7" :suit="0" /></g>
  </svg>
</template>

<style scoped>
.cover {
  width: 100%;
  height: 100%;
  overflow: visible;
}
.hand {
  transform-box: view-box;
  transform: translate(104px, 56px) rotate(14deg);
  transition: transform 620ms var(--ease-back);
}
.active .hand {
  transform: translate(92px, 34px) rotate(8deg);
}
</style>
