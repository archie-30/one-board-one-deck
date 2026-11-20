<script setup lang="ts">
// 輪到誰：那個人那一側淡淡地亮起一片漸層（從畫面邊緣往中間淡掉）。不擋任何點擊。
// me：玩家自己那一側。玩家的倒數剩四分之一時，黃色漸層慢慢變成紅色並閃爍（跟倒數條一起）。
import { computed, watch } from 'vue'
import { buzz } from '@/core/haptics'
import { turnClock } from '@/core/turnClock'

const props = defineProps<{ side: 'left' | 'right' | 'top' | 'bottom'; on: boolean; me?: boolean }>()

// 輪到你：震一下
watch(
  () => props.me && props.on,
  (now) => now && buzz('turn'),
)

/** 0＝平常的黃色，1＝時間快到的紅色 */
const heat = computed(() => {
  if (!props.me || !props.on || turnClock.side !== props.side) return 0
  return Math.min(1, Math.max(0, (0.25 - turnClock.left) / 0.22))
})
const color = computed(() => {
  const h = heat.value
  if (!h) return undefined
  // 黃（255,170,40 / .26）→ 朱紅（255,74,28 / .46），紅要比平常的黃明顯
  const g = Math.round(170 - 96 * h)
  const b = Math.round(40 - 12 * h)
  return { '--c': `rgb(255 ${g} ${b} / ${(0.26 + 0.2 * h).toFixed(3)})` }
})
</script>

<template>
  <div class="turn-glow" :class="[side, { on, hot: heat > 0 }]" :style="color" aria-hidden="true" />
</template>


<style scoped>
.turn-glow {
  /* 對整個螢幕定位：開了鏡頭防遮擋時，畫面內縮的那一圈（鏡頭區）也照樣亮起來，不會留一條沒有效果的邊 */
  position: fixed;
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
/* 時間快到：跟倒數條一樣的節奏閃 */
.turn-glow.on.hot {
  animation: glow-blink 0.7s ease-in-out infinite;
}
@keyframes glow-blink {
  50% {
    opacity: 0.4;
  }
}
@media (prefers-reduced-motion: reduce) {
  .turn-glow.on.hot {
    animation: none;
  }
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
