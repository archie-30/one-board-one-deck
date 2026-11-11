<script setup lang="ts">
import { computed } from 'vue'
import { go } from '@/core/nav'
import { playSound } from '@/core/audio'
import { S } from '@/data/strings'
import { gamesIn } from '@/games/registry'
import type { GameCategory } from '@/games/types'
import InkIcon from '@/ui/InkIcon.vue'
import ScreenFrame from '@/ui/ScreenFrame.vue'
import SketchBox from '@/ui/SketchBox.vue'

const props = defineProps<{ category: GameCategory }>()
const games = computed(() => gamesIn(props.category))
const text = computed(() => S.category[props.category])

function open(gameId: string) {
  playSound('tap')
  go({ name: 'lobby', gameId })
}
</script>

<template>
  <ScreenFrame :title="text.title" :lead="text.lead">
    <ul class="scroll-y flex h-full flex-col gap-[0.9rem] pt-[0.4rem] pr-[0.6rem]">
      <li v-for="(game, i) in games" :key="game.id" class="rise" :style="{ '--i': i }">
        <button class="row" @click="open(game.id)">
          <SketchBox :fill="category === 'cards' ? 'var(--color-deck-soft)' : 'var(--color-wood-soft)'" :variant="i" />
          <span class="font-display relative text-[2rem] leading-none">{{ game.name }}</span>
          <span class="relative flex flex-col text-left leading-snug">
            <span class="text-[1rem]">{{ game.summary }}</span>
            <span class="text-[0.85rem] text-ink-soft">{{ game.players }}</span>
          </span>
          <InkIcon name="chevron" class="arrow relative ml-auto h-[1.6rem] w-[1.6rem]" />
        </button>
      </li>
    </ul>
  </ScreenFrame>
</template>

<style scoped>
.row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 1.600rem;
  width: min(100%, 40rem);
  border: 0;
  background: none;
  padding: 1.100rem 1.400rem;
  transition: transform 160ms var(--ease-out);
}
.row:active {
  transform: scale(0.985);
}
.arrow {
  transition: transform 200ms var(--ease-out);
}
@media (hover: hover) and (pointer: fine) {
  .row:hover .arrow {
    transform: translateX(0.300rem);
  }
}
</style>
