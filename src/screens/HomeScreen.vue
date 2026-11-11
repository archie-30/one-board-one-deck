<script setup lang="ts">
import { ref } from 'vue'
import { go } from '@/core/nav'
import { playSound } from '@/core/audio'
import { S } from '@/data/strings'
import { VERSION } from '@/data/version'
import type { GameCategory } from '@/games/types'
import InkIcon from '@/ui/InkIcon.vue'
import SuitIcon from '@/ui/SuitIcon.vue'
import AppSettings from './AppSettings.vue'

const settingsOpen = ref(false)

function open(category: GameCategory) {
  playSound(category === 'cards' ? 'card' : 'stone')
  go({ name: 'category', category })
}
</script>

<template>
  <section class="home grid h-full grid-cols-12 px-[max(2.2rem,env(safe-area-inset-left))] py-[1.4rem]">
    <div class="col-span-5 flex flex-col justify-between">
      <div class="pt-[1.6rem]">
        <h1 class="font-display text-[3rem] leading-[1.04]">
          <span class="rise block" style="--i: 0">One Board</span>
          <span class="rise block" style="--i: 1">One Deck</span>
        </h1>
        <svg class="mt-[0.5rem] h-[0.7rem] w-[13.5rem] overflow-visible text-red" viewBox="0 0 200 8" preserveAspectRatio="none" aria-hidden="true">
          <path class="draw" style="--i: 4" pathLength="1" d="M2 4.600C40 1.800 70 6.400 110 3.600s60-1 88 1.400" fill="none" stroke="currentColor" stroke-width="3.400" stroke-linecap="round" />
        </svg>
        <p class="rise mt-[0.9rem] text-[1.05rem] text-ink-soft" style="--i: 3">{{ S.app.tagline }}</p>
      </div>
      <div class="rise flex items-center gap-[0.7rem] text-ink-soft" style="--i: 6">
        <button class="gear" :aria-label="S.home.settings" @click="settingsOpen = true"><InkIcon name="gear" class="h-[1.6rem] w-[1.6rem]" /></button>
        <span class="text-[0.8rem]">{{ VERSION.number }}</span>
      </div>
    </div>

    <div class="col-span-7 flex items-center justify-end gap-[2rem]">
      <!-- 撲克牌 -->
      <button class="pick rise" style="--i: 3" @click="open('cards')">
        <span class="art art-cards">
          <svg viewBox="0 0 150 190" class="h-full w-full overflow-visible" aria-hidden="true">
            <g transform="rotate(9 75 95)">
              <path d="M22 16.500 127.500 15l1.500 159.500L21 176z" class="fill-deck" />
              <path d="M20 15.500q54-3 109.500-.5M128 12.500q2.500 80 .5 164.500M130.500 175q-55 2.500-111.500.5M21 178.500Q18.500 95 21.500 12.500" class="ink" />
              <path d="M34 30 116 160M34 160 116 30M75 28v134M32 95h86" class="ink" stroke-width="1.600" opacity=".35" style="stroke: var(--color-card)" />
            </g>
            <g class="front" transform="rotate(-7 75 95)">
              <path d="M22 16.500 127.500 15l1.500 159.500L21 176z" class="fill-card" />
              <path d="M19.500 16q55-2.500 110 0M128.500 12q1.500 82-.5 166M130 175.500q-54 2-110.500.5M21.500 179Q19.500 96 21 12.500" class="ink" />
              <text x="33" y="52" class="rank font-display">A</text>
            </g>
          </svg>
          <SuitIcon :suit="3" class="suit-big" />
          <SuitIcon :suit="3" class="suit-small" />
        </span>
        <span class="font-display label">{{ S.home.cards }}</span>
      </button>

      <!-- 棋盤 -->
      <button class="pick pick-board rise" style="--i: 5" @click="open('board')">
        <span class="art art-board">
          <svg viewBox="0 0 190 190" class="h-full w-full overflow-visible" aria-hidden="true">
            <g transform="rotate(3 95 95)">
              <path d="M14 15.500 176.500 13l1.500 163L13 177.500z" class="fill-wood" />
              <path d="M11 15q83-3.500 168-1M177 10.500q2.500 82 .5 169M179.500 176.500q-84 3-168.500 1M13.500 180.500Q10.500 95 14 10.500" class="ink" />
              <path d="M46 16q1.500 80-.5 160M79 15q-1.500 82 .5 161M112 15q1.500 80-.5 161M145 14.500q-1 82 .5 161.500M14.500 47q82-1.500 162.500.5M14 80q80 1.500 163.500-.5M14 113q84-1.500 163.500.5M13.500 146q82 1.500 164-.5" class="ink" stroke-width="1.500" opacity=".55" />
              <circle cx="79" cy="80" r="14" class="stone-b" />
              <circle cx="112" cy="80" r="14" class="stone-w" />
              <circle cx="112" cy="113" r="14" class="stone-b" />
              <circle cx="79" cy="113" r="14" class="stone-w" />
              <circle cx="145" cy="146" r="14" class="stone-b drop" />
            </g>
          </svg>
        </span>
        <span class="font-display label">{{ S.home.board }}</span>
      </button>
    </div>

    <AppSettings :open="settingsOpen" @close="settingsOpen = false" />
  </section>
