<script setup lang="ts">
// 瘋狂大老二封面：兩副牌。停在這張卡片上時循環播放：
// 一張黑桃 2 放在桌上 → 一模一樣的另一張黑桃 2（第二副）飛過來疊上去 → 兩張一起亮一下（雙胞胎）→ 收回
import Card from '@/ui/art/Card.vue'
defineProps<{ active?: boolean }>()
</script>

<template>
  <svg viewBox="0 0 200 130" class="cover" :class="{ active }" aria-hidden="true">
    <g class="back"><Card back transform="translate(28 30) rotate(-14 35 50)" /></g>
    <g class="a"><Card rank="2" :suit="3" transform="translate(62 18)" /></g>
    <g class="b"><Card rank="2" :suit="3" transform="translate(96 22)" /></g>
    <text x="172" y="40" class="x2 t-slab">×2</text>
  </svg>
</template>

<style scoped>
.cover {
  width: 100%;
  height: 100%;
  overflow: visible;
}
.a,
.b,
.x2 {
  transform-box: view-box;
}
.b {
  transform: rotate(8deg);
  transform-origin: 130px 120px;
}
.x2 {
  font-size: 22px;
  fill: var(--color-red);
  text-anchor: middle;
  transform-origin: 172px 32px;
}
.active .b {
  animation: twin 3.2s var(--ease-out) infinite;
}
.active .x2 {
  animation: pop2 3.2s var(--ease-back) infinite;
}
@keyframes twin {
  0%,
  10% {
    transform: translate(70px, -40px) rotate(28deg);
    opacity: 0;
  }
  32%,
  82% {
    transform: rotate(8deg);
    opacity: 1;
  }
  92%,
  100% {
    transform: translate(70px, -40px) rotate(28deg);
    opacity: 0;
  }
}
@keyframes pop2 {
  0%,
  34% {
    transform: scale(0);
  }
  44%,
  80% {
    transform: scale(1);
  }
  90%,
  100% {
    transform: scale(0);
  }
}
</style>
