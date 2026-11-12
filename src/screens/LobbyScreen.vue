<script setup lang="ts">
// 大廳：代表圖就是「開始對局」，旁邊是教學、規則、設定三個圖示，下面選電腦強度
import { computed } from 'vue'
import { curtainFor, go, travel } from '@/core/nav'
import { gamePrefs } from '@/core/settings'
import { S } from '@/data/strings'
import { getGame } from '@/games/registry'
import type { Difficulty } from '@/engine/common/types'
import ArtBuddy from '@/ui/art/ArtBuddy.vue'
import Doodle from '@/ui/art/Doodle.vue'
import DoodleButton from '@/ui/DoodleButton.vue'
import ScreenFrame from '@/ui/ScreenFrame.vue'

const props = defineProps<{ gameId: string }>()
const game = computed(() => getGame(props.gameId))
const prefs = computed(() => gamePrefs(props.gameId))
const kind = computed(() => curtainFor(game.value.category))

const levels: { value: Difficulty; label: string }[] = [
  { value: 'easy', label: S.common.easy },
  { value: 'normal', label: S.common.normal },
]
</script>

<template>
  <ScreenFrame :title="game.name" :lead="game.summary">
    <div class="flex h-full items-center justify-between gap-[1rem] pr-[1rem] pl-[0.6rem]">
      <button class="start rise" :class="game.category" @click="travel(kind, () => go({ name: 'play', gameId }))">
        <span class="art"><component :is="game.art" animate /></span>
        <span class="caption">
          <span class="font-display text-[1.9rem] leading-none whitespace-nowrap">{{ S.lobby.start }}</span>
          <svg class="h-[0.6rem] w-full overflow-visible" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0 4.200C20 1.500 40 2.200 58 3.200S86 2.600 100 4.400C84 6.800 62 6.200 44 5.800S16 7 0 4.200Z" fill="var(--color-red)" />
          </svg>
        </span>
      </button>

      <div class="flex flex-col items-center gap-[1.3rem]">
        <div class="flex gap-[1.1rem]">
          <DoodleButton class="rise" style="--i: 2" :label="S.lobby.tutorialShort" @click="travel(kind, () => go({ name: 'tutorial', gameId }))"><Doodle name="tutor" /></DoodleButton>
          <DoodleButton class="rise" style="--i: 3" :label="S.lobby.rulesShort" @click="go({ name: 'rules', gameId })"><Doodle name="book" /></DoodleButton>
          <DoodleButton class="rise" style="--i: 4" :label="S.lobby.settingsShort" @click="go({ name: 'settings', gameId })"><Doodle name="gear" /></DoodleButton>
        </div>
        <div class="rise flex items-center gap-[1.1rem]" style="--i: 5">
          <span class="font-display text-[0.95rem] text-ink-soft">{{ S.lobby.difficulty }}</span>
          <DoodleButton v-for="(level, i) in levels" :key="level.value" size="3.6rem" :label="level.label" :selected="prefs.difficulty === level.value" @click="prefs.difficulty = level.value">
            <ArtBuddy :look="i ? 8 : 3" :mood="level.value" />
          </DoodleButton>
        </div>
      </div>
    </div>
  </ScreenFrame>
</template>

<style scoped>
.start {
  display: flex;
  align-items: center;
  gap: 1rem;
  border: 0;
  background: none;
  padding: 0.4rem;
}
.art {
  display: block;
  width: 12rem;
  height: 12rem;
  transition: transform 240ms var(--ease-out);
}
.start.cards .art {
  width: 14rem;
  height: 9.7rem;
}
.caption {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.start:active .art {
  transform: scale(0.96);
}
@media (hover: hover) and (pointer: fine) {
  .start:hover .art {
    transform: translateY(-0.3rem);
    --spread: 1.12;
  }
}
</style>
