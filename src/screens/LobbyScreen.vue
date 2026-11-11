<script setup lang="ts">
import { computed } from 'vue'
import { go } from '@/core/nav'
import { gamePrefs } from '@/core/settings'
import { playSound } from '@/core/audio'
import { S } from '@/data/strings'
import { getGame } from '@/games/registry'
import type { Difficulty } from '@/engine/common/types'
import InkButton from '@/ui/InkButton.vue'
import ScreenFrame from '@/ui/ScreenFrame.vue'
import SegChoice from '@/ui/SegChoice.vue'

const props = defineProps<{ gameId: string }>()
const game = computed(() => getGame(props.gameId))
const prefs = computed(() => gamePrefs(props.gameId))
const tone = computed(() => (game.value.category === 'cards' ? 'deck' : 'wood'))

const levels = [
  { value: 'easy', label: S.common.easy },
  { value: 'normal', label: S.common.normal },
]

function setLevel(value: string) {
  prefs.value.difficulty = value as Difficulty
  playSound('tap')
}
</script>

<template>
  <ScreenFrame :title="game.name" :lead="game.players">
    <div class="grid h-full grid-cols-12 items-center gap-[1.5rem]">
      <div class="col-span-6 flex flex-col gap-[1.5rem] pl-[0.4rem]">
        <p class="rise max-w-[19rem] text-[1.25rem] leading-relaxed">{{ game.summary }}</p>
        <div class="rise flex items-center gap-[0.9rem]" style="--i: 1">
          <span class="text-[0.95rem] text-ink-soft">{{ S.lobby.difficulty }}</span>
          <SegChoice :choices="levels" :value="prefs.difficulty" @change="setLevel" />
        </div>
      </div>
      <div class="col-span-5 col-start-8 flex flex-col gap-[0.8rem]">
        <InkButton class="rise" style="--i: 1" tone="red" size="lg" @click="go({ name: 'play', gameId })">{{ S.lobby.start }}</InkButton>
        <InkButton class="rise" style="--i: 2" :tone="tone" :variant="1" @click="go({ name: 'tutorial', gameId })">{{ S.lobby.tutorial }}</InkButton>
        <InkButton class="rise" style="--i: 3" :variant="2" @click="go({ name: 'rules', gameId })">{{ S.lobby.rules }}</InkButton>
        <InkButton class="rise" style="--i: 4" :variant="1" @click="go({ name: 'settings', gameId })">{{ S.lobby.settings }}</InkButton>
      </div>
    </div>
  </ScreenFrame>
</template>
