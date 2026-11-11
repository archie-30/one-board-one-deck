<script setup lang="ts">
// 過場：撲克牌 → 一排牌背由下往上掃過；棋盤 → 棋子一顆顆鋪滿再散開。
import { curtain } from '@/core/nav'
import { playSound } from '@/core/audio'
import { watch } from 'vue'

const COLS = 7
const stones = Array.from({ length: 8 * 4 }, (_, i) => ({ col: i % 8, row: Math.floor(i / 8) }))

watch(
  () => curtain.kind,
  (kind) => kind && playSound(kind === 'cards' ? 'deal' : 'stone'),
)
</script>

<template>
  <div v-if="curtain.kind" class="curtain" :class="[curtain.kind, curtain.phase]" aria-hidden="true">
    <template v-if="curtain.kind === 'cards'">
      <div v-for="i in COLS" :key="i" class="big-card" :style="{ '--i': i - 1, '--tilt': `${((i * 37) % 9) - 4}deg` }"><span /></div>
    </template>
    <template v-else>
      <div class="wood" />
      <div v-for="(s, i) in stones" :key="i" class="big-stone" :class="{ black: (s.col + s.row) % 2 === 0 }" :style="{ '--c': s.col, '--r': s.row }" />
    </template>
  </div>
</template>

<style scoped>
.curtain {
  position: fixed;
  inset: 0;
  z-index: 80;
  overflow: hidden;
  pointer-events: all;
}

/* ── 牌 ── */
.big-card {
  position: absolute;
  top: -15vh;
  left: calc(var(--i) * 100vw / 7 - 2.5vw);
  width: calc(100vw / 7 + 5vw);
  height: 130vh;
  border: 0.2rem solid var(--color-ink);
  border-radius: 1rem 0.7rem 1.100rem 0.800rem;
  background: var(--color-deck);
  padding: 1rem;
}
.big-card span {
  display: block;
  height: 100%;
  border: 0.150rem solid var(--color-card);
  border-radius: 0.500rem;
  opacity: 0.75;
  background-image:
    repeating-linear-gradient(45deg, var(--color-card) 0 0.060rem, transparent 0.060rem 0.550rem),
    repeating-linear-gradient(-45deg, var(--color-card) 0 0.060rem, transparent 0.060rem 0.550rem);
}
@keyframes card-cover {
  from {
    transform: translateY(125vh) rotate(calc(var(--tilt) * 3));
  }
  to {
    transform: translateY(0) rotate(var(--tilt));
  }
}
@keyframes card-reveal {
  from {
    transform: translateY(0) rotate(var(--tilt));
  }
  to {
    transform: translateY(-140vh) rotate(calc(var(--tilt) * -2));
  }
}
.cards.in .big-card {
  animation: card-cover 300ms var(--ease-out) both;
  animation-delay: calc(var(--i) * 15ms);
}
.cards.out .big-card {
  animation: card-reveal 320ms var(--ease-in-out) both;
  animation-delay: calc(var(--i) * 15ms);
}

/* ── 棋子 ── */
.wood {
  position: absolute;
  inset: 0;
  background-color: var(--color-wood);
  background-image:
    linear-gradient(var(--color-ink) 0.100rem, transparent 0.100rem), linear-gradient(90deg, var(--color-ink) 0.100rem, transparent 0.100rem);
  background-size: 12.500vw 25vh;
  background-position: 6.250vw 12.500vh;
}
.big-stone {
  position: absolute;
  left: calc(var(--c) * 12.500vw + 6.250vw);
  top: calc(var(--r) * 25vh + 12.500vh);
  width: max(11vw, 22vh);
  aspect-ratio: 1;
  margin: calc(max(11vw, 22vh) / -2) 0 0 calc(max(11vw, 22vh) / -2);
  border: 0.180rem solid var(--color-ink);
  border-radius: 50%;
  background: var(--color-card);
  box-shadow: 0.300rem 0.350rem 0 var(--color-ink-faint);
}
.big-stone.black {
  background: var(--color-ink);
}
@keyframes wood-in {
  from {
    opacity: 0;
  }
}
@keyframes stone-cover {
  from {
    opacity: 0;
    transform: translateY(-2.500rem) scale(1.300);
  }
}
@keyframes stone-reveal {
  to {
    opacity: 0;
    transform: scale(0.500);
  }
}
.stones.in .wood {
  animation: wood-in 220ms ease both;
}
.stones.in .big-stone {
  animation: stone-cover 220ms var(--ease-out) both;
  animation-delay: calc((var(--c) + var(--r)) * 16ms);
}
.stones.out .wood {
  animation: wood-in 260ms ease 140ms reverse both;
}
.stones.out .big-stone {
  animation: stone-reveal 220ms var(--ease-in-out) both;
  animation-delay: calc((var(--c) + var(--r)) * 16ms);
}
</style>
