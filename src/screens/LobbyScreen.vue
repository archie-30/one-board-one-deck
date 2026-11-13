<script setup lang="ts">
// 大廳：左邊是這個遊戲的色塊（和選擇畫面的面板是同一個元素，會變形過來），
// 右邊是超大標題與一排編號選項。
import { computed } from 'vue'
import { back, go } from '@/core/nav'
import { playSound } from '@/core/audio'
import { S } from '@/data/strings'
import { getGame } from '@/games/registry'
import Icon from '@/ui/art/Icon.vue'
import IconBtn from '@/ui/IconBtn.vue'

const props = defineProps<{ gameId: string }>()
const game = computed(() => getGame(props.gameId))
const cards = computed(() => game.value.category === 'cards')

const rows = computed(() => [
  { key: 'play', label: S.lobby.start, sub: S.lobby.startSub, primary: true },
  { key: 'tutorial', label: S.lobby.tutorial, sub: S.lobby.tutorialSub },
  { key: 'rules', label: S.lobby.rules, sub: game.value.rulesSub },
  { key: 'settings', label: S.lobby.settings, sub: S.lobby.settingsSub },
])

function open(key: string) {
  playSound(key === 'play' ? (cards.value ? 'deal' : 'stone') : 'tap')
  go({ name: key as 'play' | 'tutorial' | 'rules' | 'settings', gameId: props.gameId })
}
</script>

<template>
  <section class="lobby">
    <div class="block halftone" :class="cards ? 'red' : 'blue'" style="view-transition-name: hero">
      <span class="t-label tag">{{ cards ? S.choose.cardsTag : S.choose.boardTag }}</span>
      <div class="scene"><component :is="game.scene" /></div>
    </div>
    <div class="corner"><IconBtn icon="back" :label="S.common.back" @click="back()" /></div>

    <div class="menu">
      <p class="t-label rise">{{ cards ? S.choose.cards : S.choose.board }} / {{ game.players }}</p>
      <h1 class="t-black name"><span class="mask"><span>{{ game.name }}</span></span></h1>
      <p class="summary rise" style="--i: 2">{{ game.summary }}</p>
      <ol class="rows">
        <li v-for="(row, i) in rows" :key="row.key" class="rise" :style="{ '--i': 3 + i }">
          <button class="row" :class="{ primary: row.primary }" @click="open(row.key)">
            <span class="ink" />
            <span class="t-slab num">{{ String(i + 1).padStart(2, '0') }}</span>
            <span class="txt">
              <span class="lb t-black">{{ row.label }}</span>
              <span class="sb">{{ row.sub }}</span>
            </span>
            <Icon name="arrow" class="ar" />
          </button>
        </li>
      </ol>
      <p v-if="game.record" class="t-label record rise" style="--i: 8">{{ game.record() }}</p>
    </div>
  </section>
</template>

<style scoped>
.lobby {
  position: relative;
  display: flex;
  height: 100%;
}
.block {
  position: relative;
  display: flex;
  width: 42%;
  flex-shrink: 0;
  flex-direction: column;
  padding: 1rem 1.2rem 1rem max(1.4rem, env(safe-area-inset-left));
  border-right: 0.14rem solid var(--color-ink);
  color: var(--color-card);
  --dot: rgb(251 248 241 / 0.16);
}
.red {
  background-color: var(--color-red);
}
.blue {
  background-color: var(--color-blue);
}
.tag {
  align-self: flex-end;
}
.scene {
  position: relative;
  min-height: 0;
  flex: 1;
}
.corner {
  position: absolute;
  left: max(1rem, env(safe-area-inset-left));
  top: max(0.8rem, env(safe-area-inset-top));
  z-index: 3;
}
.menu {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  justify-content: center;
  padding: 0.8rem max(1.6rem, env(safe-area-inset-right)) 0.8rem 1.6rem;
}
.name {
  margin-top: 0.2rem;
  font-size: 3.4rem;
  line-height: 1;
  letter-spacing: -0.04em;
}
.summary {
  margin-top: 0.45rem;
  font-size: 0.9rem;
  color: var(--color-ink-2);
}
.rows {
  margin-top: 0.8rem;
  border-top: 0.14rem solid var(--color-ink);
}
.row {
  position: relative;
  display: flex;
  width: 100%;
  align-items: center;
  gap: 0.9rem;
  border: 0;
  border-bottom: 0.08rem solid var(--color-ink);
  background: none;
  padding: 0.42rem 0.4rem;
  text-align: left;
  overflow: hidden;
}
/* 按下時黑色由左刷過去、字反白 */
.ink {
  position: absolute;
  inset: 0;
  background: var(--color-ink);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 260ms var(--ease-out);
}
.num {
  position: relative;
  width: 1.8rem;
  font-size: 1rem;
  color: var(--color-red);
}
.txt {
  position: relative;
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: baseline;
  gap: 0.8rem;
}
.lb {
  font-size: 1.3rem;
  line-height: 1.3;
  white-space: nowrap;
}
.primary .lb {
  font-size: 1.55rem;
}
.sb {
  overflow: hidden;
  font-size: 0.75rem;
  color: var(--color-ink-2);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ar {
  position: relative;
  width: 1.3rem;
  flex-shrink: 0;
  transition: transform 220ms var(--ease-out);
}
.primary .ar {
  color: var(--color-red);
}
.row:active .ink {
  transform: none;
}
.row:active .lb,
.row:active .sb,
.row:active .ar {
  color: var(--color-card);
}
.row:active .ar {
  transform: translateX(0.35rem);
}
@media (hover: hover) and (pointer: fine) {
  .row:hover .ar {
    transform: translateX(0.35rem);
  }
}
.record {
  margin-top: 0.8rem;
  color: var(--color-ink-3);
  letter-spacing: 0.1em;
}
</style>
