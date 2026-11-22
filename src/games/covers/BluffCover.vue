<script setup lang="ts">
// 吹牛封面：桌上兩張蓋著的牌，旁邊對話框喊「7」。停在這張卡片上時循環播放：
// 紅色的「!」冒出來（有人喊吹牛）→ 上面那張翻開，是梅花 3（被抓包）→ 停一下 → 翻回去重來
import Card from '@/ui/art/Card.vue'
defineProps<{ active?: boolean }>()
</script>

<template>
  <svg viewBox="0 0 200 130" class="cover" :class="{ active }" aria-hidden="true">
    <g transform="translate(30 22) rotate(-10 35 50)"><Card back /></g>
    <g transform="translate(58 18) rotate(7 35 50)">
      <g class="back"><Card back /></g>
      <g class="face"><Card rank="3" :suit="0" /></g>
    </g>
    <!-- 喊的點數 -->
    <g class="claim" transform="translate(140 30)">
      <path d="M-24 -20 h48 a6 6 0 0 1 6 6 v26 a6 6 0 0 1 -6 6 h-30 l-12 12 l2 -12 h-8 a6 6 0 0 1 -6 -6 v-26 a6 6 0 0 1 6 -6 z" fill="var(--color-card)" stroke="var(--color-ink)" stroke-width="2.4" />
      <text x="0" y="8" text-anchor="middle" class="t-slab num">7</text>
    </g>
    <!-- 吹牛！ -->
    <g class="bang" transform="translate(150 92)">
      <circle r="17" fill="var(--color-red)" stroke="var(--color-ink)" stroke-width="2.4" />
      <text x="0" y="9" text-anchor="middle" class="t-slab ex">!</text>
    </g>
  </svg>
</template>

<style scoped>
.cover {
  width: 100%;
  height: 100%;
  overflow: visible;
}
.num {
  font-size: 26px;
  fill: var(--color-red);
}
.ex {
  font-size: 26px;
  fill: var(--color-card);
}
.back,
.face {
  transform-box: fill-box;
  transform-origin: center;
}
.face {
  transform: scaleX(0);
}
.bang {
  transform-box: fill-box;
  transform-origin: center;
  scale: 0;
}
.active .back {
  animation: back 3.6s ease-in-out infinite;
}
.active .face {
  animation: face 3.6s ease-in-out infinite;
}
.active .bang {
  animation: bang 3.6s var(--ease-back) infinite;
}
@keyframes bang {
  0%,
  12% {
    scale: 0;
  }
  22%,
  84% {
    scale: 1;
  }
  92%,
  100% {
    scale: 0;
  }
}
/* 翻牌：背面先縮扁、正面再撐開 */
@keyframes back {
  0%,
  30% {
    transform: scaleX(1);
  }
  37%,
  86% {
    transform: scaleX(0);
  }
  93%,
  100% {
    transform: scaleX(1);
  }
}
@keyframes face {
  0%,
  37% {
    transform: scaleX(0);
  }
  44%,
  80% {
    transform: scaleX(1);
  }
  86%,
  100% {
    transform: scaleX(0);
  }
}
@media (prefers-reduced-motion: reduce) {
  .active .back,
  .active .face,
  .active .bang {
    animation: none;
  }
}
</style>
