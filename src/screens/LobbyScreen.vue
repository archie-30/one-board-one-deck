<script setup lang="ts">
// 大廳：INKRAGE 主選單的版型。左邊是這個遊戲的活動場景，中間一條墨線，右邊一排手繪按鈕。
import { computed } from 'vue'
import { back, go } from '@/core/nav'
import { playSound } from '@/core/audio'
import { S } from '@/data/strings'
import { getGame } from '@/games/registry'
import { inkPath } from '@/ui/art/ink'
import InkDivider from '@/ui/InkDivider.vue'
import MenuButton from '@/ui/MenuButton.vue'
import RoundButton from '@/ui/RoundButton.vue'

const props = defineProps<{ gameId: string }>()
const game = computed(() => getGame(props.gameId))

const underline = [0, 4099, 8191].map((k) => inkPath([[0, 5], [60, 3], [130, 6], [190, 4]], { width: 5.5, seed: 3 + k, taper: 0.15, pressure: 0.5 }))
const underRed = [0, 4099, 8191].map((k) => inkPath([[160, 5], [190, 4], [222, 5]], { width: 4.5, seed: 8 + k, taper: 0.1 }))

function start() {
  playSound(game.value.category === 'cards' ? 'deal' : 'stone')
  go({ name: 'play', gameId: props.gameId })
}
</script>

<template>
  <section class="lobby">
    <div class="corner"><RoundButton icon="back" :label="S.common.back" @click="back()" /></div>
    <div class="scene"><component :is="game.scene" /></div>
    <InkDivider class="mid" :seed="9" />
    <div class="menu">
      <h1 class="font-display name slide-in">{{ game.name }}</h1>
      <svg class="under swipe" viewBox="-4 0 230 10" aria-hidden="true" style="--i: 2">
        <path v-for="(d, i) in underline" :key="i" :d="d" fill="var(--color-ink)" :class="`bv${i}`" />
        <path v-for="(d, i) in underRed" :key="`r${i}`" :d="d" fill="var(--color-red)" :class="`bv${i}`" />
      </svg>
      <p class="summary slide-in" style="--i: 1">{{ game.summary }}</p>
      <div class="buttons">
        <MenuButton class="slide-in" style="--i: 2" primary size="lg" icon="play" :label="S.lobby.start" :sub="S.lobby.startSub" :seed="3" @click="start" />
        <MenuButton class="slide-in" style="--i: 3" icon="tutor" :label="S.lobby.tutorial" :sub="S.lobby.tutorialSub" :seed="5" @click="go({ name: 'tutorial', gameId })" />
        <MenuButton class="slide-in" style="--i: 4" icon="book" :label="S.lobby.rules" :sub="game.rulesSub" :seed="7" @click="go({ name: 'rules', gameId })" />
        <MenuButton class="slide-in" style="--i: 5" icon="gear" :label="S.lobby.settings" :sub="S.lobby.settingsSub" :seed="9" @click="go({ name: 'settings', gameId })" />
      </div>
      <p v-if="game.record" class="record font-display slide-in" style="--i: 6">{{ game.record() }}</p>
    </div>
  </section>
</template>

<style scoped>
.lobby {
  position: relative;
  display: flex;
  height: 100%;
  padding: 0.6rem max(1.4rem, env(safe-area-inset-right)) 0.6rem max(1rem, env(safe-area-inset-left));
}
.corner {
  position: absolute;
  left: max(1rem, env(safe-area-inset-left));
  top: max(0.7rem, env(safe-area-inset-top));
  z-index: 3;
}
.scene {
  position: relative;
  min-width: 0;
  flex: 1;
}
.mid {
  height: 92%;
  align-self: center;
  margin: 0 1.4rem 0 0.8rem;
}
.menu {
  display: flex;
  width: 19.5rem;
  flex-shrink: 0;
  flex-direction: column;
  justify-content: center;
}
.name {
  font-size: 2.2rem;
  font-weight: 900;
  line-height: 1.1;
}
.under {
  display: block;
  width: 12rem;
  height: 0.6rem;
  margin: 0.45rem 0 0.35rem;
  overflow: visible;
}
.summary {
  font-size: 0.98rem;
  color: var(--color-near);
}
.buttons {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.7rem;
}
.record {
  margin-top: 0.7rem;
  font-size: 0.72rem;
  color: var(--color-mid);
}
</style>
