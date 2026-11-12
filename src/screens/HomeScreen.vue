<script setup lang="ts">
// 主畫面：一張桌面的鉛筆素描。那疊牌和那張棋盤本身就是按鈕。
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
import { TONE, inkBlob, inkPath, type Prim } from '@/ui/art/ink'
import Sketch from '@/ui/art/Sketch.vue'
import AppSettings from './AppSettings.vue'

const settingsOpen = ref(false)

function open(category: GameCategory) {
  travel(curtainFor(category), () => go({ name: 'category', category }))
}
function openSettings() {
  playSound('tap')
  settingsOpen.value = true
}

// 標題底下那一筆：墨線，尾巴接一小段紅
const underline = inkPath([[42, 143], [110, 139], [190, 144], [262, 140]], { width: 5.5, seed: 4, taper: 0.2, pressure: 0.5 })
const underlineRed = inkPath([[232, 143], [262, 140], [286, 142]], { width: 4.5, seed: 9, taper: 0.15, pressure: 0.4 })
const splats = [inkBlob(26, 104, 3.2, 1), inkBlob(300, 62, 4.4, 2), inkBlob(214, 196, 2.2, 3), inkBlob(482, 52, 3, 4), inkBlob(500, 318, 4.6, 5), inkBlob(812, 352, 2.6, 6)].join('')

const pencil: Prim[] = [
  { k: 'hatch', pts: [[92, 361], [228, 357], [232, 363], [96, 368]], tone: TONE.near, spacing: 2.6, width: 1, opacity: 0.7 },
  { k: 'fill', pts: [[100, 345], [206, 345], [206, 358], [100, 358]], tone: TONE.markerLight },
  { k: 'hatch', pts: [[100, 351.5], [206, 351.5], [206, 358], [100, 358]], tone: TONE.marker, spacing: 2.4, width: 0.9 },
  { k: 'fill', pts: [[206, 345], [227, 351.5], [206, 358]], tone: TONE.white },
  { k: 'fill', pts: [[219.500, 349.200], [227, 351.500], [219.500, 353.800]], tone: TONE.ink },
  { k: 'fill', pts: [[87, 345], [100, 345], [100, 358], [87, 358]], tone: TONE.redLight },
  { k: 'hatch', pts: [[87, 351], [100, 351], [100, 358], [87, 358]], tone: TONE.red, spacing: 2.2, width: 0.9 },
  { k: 'poly', pts: [[87, 345], [206, 345], [227, 351.500], [206, 358], [87, 358]], w: 2, over: 0.6 },
  { k: 'path', pts: [[100, 345], [100, 358]], w: 1.6 },
  { k: 'path', pts: [[206, 345], [206, 358]], w: 1.4 },
]
const arrows: Prim[] = [
  { k: 'path', pts: [[414, 332], [430, 328], [440, 314], [438, 297]], w: 2.6 },
  { k: 'path', pts: [[438, 297], [431, 304]], w: 2.4 },
  { k: 'path', pts: [[438, 297], [445, 304]], w: 2.4 },
  { k: 'path', pts: [[582, 336], [564, 332], [554, 320], [556, 303]], w: 2.6 },
  { k: 'path', pts: [[556, 303], [549, 310]], w: 2.4 },
  { k: 'path', pts: [[556, 303], [563, 309]], w: 2.4 },
]
</script>

<template>
  <section class="h-full">
    <svg class="scene" viewBox="0 0 844 390" preserveAspectRatio="xMidYMid meet">
      <path :d="splats" fill="var(--color-ink)" class="rise" style="--i: 4" />

      <g class="rise" style="--i: 0">
        <text x="40" y="82" class="font-display title">One Board</text>
        <text x="40" y="128" class="font-display title">One Deck</text>
      </g>
      <g class="swipe" style="--i: 5">
        <path :d="underline" fill="var(--color-ink)" />
        <path :d="underlineRed" fill="var(--color-red)" />
      </g>
      <text x="44" y="172" class="tagline rise" style="--i: 3">{{ S.app.tagline }}</text>

      <g class="rise" style="--i: 6" transform="rotate(-7 150 352)"><Sketch :prims="pencil" :seed="2" /></g>

      <g class="tap gear rise" style="--i: 7" role="button" tabindex="0" :aria-label="S.home.settings" @click="openSettings" @keydown.enter="openSettings">
        <rect x="26" y="316" width="58" height="58" fill="transparent" />
        <Doodle name="gear" x="33" y="323" width="44" height="44" />
      </g>
      <text x="42" y="306" class="version">{{ VERSION.number }}</text>

      <!-- 撲克牌 -->
      <g class="tap deck" role="button" tabindex="0" :aria-label="S.home.cards" @click="open('cards')" @keydown.enter="open('cards')">
        <rect x="228" y="100" width="262" height="262" fill="transparent" />
        <g class="rise" style="--i: 1">
          <ArtCard back :seed="41" shadow still transform="translate(244 164) rotate(-13) scale(1.15)" />
          <ArtCard back :seed="42" still transform="translate(240.500 160.500) rotate(-13) scale(1.15)" />
          <ArtCard back :seed="43" transform="translate(237 157) rotate(-13) scale(1.15)" />
        </g>
        <g class="deal d1" style="--i: 0"><ArtCard rank="3" :suit="0" :seed="5" shadow transform="translate(296 132) rotate(-5) scale(1.15)" /></g>
        <g class="deal d2" style="--i: 1"><ArtCard rank="A" :suit="2" :seed="6" shadow transform="translate(342 126) rotate(8) scale(1.15)" /></g>
        <g class="deal d3" style="--i: 2"><ArtCard rank="2" :suit="3" :seed="7" shadow transform="translate(390 134) rotate(21) scale(1.15)" /></g>
        <text x="300" y="342" class="font-display label rise" style="--i: 6">{{ S.home.cards }}</text>
      </g>

      <!-- 棋盤 -->
      <g class="tap board" role="button" tabindex="0" :aria-label="S.home.board" @click="open('board')" @keydown.enter="open('board')">
        <rect x="520" y="40" width="310" height="322" fill="transparent" />
        <g class="rise" style="--i: 2">
          <ArtBowl x="762" y="26" width="76" height="76" />
          <ArtBowl black x="744" y="238" width="90" height="90" />
        </g>
        <g class="rise" style="--i: 2">
          <g transform="rotate(4 640 178)"><GomokuArt x="522" y="60" width="236" height="236" animate /></g>
        </g>
        <text x="596" y="350" class="font-display label rise" style="--i: 7">{{ S.home.board }}</text>
      </g>

      <g class="rise" style="--i: 7"><Sketch :prims="arrows" :seed="6" /></g>
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
  font-size: 44px;
  font-weight: 900;
  letter-spacing: 0;
  fill: var(--color-ink);
}
.tagline {
  font-size: 16px;
  fill: var(--color-near);
}
.version {
  font-family: var(--font-display);
  font-size: 10.500px;
  font-weight: 700;
  fill: var(--color-mid);
}
.label {
  font-size: 30px;
  font-weight: 900;
  fill: var(--color-ink);
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
/* 底線由左往右畫出來 */
@keyframes swipe-in {
  from {
    clip-path: inset(0 100% 0 0);
  }
  to {
    clip-path: inset(-20% -5% -20% -5%);
  }
}
.swipe {
  animation: swipe-in 480ms var(--ease-in-out) both;
  animation-delay: calc(var(--i) * 60ms);
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
