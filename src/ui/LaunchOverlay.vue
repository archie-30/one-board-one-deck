<script setup lang="ts">
// 進入遊戲的過場層：卡片從原位放大到整個畫面（插圖跟著放大），停住等遊戲準備好，再往上揭開。
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { endLaunch, launch, notifyGrown, onReveal } from '@/core/launch'

const el = ref<HTMLElement>()
const ease = 'cubic-bezier(0.77, 0, 0.175, 1)'
let safety = 0

watch(
  () => launch.key,
  async () => {
    if (!launch.active) return
    await nextTick()
    const z = el.value
    if (!z) return notifyGrown()
    const r = launch.rect
    const grow = z.animate(
      [
        { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, borderWidth: '0.14rem', borderRadius: '0.5rem' },
        { left: '0px', top: '0px', width: `${window.innerWidth}px`, height: `${window.innerHeight}px`, borderWidth: '0rem', borderRadius: '0rem' },
      ],
      { duration: 520, easing: ease, fill: 'forwards' },
    )
    z.querySelector('.art')?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.9)' }], { duration: 520, easing: ease, fill: 'forwards' })
    await grow.finished
    notifyGrown()
    // 萬一遊戲那邊沒通知，最晚 3 秒也要揭開
    safety = window.setTimeout(reveal, 3000)
  },
)

async function reveal() {
  window.clearTimeout(safety)
  const z = el.value
  if (!z) return endLaunch()
  // 插圖先往上飄走淡出，色塊再從下往上捲起，露出遊戲
  z.querySelector('.art')?.animate([{ transform: 'scale(1.9)', opacity: 1 }, { transform: 'scale(2.1) translateY(-12%)', opacity: 0 }], { duration: 260, easing: 'ease-in', fill: 'forwards' })
  const wipe = z.animate([{ clipPath: 'inset(0 0 0 0)' }, { clipPath: 'inset(0 0 100% 0)' }], { duration: 480, delay: 120, easing: ease, fill: 'forwards' })
  await wipe.finished
  endLaunch()
}
onReveal(() => void reveal())
onBeforeUnmount(() => onReveal(null))
</script>

<template>
  <div v-if="launch.active" :key="launch.key" ref="el" class="launch" :style="{ backgroundColor: launch.color, left: `${launch.rect.left}px`, top: `${launch.rect.top}px`, width: `${launch.rect.width}px`, height: `${launch.rect.height}px` }">
    <span class="art halftone"><component :is="launch.cover" v-if="launch.cover" active /></span>
  </div>
</template>

<style scoped>
.launch {
  position: fixed;
  z-index: 3000;
  display: grid;
  place-items: center;
  overflow: hidden;
  border: 0.14rem solid var(--color-ink);
  pointer-events: none;
  /* 換頁的淡入淡出不要套到過場層上 */
  view-transition-name: launch-overlay;
  --dot: rgb(251 248 241 / 0.18);
}
.art {
  display: block;
  width: min(42vw, 22rem);
  aspect-ratio: 200 / 130;
  background: none;
}
</style>
