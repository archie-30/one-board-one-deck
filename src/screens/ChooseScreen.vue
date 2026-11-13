<script setup lang="ts">
// 選擇畫面：兩張大卡片「撲克牌／棋盤」。點一下選起（卡片浮起、插圖動起來），再點一下進入模式選單。
import { ref } from 'vue'
import { back, go } from '@/core/nav'
import { playSound } from '@/core/audio'
import { S } from '@/data/strings'
import BigTwoCover from '@/games/covers/BigTwoCover.vue'
import GoCover from '@/games/covers/GoCover.vue'
import type { GameCategory } from '@/games/types'
import Icon from '@/ui/art/Icon.vue'
import IconBtn from '@/ui/IconBtn.vue'
import AppSettings from './AppSettings.vue'

const picked = ref<GameCategory | null>(null)
const settingsOpen = ref(false)

function tap(side: GameCategory) {
  if (picked.value !== side) {
    picked.value = side
    playSound(side === 'cards' ? 'card' : 'stone')
    return
  }
  playSound('tap')
  go({ name: 'category', category: side })
}
</script>

<template>
  <section class="choose">
    <aside class="intro">
      <div class="flex gap-[0.6rem]">
        <IconBtn icon="back" :label="S.common.back" @click="back()" />
        <IconBtn icon="gear" :label="S.choose.settings" @click="settingsOpen = true" />
      </div>
      <h1 class="t-black big"><span class="mask"><span>{{ S.choose.title }}</span></span></h1>
      <p class="lead rise" style="--i: 3">{{ S.choose.lead }}</p>
    </aside>

    <div class="cards">
      <button
        v-for="(side, i) in ['cards', 'board'] as const"
        :key="side"
        class="card rise"
        :class="[`c-${side}`, { on: picked === side, off: picked && picked !== side }]"
        :style="{ '--i': 1 + i }"
        @click="tap(side)"
      >
        <span class="cover">
          <BigTwoCover v-if="side === 'cards'" :active="picked === side" />
          <GoCover v-else :active="picked === side" />
        </span>
        <span class="info">
          <span class="nm t-black">{{ side === 'cards' ? S.choose.cards : S.choose.board }}</span>
          <span class="sm">{{ side === 'cards' ? S.choose.cardsLead : S.choose.boardLead }}</span>
          <span class="go"><span>{{ S.choose.again }}</span><Icon name="arrow" class="ar" /></span>
        </span>
      </button>
    </div>

    <AppSettings :open="settingsOpen" @close="settingsOpen = false" />
  </section>
</template>

<style scoped>
.choose {
  display: flex;
  height: 100%;
  gap: 1.6rem;
  padding: 0.8rem max(1.6rem, env(safe-area-inset-right)) 1.2rem max(1.4rem, env(safe-area-inset-left));
}
.intro {
  display: flex;
  width: 26%;
  flex-shrink: 0;
  flex-direction: column;
}
.big {
  margin-top: auto;
  font-size: 2.8rem;
  line-height: 1.05;
  letter-spacing: -0.04em;
  white-space: nowrap;
}
.lead {
  margin-top: 0.5rem;
  font-size: 0.82rem;
  color: var(--color-ink-2);
}
.cards {
  display: flex;
  min-width: 0;
  flex: 1;
  gap: 1.1rem;
  padding-top: 0.6rem;
}
.card {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  border: 0;
  border-radius: 1.3rem;
  background: var(--color-card);
  padding: 0;
  text-align: left;
  box-shadow: var(--shadow-1);
  outline: 0.15rem solid transparent;
  transition:
    transform 300ms var(--ease-out),
    box-shadow 300ms var(--ease-out),
    outline-color 200ms ease,
    opacity 240ms ease;
}
.c-cards {
  --tint: #fdece7;
  --accent: var(--color-red);
}
.c-board {
  --tint: #e9edfb;
  --accent: var(--color-blue);
}
.card.on {
  transform: translateY(-0.35rem);
  box-shadow: var(--shadow-2);
  outline-color: var(--accent);
}
.card.off {
  opacity: 0.55;
}
.card:active {
  transform: scale(0.985);
}
.cover {
  display: block;
  min-height: 0;
  flex: 1;
  margin: 0.5rem 0.5rem 0;
  padding: 1rem 0.6rem;
  border-radius: 1rem;
  background: var(--tint);
}
.info {
  display: flex;
  flex-direction: column;
  padding: 0.7rem 1.1rem 0.9rem;
}
.nm {
  font-size: 1.9rem;
  line-height: 1.2;
}
.sm {
  font-size: 0.8rem;
  color: var(--color-ink-2);
}
.go {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  height: 1.3rem;
  margin-top: 0.3rem;
  font-size: 0.8rem;
  font-weight: 900;
  color: var(--accent);
  opacity: 0;
  transform: translateY(0.3rem);
  transition:
    opacity 200ms ease,
    transform 300ms var(--ease-out);
}
.on .go {
  opacity: 1;
  transform: none;
}
.ar {
  width: 0.95rem;
  animation: nudge 1.2s ease-in-out infinite;
}
@keyframes nudge {
  50% {
    transform: translateX(0.3rem);
  }
}
</style>
