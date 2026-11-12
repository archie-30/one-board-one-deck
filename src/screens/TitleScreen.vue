<script setup lang="ts">
// 標題畫面：遊戲名字、你的塗鴉小人，點任何地方進到下一層
import { go } from '@/core/nav'
import { playSound } from '@/core/audio'
import { PLAYER_LOOK } from '@/data/names'
import { S } from '@/data/strings'
import { VERSION } from '@/data/version'
import ArtCard from '@/ui/art/ArtCard.vue'
import ArtKid from '@/ui/art/ArtKid.vue'
import ArtStone from '@/ui/art/ArtStone.vue'
import { inkBlob, inkPath } from '@/ui/art/ink'

const underline = [0, 4099, 8191].map((k) => inkPath([[0, 6], [80, 3], [170, 7], [250, 4]], { width: 7, seed: 4 + k, taper: 0.15, pressure: 0.5 }))
const underRed = [0, 4099, 8191].map((k) => inkPath([[214, 6], [250, 4], [292, 5]], { width: 5.5, seed: 9 + k, taper: 0.1, pressure: 0.4 }))
const dots = [inkBlob(4, 20, 4, 1), inkBlob(330, 6, 6, 2), inkBlob(300, 150, 3, 3), inkBlob(20, 230, 7, 4), inkBlob(240, 240, 3.4, 5)].join('')

function start() {
  playSound('card')
  go({ name: 'choose' })
}
</script>

<template>
  <section class="title-screen" role="button" tabindex="0" @click="start" @keydown.enter="start">
    <div class="left">
      <svg class="dots pop" viewBox="0 0 340 250" aria-hidden="true" style="--i: 5"><path :d="dots" fill="var(--color-ink)" /></svg>
      <h1 class="font-display name">
        <span class="slide-in block" style="--i: 0">One Board</span>
        <span class="slide-in block" style="--i: 1">One Deck</span>
      </h1>
      <svg class="under swipe" viewBox="-4 0 300 12" aria-hidden="true" style="--i: 4">
        <path v-for="(d, i) in underline" :key="i" :d="d" fill="var(--color-ink)" :class="`bv${i}`" />
        <path v-for="(d, i) in underRed" :key="`r${i}`" :d="d" fill="var(--color-red)" :class="`bv${i}`" />
      </svg>
      <p class="sub slide-in" style="--i: 3">{{ S.title.sub }}</p>
      <p class="sub-en slide-in" style="--i: 4">{{ S.title.subEn }}</p>
    </div>

    <div class="right">
      <svg class="props pop" viewBox="0 0 260 150" aria-hidden="true" style="--i: 3">
        <ArtCard back :seed="3" transform="translate(150 54) rotate(-8)" />
        <ArtCard rank="2" :suit="3" :seed="5" transform="translate(178 48) rotate(14)" />
        <ArtStone :cx="40" :cy="122" :r="15" black :seed="2" />
        <ArtStone :cx="72" :cy="132" :r="15" :seed="4" />
      </svg>
      <ArtKid class="kid pop" :look="PLAYER_LOOK" :seed="7" style="--i: 2" />
    </div>

    <p class="tap font-display">{{ S.title.tap }}</p>
    <p class="ver font-display">{{ VERSION.number }}</p>
  </section>
</template>

<style scoped>
.title-screen {
  position: relative;
  display: flex;
  height: 100%;
  align-items: center;
  padding: 0 max(3rem, env(safe-area-inset-left));
  cursor: pointer;
  outline: none;
}
.left {
  position: relative;
  flex: 1;
}
.dots {
  position: absolute;
  left: -1.5rem;
  top: -3rem;
  width: 22rem;
  overflow: visible;
}
.name {
  position: relative;
  font-size: 4.6rem;
  font-weight: 900;
  line-height: 1;
  letter-spacing: -0.01em;
}
.under {
  position: relative;
  display: block;
  width: 18rem;
  height: 0.8rem;
  margin: 0.9rem 0 0.7rem;
  overflow: visible;
}
.sub {
  position: relative;
  font-size: 1.45rem;
  line-height: 1.4;
  letter-spacing: 0.08em;
}
.sub-en {
  position: relative;
  font-size: 0.9rem;
  color: var(--color-ink-soft);
  letter-spacing: 0.04em;
}
.right {
  position: relative;
  width: 19rem;
  height: 17rem;
}
.props {
  position: absolute;
  inset: auto 0 0 0;
  width: 100%;
  overflow: visible;
}
.kid {
  position: absolute;
  left: 2.5rem;
  bottom: 0.4rem;
  width: 9.5rem;
  height: 13.5rem;
}
.tap {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 1.4rem;
  text-align: center;
  font-size: 1.05rem;
  letter-spacing: 0.3em;
  animation: breathe-text 2.2s ease-in-out infinite;
}
@keyframes breathe-text {
  50% {
    opacity: 0.25;
  }
}
.ver {
  position: absolute;
  left: max(1.2rem, env(safe-area-inset-left));
  bottom: 0.8rem;
  font-size: 0.7rem;
  color: var(--color-mid);
}
.title-screen:active .kid {
  transform: translateY(-0.3rem);
}
</style>
