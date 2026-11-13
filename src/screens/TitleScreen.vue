<script setup lang="ts">
// 標題畫面：大字標語從遮罩滑上來，點任何地方進入
import { go } from '@/core/nav'
import { playSound } from '@/core/audio'
import { S } from '@/data/strings'
import { VERSION } from '@/data/version'
import Card from '@/ui/art/Card.vue'
import Icon from '@/ui/art/Icon.vue'
import Stone from '@/ui/art/Stone.vue'

function start() {
  playSound('card')
  go({ name: 'choose' })
}
</script>

<template>
  <section class="title" role="button" tabindex="0" @click="start" @keydown.enter="start">
    <header class="top">
      <span class="t-label rise">{{ S.title.label }}</span>
      <span class="t-label rise" style="--i: 1">{{ VERSION.number }}</span>
    </header>

    <h1 class="t-black head">
      <span class="mask" style="--i: 1"><span>{{ S.title.line1 }}</span></span>
      <span class="mask" style="--i: 2"><span>{{ S.title.line2 }}</span></span>
    </h1>
    <p class="lead rise" style="--i: 5">{{ S.title.lead }}</p>

    <svg class="art" viewBox="0 0 240 200" aria-hidden="true">
      <g class="a1"><Card back transform="translate(40 40) rotate(-14)" /></g>
      <g class="a2"><Card rank="A" :suit="2" transform="translate(96 26) rotate(6)" /></g>
      <g class="a3"><Stone :cx="70" :cy="170" :r="16" black /></g>
      <g class="a4"><Stone :cx="110" :cy="178" :r="16" /></g>
    </svg>

    <p class="tap"><span>{{ S.title.tap }}</span><Icon name="arrow" class="ar" /></p>
  </section>
</template>

<style scoped>
.title {
  position: relative;
  height: 100%;
  padding: 1rem max(2rem, env(safe-area-inset-right)) 0 max(2rem, env(safe-area-inset-left));
  cursor: pointer;
  outline: none;
  overflow: hidden;
}
.top {
  display: flex;
  justify-content: space-between;
}
.head {
  margin-top: 2.6rem;
  font-size: 5rem;
  line-height: 1.02;
  letter-spacing: -0.05em;
}
.lead {
  margin-top: 1rem;
  font-size: 0.95rem;
  color: var(--color-ink-2);
}
.art {
  position: absolute;
  right: 3rem;
  top: 50%;
  width: 15rem;
  transform: translateY(-50%);
  overflow: visible;
}
.a1,
.a2,
.a3,
.a4 {
  animation: rise 700ms var(--ease-out) both;
}
.a1 {
  animation-delay: 300ms;
}
.a2 {
  animation-delay: 380ms;
}
.a3 {
  animation-delay: 460ms;
}
.a4 {
  animation-delay: 540ms;
}
.tap {
  position: absolute;
  left: max(2rem, env(safe-area-inset-left));
  bottom: 1.4rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.95rem;
  font-weight: 900;
  animation: rise 520ms var(--ease-out) 800ms both;
}
.ar {
  width: 1.1rem;
  color: var(--color-red);
  animation: nudge 1.2s ease-in-out infinite;
}
@keyframes nudge {
  50% {
    transform: translateX(0.35rem);
  }
}
</style>
