<script setup lang="ts">
// 第二層：左邊撲克牌、右邊棋盤。點一下選起來（那一邊放大、圖會動），再點一下進入。
import { computed, ref } from 'vue'
import { back, go } from '@/core/nav'
import { playSound } from '@/core/audio'
import { PLAYER_LOOK } from '@/data/names'
import { S } from '@/data/strings'
import { gamesIn } from '@/games/registry'
import type { GameCategory } from '@/games/types'
import ArtCard from '@/ui/art/ArtCard.vue'
import ArtKid from '@/ui/art/ArtKid.vue'
import BoardArt from '@/games/gomoku/BoardArt.vue'
import InkDivider from '@/ui/InkDivider.vue'
import RoundButton from '@/ui/RoundButton.vue'
import AppSettings from './AppSettings.vue'

const picked = ref<GameCategory | null>(null)
const settingsOpen = ref(false)
const kidMood = computed(() => (picked.value ? 'happy' : 'idle'))

const fan = [
  { rank: '3', suit: 0 },
  { rank: '7', suit: 1 },
  { rank: 'J', suit: 3 },
  { rank: 'A', suit: 2 },
  { rank: '2', suit: 3 },
]

function tap(side: GameCategory) {
  if (picked.value !== side) {
    picked.value = side
    playSound(side === 'cards' ? 'card' : 'stone')
    return
  }
  playSound('tap')
  const games = gamesIn(side)
  if (games.length === 1) go({ name: 'lobby', gameId: games[0].id })
  else go({ name: 'category', category: side })
}
</script>

<template>
  <section class="choose" :class="picked ? `picked-${picked}` : ''">
    <div class="corner left"><RoundButton icon="back" :label="S.common.back" @click="back()" /></div>
    <div class="corner right"><RoundButton icon="gear" :label="S.choose.settings" @click="settingsOpen = true" /></div>

    <button class="half cards" :class="{ on: picked === 'cards', off: picked === 'board' }" @click="tap('cards')">
      <span class="art">
        <svg viewBox="0 0 300 220" class="fan-svg" aria-hidden="true">
          <g class="deck">
            <ArtCard back :seed="41" still transform="translate(30 118) rotate(-80)" />
            <ArtCard back :seed="42" transform="translate(27 114) rotate(-80)" />
          </g>
          <g v-for="(c, i) in fan" :key="i" class="fan" :style="{ '--a': `${(i - 2) * 14}deg`, '--i': i }">
            <ArtCard :rank="c.rank" :suit="c.suit" :seed="i * 13 + 3" transform="translate(115 45)" />
          </g>
        </svg>
      </span>
      <span class="label font-display">{{ S.choose.cards }}</span>
      <span class="lead">{{ S.choose.cardsLead }}</span>
      <span class="hint font-display">{{ S.choose.again }}</span>
    </button>

    <InkDivider class="mid" :seed="5" />

    <button class="half board" :class="{ on: picked === 'board', off: picked === 'cards' }" @click="tap('board')">
      <span class="art"><BoardArt :key="picked === 'board' ? 'on' : 'off'" class="board-svg" :animate="picked === 'board'" /></span>
      <span class="label font-display">{{ S.choose.board }}</span>
      <span class="lead">{{ S.choose.boardLead }}</span>
      <span class="hint font-display">{{ S.choose.again }}</span>
    </button>

    <ArtKid class="kid" :look="PLAYER_LOOK" :mood="kidMood" :flip="picked === 'cards'" :seed="7" />
    <AppSettings :open="settingsOpen" @close="settingsOpen = false" />
  </section>
</template>

<style scoped>
.choose {
  position: relative;
  display: flex;
  height: 100%;
  align-items: stretch;
  padding: 0.6rem max(1rem, env(safe-area-inset-left)) 0;
}
.corner {
  position: absolute;
  top: max(0.7rem, env(safe-area-inset-top));
  z-index: 3;
}
.corner.left {
  left: max(1rem, env(safe-area-inset-left));
}
.corner.right {
  right: max(1rem, env(safe-area-inset-right));
}
.mid {
  height: 86%;
  align-self: center;
}
.half {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.15rem;
  border: 0;
  background: none;
  padding: 0 0 2.6rem;
  transition:
    flex-grow 420ms var(--ease-back),
    opacity 240ms ease,
    filter 240ms ease;
  animation: pop 380ms var(--ease-back) both;
}
.half.board {
  animation-delay: 80ms;
}
.half.on {
  flex-grow: 1.45;
}
.half.off {
  opacity: 0.42;
  filter: grayscale(1);
}
.art {
  display: block;
  width: 15rem;
  height: 11rem;
  transition: transform 420ms var(--ease-back);
}
.on .art {
  transform: scale(1.12) rotate(-1.5deg);
}
.fan-svg,
.board-svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}
.fan {
  transform-box: view-box;
  transform-origin: 150px 210px;
  transform: rotate(calc(var(--a) * var(--spread, 0.75)));
  transition: transform 460ms var(--ease-back);
  transition-delay: calc(var(--i) * 30ms);
}
.on .fan {
  --spread: 1.25;
}
.deck {
  transform-box: view-box;
  transition: transform 400ms var(--ease-out);
}
.on .deck {
  transform: translate(-8px, 6px);
}
.label {
  font-size: 2.3rem;
  font-weight: 900;
  line-height: 1.2;
  margin-top: 0.4rem;
}
.lead {
  font-size: 0.95rem;
  color: var(--color-ink-soft);
}
.hint {
  position: relative;
  margin-top: 0.4rem;
  font-size: 1rem;
  color: var(--color-red);
  opacity: 0;
  transform: scale(0.85);
  transition:
    opacity 160ms ease,
    transform 300ms var(--ease-back);
}
.hint::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -0.15rem;
  height: 0.15rem;
  border-radius: 0.2rem;
  background: var(--color-red);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 360ms var(--ease-out) 120ms;
}
.on .hint {
  opacity: 1;
  transform: none;
  animation: breathe-hint 1.6s ease-in-out 0.5s infinite;
}
.on .hint::after {
  transform: scaleX(1);
}
@keyframes breathe-hint {
  50% {
    transform: translateY(-0.12rem);
  }
}
.half:active .art {
  transform: scale(1.16) rotate(-2deg);
}
/* 你的小人站在中間，選哪邊就跳過去看 */
.kid {
  position: absolute;
  left: 50%;
  bottom: 0.2rem;
  width: 4.6rem;
  height: 6.5rem;
  margin-left: -2.3rem;
  transition: transform 520ms var(--ease-back);
  pointer-events: none;
}
.picked-cards .kid {
  transform: translateX(-4.5rem);
}
.picked-board .kid {
  transform: translateX(4.5rem);
}
</style>
