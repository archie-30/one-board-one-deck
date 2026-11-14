<script setup lang="ts">
// 撲克牌類玩法：滑鼠位置跟著一圈淡淡的小橘光。只在用滑鼠時出現，不擋任何點擊。
import { onBeforeUnmount, onMounted, ref } from 'vue'

const el = ref<HTMLElement>()
const on = ref(false)
let raf = 0
let x = 0
let y = 0
function move(e: PointerEvent) {
  if (e.pointerType !== 'mouse') {
    on.value = false
    return
  }
  x = e.clientX
  y = e.clientY
  on.value = true
  if (!raf)
    raf = requestAnimationFrame(() => {
      raf = 0
      if (el.value) el.value.style.transform = `translate3d(${x}px, ${y}px, 0)`
    })
}
function leave() {
  on.value = false
}
onMounted(() => {
  window.addEventListener('pointermove', move)
  document.documentElement.addEventListener('pointerleave', leave)
})
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  window.removeEventListener('pointermove', move)
  document.documentElement.removeEventListener('pointerleave', leave)
})
</script>

<template>
  <div ref="el" class="glow" :class="{ on }" aria-hidden="true" />
</template>

<style scoped>
.glow {
  position: fixed;
  left: 0;
  top: 0;
  z-index: 800;
  width: 7rem;
  height: 7rem;
  margin: -3.5rem 0 0 -3.5rem;
  border-radius: 50%;
  background: radial-gradient(circle, rgb(255 120 40 / 0.22) 0%, rgb(255 120 40 / 0.1) 35%, transparent 70%);
  pointer-events: none;
  opacity: 0;
  transition: opacity 240ms ease;
}
.glow.on {
  opacity: 1;
}
@media not (hover: hover) {
  .glow {
    display: none;
  }
}
</style>
