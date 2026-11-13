<script setup lang="ts">
// 標題畫面：超大的兩行字從遮罩滑上來，右下幾張牌與棋子落下，點任何地方進入
import { go } from '@/core/nav'
import { playSound } from '@/core/audio'
import { S } from '@/data/strings'
import { VERSION } from '@/data/version'
import Burst from '@/ui/art/Burst.vue'
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
    <div class="rule wipe" style="--i: 1" />

    <h1 class="t-black head">
      <span class="mask" style="--i: 1"><span>{{ S.title.line1 }}</span></span>
      <span class="mask" style="--i: 2"><span>{{ S.title.line2 }}</span></span>
    </h1>
    <p class="lead rise" style="--i: 5">{{ S.title.lead }}</p>

    <Burst class="badge pop" tone="red" size="5.2rem" style="--i: 8"><span class="whitespace-pre-line">{{ S.title.badge }}</span></Burst>
    <svg class="art" viewBox="0 0 260 200" aria-hidden="true">
      <g class="p" style="--i: 0; --d: 0s"><Card back transform="translate(30 50) rotate(-16)" /></g>
      <g class="p" style="--i: 1; --d: .7s"><Card rank="A" :suit="2" transform="translate(80 26) rotate(-2)" /></g>
      <g class="p" style="--i: 2; --d: 1.4s"><Card rank="2" :suit="3" transform="translate(132 36) rotate(12)" /></g>
      <g class="p" style="--i: 3; --d: 2.1s"><Stone :cx="196" :cy="160" :r="20" black /></g>
      <g class="p" style="--i: 4; --d: 2.8s"><Stone :cx="236" :cy="170" :r="20" /></g>
    </svg>

    <p class="tap"><span>{{ S.title.tap }}</span><Icon name="arrow" class="ar" /></p>
  </section>
</template>

<style scoped>
.title {
  position: relative;
  height: 100%;
  padding: 0.9rem max(1.8rem, env(safe-area-inset-right)) 0 max(1.8rem, env(safe-area-inset-left));
  cursor: pointer;
  outline: none;
  overflow: hidden;
}
.top {
  display: flex;
  justify-content: space-between;
}
.rule {
  height: 0.22rem;
  margin-top: 0.35rem;
  background: var(--color-ink);
}
.head {
  margin-top: 1.1rem;
  font-size: 5.6rem;
  line-height: 0.98;
  letter-spacing: -0.05em;
}
.lead {
  margin-top: 1rem;
  max-width: 16rem;
  font-size: 0.95rem;
  color: var(--color-ink-2);
}
.badge {
  position: absolute;
  right: 5rem;
  top: 4.6rem;
  rotate: 12deg;
}
.art {
  position: absolute;
  right: 2rem;
  bottom: -0.6rem;
  width: 21rem;
  overflow: visible;
}
.p {
  transform-box: fill-box;
  animation:
    peek-in 620ms var(--ease-back) both,
    bob 3.2s ease-in-out infinite;
  animation-delay: calc(500ms + var(--i) * 70ms), var(--d);
}
@keyframes peek-in {
  from {
    transform: translateY(9rem);
  }
}
@keyframes bob {
  50% {
    translate: 0 -0.35rem;
  }
}
.tap {
  position: absolute;
  left: max(1.8rem, env(safe-area-inset-left));
  bottom: 1.2rem;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 1.05rem;
  font-weight: 900;
  animation: rise 520ms var(--ease-out) 800ms both;
}
.ar {
  width: 1.2rem;
  animation: nudge 1.2s ease-in-out infinite;
}
@keyframes nudge {
  50% {
    transform: translateX(0.4rem);
  }
}
</style>
