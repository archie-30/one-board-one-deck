<script setup lang="ts">
// 模式選單：左半邊是各模式的卡片（整張卡片都能點，一次選一張），
// 右半邊是選中模式的介紹、最常用的「開始遊戲」大按鈕，以及比較少用的小按鈕（教學、規則、設定）。
import { computed, ref } from 'vue'
import { back, go } from '@/core/nav'
import { playSound } from '@/core/audio'
import { settings } from '@/core/settings'
import { S } from '@/data/strings'
import { gamesIn } from '@/games/registry'
import type { GameCategory } from '@/games/types'
import Icon from '@/ui/art/Icon.vue'
import Btn from '@/ui/Btn.vue'
import IconBtn from '@/ui/IconBtn.vue'

const props = defineProps<{ category: GameCategory }>()
const games = computed(() => gamesIn(props.category))
const pickedId = ref(games.value.find((g) => g.id === settings.lastGame[props.category])?.id ?? games.value[0].id)
const game = computed(() => games.value.find((g) => g.id === pickedId.value) ?? games.value[0])

function pick(id: string) {
  if (id === pickedId.value) return
  pickedId.value = id
  settings.lastGame[props.category] = id
  playSound('tap')
}
function open(name: 'play' | 'tutorial' | 'rules' | 'settings') {
  if (name === 'play') playSound(props.category === 'cards' ? 'deal' : 'stone')
  go({ name, gameId: game.value.id })
}
</script>

<template>
  <section class="mode" :class="`c-${category}`">
    <header class="head">
      <IconBtn icon="back" :label="S.common.back" @click="back()" />
      <h1 class="t-black title"><span class="mask"><span>{{ S.category[category].title }}</span></span></h1>
      <p class="t-label rise" style="--i: 1">{{ S.lobby.pickGame }}</p>
    </header>

    <div class="body">
      <div class="cards" role="radiogroup">
        <button
          v-for="(g, i) in games"
          :key="g.id"
          class="card rise"
          :class="{ on: g.id === game.id }"
          :style="{ '--i': 1 + i }"
          role="radio"
          :aria-checked="g.id === game.id"
          @click="pick(g.id)"
        >
          <span class="cover"><component :is="g.cover" :active="g.id === game.id" /></span>
          <span class="info">
            <span class="nm t-black">{{ g.name }}</span>
            <span class="sm">{{ g.summary }}</span>
            <span class="tags">
              <span v-for="t in g.tags" :key="t" class="tag">{{ t }}</span>
            </span>
          </span>
          <span class="check"><Icon name="check" /></span>
        </button>
      </div>

      <aside class="panel">
        <div :key="game.id" class="detail">
          <p class="t-label rise">{{ game.players }}</p>
          <h2 class="t-black name"><span class="mask"><span>{{ game.name }}</span></span></h2>
          <p class="summary rise" style="--i: 2">{{ game.summary }}</p>
          <p v-if="game.record" class="record rise" style="--i: 3">{{ game.record() }}</p>
        </div>
        <div class="acts">
          <Btn class="rise" style="--i: 3" tone="red" size="lg" arrow block @click="open('play')">{{ S.lobby.start }}</Btn>
          <div class="minor rise" style="--i: 4">
            <button class="link" @click="open('tutorial')"><Icon name="pencil" />{{ S.lobby.tutorial }}</button>
            <button class="link" @click="open('rules')"><Icon name="book" />{{ S.lobby.rules }}</button>
            <button v-if="game.settings.length" class="link" @click="open('settings')"><Icon name="gear" />{{ S.lobby.settings }}</button>
          </div>
        </div>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.mode {
  display: flex;
  height: 100%;
  flex-direction: column;
  padding: 0.8rem max(1.6rem, env(safe-area-inset-right)) 1rem max(1.4rem, env(safe-area-inset-left));
}
.mode.c-cards {
  --tint: #fdece7;
}
.mode.c-board {
  --tint: #e9edfb;
}
.head {
  display: flex;
  align-items: center;
  gap: 0.9rem;
}
.title {
  font-size: 1.7rem;
  line-height: 1.2;
}
.body {
  display: flex;
  min-height: 0;
  flex: 1;
  gap: 1.8rem;
  padding-top: 0.9rem;
}
.cards {
  display: flex;
  min-width: 0;
  flex: 1.25;
  gap: 1rem;
}
.card {
  position: relative;
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  border: 0;
  border-radius: 1.2rem;
  background: var(--color-card);
  padding: 0;
  text-align: left;
  box-shadow: var(--shadow-1);
  outline: 0.15rem solid transparent;
  outline-offset: 0;
  transition:
    transform 260ms var(--ease-out),
    box-shadow 260ms var(--ease-out),
    outline-color 200ms ease;
}
.card.on {
  transform: translateY(-0.25rem);
  box-shadow: var(--shadow-2);
  outline-color: var(--color-red);
}
.card:active {
  transform: scale(0.98);
}
.cover {
  display: block;
  min-height: 0;
  flex: 1;
  margin: 0.45rem 0.45rem 0;
  padding: 0.6rem 0.4rem;
  border-radius: 0.85rem;
  background: var(--tint);
}
.info {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.6rem 0.9rem 0.8rem;
}
.nm {
  font-size: 1.3rem;
  line-height: 1.25;
}
.sm {
  font-size: 0.72rem;
  line-height: 1.45;
  color: var(--color-ink-2);
}
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-top: 0.3rem;
}
.tag {
  padding: 0.05rem 0.5rem;
  border-radius: 999px;
  background: var(--color-paper);
  font-size: 0.62rem;
  font-weight: 900;
  color: var(--color-ink-2);
}
.check {
  position: absolute;
  right: 0.8rem;
  top: 0.8rem;
  display: grid;
  width: 1.5rem;
  height: 1.5rem;
  place-items: center;
  border-radius: 50%;
  background: var(--color-card);
  box-shadow: inset 0 0 0 0.12rem var(--color-ink-3);
  color: transparent;
  transition:
    background-color 200ms ease,
    box-shadow 200ms ease,
    transform 300ms var(--ease-back);
}
.check svg {
  width: 0.85rem;
}
.on .check {
  background: var(--color-red);
  box-shadow: none;
  color: #fff;
  transform: scale(1.08);
}
.panel {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  justify-content: space-between;
  padding: 0.2rem 0 0.1rem;
}
.name {
  font-size: 2.6rem;
  line-height: 1.1;
  letter-spacing: -0.03em;
}
.summary {
  margin-top: 0.4rem;
  font-size: 0.9rem;
  color: var(--color-ink-2);
}
.record {
  margin-top: 0.6rem;
  font-size: 0.72rem;
  color: var(--color-ink-3);
}
.acts {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.minor {
  display: flex;
  flex-wrap: wrap;
  gap: 0.2rem 1rem;
}
.link {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  border: 0;
  background: none;
  padding: 0.25rem 0.1rem;
  font-size: 0.8rem;
  font-weight: 900;
  color: var(--color-ink-2);
  transition: color 160ms ease;
}
.link svg {
  width: 0.9rem;
}
.link:active {
  color: var(--color-ink);
}
@media (hover: hover) and (pointer: fine) {
  .link:hover {
    color: var(--color-ink);
  }
  .card:not(.on):hover {
    transform: translateY(-0.15rem);
  }
}
</style>
