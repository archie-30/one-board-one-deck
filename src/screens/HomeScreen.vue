<script setup lang="ts">
// 主畫面：一張桌面。那疊牌和那張棋盤本身就是按鈕。
import { ref } from 'vue'
import { curtainFor, go, travel } from '@/core/nav'
import { playSound } from '@/core/audio'
import { S } from '@/data/strings'
import { VERSION } from '@/data/version'
import GomokuArt from '@/games/gomoku/GomokuArt.vue'
import type { GameCategory } from '@/games/types'
import ArtBowl from '@/ui/art/ArtBowl.vue'
import ArtCard from '@/ui/art/ArtCard.vue'
import Doodle from '@/ui/art/Doodle.vue'
import AppSettings from './AppSettings.vue'

const settingsOpen = ref(false)

function open(category: GameCategory) {
  travel(curtainFor(category), () => go({ name: 'category', category }))
}
function openSettings() {
  playSound('tap')
  settingsOpen.value = true
}
</script>

<template>
  <section class="h-full">
    <svg class="scene" viewBox="0 0 844 390" preserveAspectRatio="xMidYMid meet">
      <!-- 標題：像寫在筆記本上 -->
      <g class="rise" style="--i: 0">
        <text x="42" y="80" class="font-display title">One Board</text>
        <text x="42" y="127" class="font-display title">One Deck</text>
      </g>
      <path class="draw underline" style="--i: 5" pathLength="1" d="M42 142C90 137 130 146 180 141S240 139 262 143" />
      <text x="44" y="170" class="tagline rise" style="--i: 3">{{ S.app.tagline }}</text>

      <!-- 桌上的鉛筆 -->
      <g class="rise" style="--i: 6" transform="rotate(-7 150 352)">
        <path d="M102 349L212 349L212 361L102 361Z" transform="translate(4 5)" fill="url(#hatch)" />
        <path d="M100 346H206V358H100Z" class="ink" fill="var(--color-sun)" />
        <path d="M206 346L226 352L206 358Z" class="ink" fill="var(--color-card)" />
        <path d="M219 349.900L226 352L219 354.100Z" fill="var(--color-ink)" />
        <path d="M88 346H100V358H88Z" class="ink" fill="var(--color-red)" />
        <path d="M112 350H198" class="ink" stroke-width="1" opacity=".5" />
      </g>

      <!-- 設定 -->
      <g class="tap gear rise" style="--i: 7" role="button" tabindex="0" :aria-label="S.home.settings" @click="openSettings" @keydown.enter="openSettings">
        <rect x="28" y="318" width="56" height="56" fill="transparent" />
        <Doodle name="gear" x="34" y="324" width="44" height="44" />
      </g>
      <text x="44" y="304" class="version">{{ VERSION.number }}</text>

      <!-- 撲克牌 -->
      <g class="tap deck" role="button" tabindex="0" :aria-label="S.home.cards" @click="open('cards')" @keydown.enter="open('cards')">
        <rect x="228" y="100" width="260" height="262" fill="transparent" />
        <g class="rise" style="--i: 1">
          <ArtCard back :seed="41" shadow transform="translate(243 163) rotate(-13) scale(1.15)" />
          <ArtCard back :seed="42" transform="translate(240 160) rotate(-13) scale(1.15)" />
          <ArtCard back :seed="43" transform="translate(237 157) rotate(-13) scale(1.15)" />
        </g>
        <g class="deal d1" style="--i: 0"><ArtCard rank="3" :suit="0" :seed="5" shadow transform="translate(296 132) rotate(-5) scale(1.15)" /></g>
        <g class="deal d2" style="--i: 1"><ArtCard rank="A" :suit="2" :seed="6" shadow transform="translate(342 126) rotate(8) scale(1.15)" /></g>
        <g class="deal d3" style="--i: 2"><ArtCard rank="2" :suit="3" :seed="7" shadow transform="translate(390 134) rotate(21) scale(1.15)" /></g>
        <g class="rise" style="--i: 6">
          <text x="296" y="340" class="font-display label">{{ S.home.cards }}</text>
          <path class="ink note" d="M412 330C432 328 442 314 438 296M438 296l-7 6M438 296l6 7" />
        </g>
      </g>

      <!-- 棋盤 -->
      <g class="tap board" role="button" tabindex="0" :aria-label="S.home.board" @click="open('board')" @keydown.enter="open('board')">
        <rect x="520" y="40" width="310" height="322" fill="transparent" />
        <g class="rise" style="--i: 2">
          <ArtBowl x="762" y="28" width="74" height="74" />
          <ArtBowl black x="744" y="236" width="88" height="88" />
        </g>
        <g class="rise" style="--i: 2">
          <g transform="rotate(4 640 178)"><GomokuArt x="522" y="60" width="236" height="236" animate /></g>
        </g>
        <g class="rise" style="--i: 7">
          <text x="596" y="346" class="font-display label">{{ S.home.board }}</text>
          <path class="ink note" d="M580 334C560 332 552 318 556 302M556 302l-6 7M556 302l7 5" />
        </g>
      </g>
    </svg>

    <AppSettings :open="settingsOpen" @close="settingsOpen = false" />
  </section>
</template>

<style scoped>
.scene {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.title {
  font-size: 46px;
  fill: var(--color-ink);
}
.tagline {
  font-size: 15px;
  fill: var(--color-ink-soft);
}
.version {
  font-size: 11px;
  fill: var(--color-ink-soft);
}
.label {
  font-size: 34px;
  fill: var(--color-ink);
}
.underline {
  fill: none;
  stroke: var(--color-red);
  stroke-width: 5;
  stroke-linecap: round;
}
.ink {
  stroke: var(--color-ink);
  stroke-width: 1.800;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.note {
  fill: none;
  stroke-width: 2.200;
}
.tap {
  cursor: pointer;
  outline-offset: 4px;
}
.tap > * {
  transition: transform 240ms var(--ease-out);
}
.tap:active > * {
  transform: scale(0.985);
  transform-origin: center;
  transform-box: fill-box;
}

/* 進場：三張牌從牌堆發出來 */
@keyframes deal-out {
  from {
    opacity: 0;
    transform: translate(-70px, 26px) rotate(-16deg);
  }
}
.deal {
  transform-box: fill-box;
  transform-origin: 0% 100%;
  animation: deal-out 460ms var(--ease-out) both;
  animation-delay: calc(260ms + var(--i) * 90ms);
  transition: transform 260ms var(--ease-out);
}
.gear:active > * {
  transform: rotate(30deg);
}
@media (hover: hover) and (pointer: fine) {
  .deck:hover .d1 {
    transform: rotate(-5deg);
  }
  .deck:hover .d2 {
    transform: translateY(-6px);
  }
  .deck:hover .d3 {
    transform: rotate(6deg);
  }
  .board:hover > g:nth-of-type(2) {
    transform: translateY(-4px);
  }
}
</style>
