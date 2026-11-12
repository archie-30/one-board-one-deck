<script setup lang="ts">
// 分類頁：每款遊戲是一張大圖，點圖就進去
import { computed } from 'vue'
import { curtainFor, go, travel } from '@/core/nav'
import { S } from '@/data/strings'
import { gamesIn } from '@/games/registry'
import type { GameCategory } from '@/games/types'
import ScreenFrame from '@/ui/ScreenFrame.vue'
import SketchBox from '@/ui/SketchBox.vue'

const props = defineProps<{ category: GameCategory }>()
const games = computed(() => gamesIn(props.category))
const text = computed(() => S.category[props.category])

function open(gameId: string) {
  travel(curtainFor(props.category), () => go({ name: 'lobby', gameId }))
}
</script>

<template>
  <ScreenFrame :title="text.title" :lead="text.lead">
    <ul class="flex h-full items-center gap-[2.4rem] pl-[1.5rem]">
      <li v-for="(game, i) in games" :key="game.id" class="rise" :style="{ '--i': i }">
        <button class="tile" :class="category" @click="open(game.id)">
          <span class="art"><component :is="game.art" animate /></span>
          <span class="flex flex-col items-start">
            <span class="font-display text-[2.4rem] leading-tight">{{ game.name }}</span>
            <span class="text-[0.95rem] leading-snug">{{ game.summary }}</span>
            <span class="text-[0.8rem] text-ink-soft">{{ game.players }}</span>
          </span>
        </button>
      </li>
      <li class="more rise" style="--i: 2">
        <SketchBox dashed :variant="2" :weight="1.6" />
        <span class="font-display relative text-[2.2rem] leading-none">？</span>
        <span class="relative text-center text-[0.8rem] leading-snug whitespace-pre-line">{{ S.category.more }}</span>
      </li>
    </ul>
  </ScreenFrame>
</template>

<style scoped>
.tile {
  display: flex;
  align-items: center;
  gap: 1.6rem;
  border: 0;
  background: none;
  padding: 0.5rem;
  text-align: left;
}
.art {
  display: block;
  width: 14rem;
  height: 12.5rem;
  transition: transform 240ms var(--ease-out);
}
.tile.cards .art {
  width: 16rem;
  height: 11rem;
}
.tile:active .art {
  transform: scale(0.96) rotate(-1.5deg);
}
.more {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  width: 7.5rem;
  height: 10rem;
  margin-left: auto;
  margin-right: 1.5rem;
  color: var(--color-ink-soft);
  opacity: 0.7;
  transform: rotate(3deg);
}
@media (hover: hover) and (pointer: fine) {
  .tile:hover .art {
    transform: translateY(-0.3rem) rotate(-1.5deg);
    --spread: 1.12;
  }
}
</style>
