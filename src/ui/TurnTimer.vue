<script setup lang="ts">
// 倒數時間條：貼在輪到的那個人那一側的畫面邊緣，慢慢縮短；剩四分之一時變紅、閃動。
// active：現在在計時；paused：暫停（選單打開、結算中）；turnKey 一變就重新開始算。時間到發出 timeout。
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

// inline：不貼邊，放在一般排版裡（例如猜拳視窗）
const props = defineProps<{ side: 'left' | 'right' | 'top' | 'bottom'; active: boolean; seconds: number; paused?: boolean; turnKey?: unknown; inline?: boolean }>()
const emit = defineEmits<{ timeout: [] }>()

const left = ref(1)
let remain = 0
let last = 0
let raf = 0
let fired = false

function reset() {
  remain = props.seconds * 1000
  fired = false
  left.value = 1
}
function loop(t: number) {
  raf = requestAnimationFrame(loop)
  // 分頁在背景時畫面不更新，回來時不要一次扣一大段
  const dt = last ? Math.min(250, t - last) : 0
  last = t
  if (!props.active || props.paused || fired) return
  remain -= dt
  left.value = Math.max(0, remain / (props.seconds * 1000))
  if (remain <= 0) {
    fired = true
    emit('timeout')
  }
}
watch(
  () => [props.turnKey, props.active, props.side],
  () => reset(),
)
onMounted(() => {
  reset()
  raf = requestAnimationFrame(loop)
})
onBeforeUnmount(() => cancelAnimationFrame(raf))

const vertical = computed(() => props.side === 'left' || props.side === 'right')
const low = computed(() => left.value < 0.25)
</script>

<template>
  <div class="turn-timer" :class="[inline ? 'flat' : side, { on: active, low }]" aria-hidden="true">
    <i :style="{ transform: vertical ? `scaleY(${left})` : `scaleX(${left})` }" />
  </div>
</template>

<style scoped>
.turn-timer {
  position: absolute;
  z-index: 30;
  overflow: hidden;
  border: 0.12rem solid var(--color-ink);
  border-radius: 99px;
  background: var(--color-card);
  pointer-events: none;
  opacity: 0;
  transition: opacity 300ms ease;
}
.turn-timer.on {
  opacity: 1;
}
.turn-timer i {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: var(--color-yellow);
  transition: background-color 300ms ease;
}
.low i {
  background: var(--color-red);
  animation: blink 0.7s ease-in-out infinite;
}
@keyframes blink {
  50% {
    opacity: 0.45;
  }
}
/* 位置：貼著那一側的邊緣，置中 */
.bottom,
.top {
  left: 30%;
  right: 30%;
  height: 0.5rem;
}
.bottom {
  bottom: 0.3rem;
}
.top {
  top: 0.3rem;
}
.left,
.right {
  top: 25%;
  bottom: 25%;
  width: 0.5rem;
}
.left {
  left: 0.3rem;
}
.right {
  right: 0.3rem;
}
.flat {
  position: relative;
  height: 0.5rem;
  margin-top: 0.6rem;
}
.flat i {
  transform-origin: 0 50%;
}
/* 縮短的方向：橫的從右往左縮，直的從上往下縮 */
.bottom i,
.top i {
  transform-origin: 0 50%;
}
.left i,
.right i {
  transform-origin: 50% 100%;
}
</style>