</template>

<style scoped>
.pick {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.7rem;
  border: 0;
  background: none;
  padding: 0.6rem;
}
.pick-board {
  margin-top: 2.6rem;
}
.art {
  position: relative;
  display: block;
  transition: transform 200ms var(--ease-out);
}
.art-cards {
  width: 10.5rem;
  height: 13.3rem;
}
.art-board {
  width: 12.4rem;
  height: 12.4rem;
}
.pick:active .art {
  transform: scale(0.97);
}
.label {
  font-size: 1.9rem;
  line-height: 1.1;
}
.ink {
  fill: none;
  stroke: var(--color-ink);
  stroke-width: 2.600;
  stroke-linecap: round;
}
.fill-deck {
  fill: var(--color-deck);
}
.fill-card {
  fill: var(--color-card);
}
.fill-wood {
  fill: var(--color-wood);
}
.rank {
  font-size: 34px;
  fill: var(--color-ink);
}
.suit-big,
.suit-small {
  position: absolute;
  color: var(--color-ink);
  transform: rotate(-7deg);
}
.suit-big {
  width: 4.200rem;
  left: 3.300rem;
  top: 5rem;
}
.suit-small {
  width: 1.150rem;
  left: 1.350rem;
  top: 4.300rem;
}
.front {
  transition: transform 260ms var(--ease-out);
  transform-box: fill-box;
  transform-origin: 20% 100%;
}
.stone-b {
  fill: var(--color-ink);
  stroke: var(--color-ink);
  stroke-width: 2;
}
.stone-w {
  fill: var(--color-card);
  stroke: var(--color-ink);
  stroke-width: 2.400;
}
/* 進場時最後一顆棋子落下：呼應「落子」 */
@keyframes drop {
  from {
    opacity: 0;
    transform: translateY(-1.200rem) scale(1.150);
  }
}
.drop {
  transform-box: fill-box;
  transform-origin: center;
  animation: drop 380ms var(--ease-out) 620ms both;
}
.gear {
  display: grid;
  place-items: center;
  width: 2.600rem;
  height: 2.600rem;
  margin-left: -0.500rem;
  border: 0;
  background: none;
  color: var(--color-ink);
  transition: transform 300ms var(--ease-out);
}
.gear:active {
  transform: rotate(40deg) scale(0.940);
}
@media (hover: hover) and (pointer: fine) {
  .pick:hover .art {
    transform: translateY(-0.250rem);
  }
  .pick:hover .front {
    transform: rotate(-12deg);
  }
}
</style>
