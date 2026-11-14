<script setup lang="ts">
// 進入遊戲的過場層（放在 App 最上層，換頁時不會消失）：
//   1. 把被點的那張卡片整張複製一份，從原位拿起來、移到畫面中間並放大一點
//   2. 卡片翻面，背面是分類色＋網點＋遊戲名稱
//   3. 背面從卡片大小展開成整個畫面
//   4. 等對局畫面準備好：名稱往上飄走，色塊由下往上捲起，露出遊戲
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { endLaunch, launch, notifyGrown, onReveal } from '@/core/launch'

const flipper = ref<HTMLElement>()
const front = ref<HTMLElement>()
const fill = ref<HTMLElement>()
const showFill = ref(false)
const ease = 'cubic-bezier(0.77, 0, 0.175, 1)'
const easeOut = 'cubic-bezier(0.23, 1, 0.32, 1)'
let safety = 0

watch(
  () => launch.key,
  async () => {
    if (!launch.active) return
    showFill.value = false
    await nextTick()
    const f = flipper.value
    const host = front.value
    if (!f || !host || !launch.card) return notifyGrown()
    // 複製卡片（連同樣式），放在正面
    host.replaceChildren()
    const clone = launch.card.cloneNode(true) as HTMLElement
    clone.removeAttribute('style')
    clone.classList.remove('lifted', 'peek')
    clone.classList.add('launch-clone')
    host.appendChild(clone)

    const r = launch.rect
    const W = window.innerWidth
    const H = window.innerHeight
    // 中間的位置：高度約畫面 72%
    const scale = Math.min((H * 0.72) / r.height, (W * 0.5) / r.width)
    const dx = W / 2 - (r.left + r.width / 2)
    const dy = H / 2 - (r.top + r.height / 2)
    const lift = f.animate(
      [
        { transform: 'translate(0, 0) scale(1) rotateY(0deg) rotateZ(0deg)' },
        { transform: `translate(${dx}px, ${dy}px) scale(${scale}) rotateY(0deg) rotateZ(-2deg)`, offset: 0.38 },
        { transform: `translate(${dx}px, ${dy}px) scale(${scale}) rotateY(180deg) rotateZ(0deg)` },
      ],
      { duration: 760, easing: ease, fill: 'forwards' },
    )
    await lift.finished
    // 背面展開成整個畫面：從卡片背面的大小開始，用 clip-path 擴到全螢幕
    const w = r.width * scale
    const h = r.height * scale
    const inset = `${(H - h) / 2}px ${(W - w) / 2}px`
    showFill.value = true
    await nextTick()
    const fl = fill.value
    if (!fl) return notifyGrown()
    const grow = fl.animate([{ clipPath: `inset(${inset} round 0.6rem)` }, { clipPath: 'inset(0px 0px round 0rem)' }], { duration: 420, easing: ease, fill: 'forwards' })
    fl.querySelector('.name')?.animate([{ transform: 'scale(0.86)' }, { transform: 'scale(1)' }], { duration: 420, easing: easeOut, fill: 'forwards' })
    await grow.finished
    notifyGrown()
    // 萬一遊戲那邊沒通知，最晚 3 秒也要揭開
    safety = window.setTimeout(reveal, 3000)
  },
)

async function reveal() {
  window.clearTimeout(safety)
  const fl = fill.value
  if (!fl) return endLaunch()
  fl.querySelector('.name')?.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(-30%)', opacity: 0 }], { duration: 280, easing: 'ease-in', fill: 'forwards' })
  const wipe = fl.animate([{ clipPath: 'inset(0 0 0 0)' }, { clipPath: 'inset(0 0 100% 0)' }], { duration: 480, delay: 140, easing: ease, fill: 'forwards' })
  await wipe.finished
  endLaunch()
}
onReveal(() => void reveal())
onBeforeUnmount(() => onReveal(null))
</script>

<template>
  <div v-if="launch.active" :key="launch.key" class="launch" :style="{ '--tone': launch.color }">
    <div v-show="!showFill" ref="flipper" class="flipper" :style="{ left: `${launch.rect.left}px`, top: `${launch.rect.top}px`, width: `${launch.rect.width}px`, height: `${launch.rect.height}px` }">
      <div ref="front" class="face front" />
      <div class="face back halftone">
        <span class="t-label lb">{{ launch.label }}</span>
        <b class="t-black nm">{{ launch.name }}</b>
      </div>
    </div>
    <div v-if="showFill" ref="fill" class="fill halftone">
      <div class="name">
        <span class="t-label lb">{{ launch.label }}</span>
        <b class="t-black nm big">{{ launch.name }}</b>
      </div>
    </div>
  </div>
</template>

<style scoped>
.launch {
  position: fixed;
  inset: 0;
  z-index: 3000;
  perspective: 1400px;
  pointer-events: none;
  /* 換頁的淡入淡出不要套到過場層上 */
  view-transition-name: launch-overlay;
  --dot: rgb(251 248 241 / 0.18);
}
.flipper {
  position: absolute;
  transform-style: preserve-3d;
  transform-origin: 50% 50%;
}
.face {
  position: absolute;
  inset: 0;
  backface-visibility: hidden;
}
.front :deep(.launch-clone) {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  transform: none !important;
  opacity: 1 !important;
  --fade: 0 !important;
  box-shadow: 0.4rem 0.45rem 0 var(--color-ink);
}
.back {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.3rem;
  border: 0.14rem solid var(--color-ink);
  border-radius: 0.5rem;
  background-color: var(--tone);
  box-shadow: 0.4rem 0.45rem 0 var(--color-ink);
  color: var(--color-card);
  transform: rotateY(180deg);
}
.fill {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background-color: var(--tone);
  color: var(--color-card);
}
.name {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
}
.lb {
  color: inherit;
  opacity: 0.85;
}
.nm {
  font-size: 1.6rem;
  line-height: 1.1;
}
.nm.big {
  font-size: clamp(2.4rem, 9vh, 4.4rem);
  letter-spacing: -0.03em;
}
</style>
