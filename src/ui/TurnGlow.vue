<script setup lang="ts">
// 輪到誰：那個人那一側淡淡地亮起一片漸層（從畫面邊緣往中間淡掉）。不擋任何點擊。
defineProps<{ side: 'left' | 'right' | 'top' | 'bottom'; on: boolean }>()
</script>

<template>
  <div class="turn-glow" :class="[side, { on }]" aria-hidden="true" />
</template>

<style scoped>
.turn-glow {
  position: absolute;
  /* 放在畫面所有東西的後面（外層要有 isolation: isolate） */
  z-index: -1;
  pointer-events: none;
  opacity: 0;
  transition: opacity 600ms ease;
  --c: rgb(255 170 40 / 0.26);
}
.turn-glow.on {
  opacity: 1;
}
.left {
  left: 0;
  top: 0;
  bottom: 0;
  width: 34%;
  background: linear-gradient(90deg, var(--c), transparent);
}
.right {
  right: 0;
  top: 0;
  bottom: 0;
  width: 34%;
  background: linear-gradient(270deg, var(--c), transparent);
}
.top {
  left: 0;
  right: 0;
  top: 0;
  height: 36%;
  background: linear-gradient(180deg, var(--c), transparent);
}
.bottom {
  left: 0;
  right: 0;
  bottom: 0;
  height: 36%;
  background: linear-gradient(0deg, var(--c), transparent);
}
</style>
