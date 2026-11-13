<script setup lang="ts">
// 模式選單：左半邊是各模式的卡片（整張卡片都能點，一次選一張），
// 右半邊是選中模式的介紹、最常用的「開始遊戲」大按鈕，以及比較少用的小按鈕（教學、規則、設定）。
// 滑鼠移到卡片上：卡片浮起、插圖先動起來預覽；點下去才真正選起。
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
const hoverId = ref<string | null>(null)
const pad = (n: number) => String(n).padStart(2, '0')

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
      <p class="t-label rise pk" style="--i: 1">{{ S.lobby.pickGame }}</p>
    </header>
    <div class="rule wipe" style="--i: 1" />

    <div class="body">
      <div class="cards" role="radiogroup">
        <button
          v-for="(g, i) in games"
          :key="g.id"
          class="card rise"
          :class="{ on: g.id === game.id, peek: hoverId === g.id && g.id !== game.id }"
          :style="{ '--i': 1 + i }"
          role="radio"
          :aria-checked="g.id === game.id"
          @click="pick(g.id)"
          @pointerenter="$event.pointerType === 'mouse' && (hoverId = g.id)"
          @pointerleave="hoverId = null"
        >
          <span class="cover halftone"><component :is="g.cover" :active="g.id === game.id || hoverId === g.id" /></span>
          <span class="info">
            <span class="t-slab no">{{ pad(i + 1) }}</span>
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
        </div>
        <div class="acts">
          <Btn class="rise" style="--i: 3" tone="red" size="lg" arrow block @click="open('play')">{{ S.lobby.start }}</Btn>
          <div class="minor rise" style="--i: 4">
            <button class="link" @click="open('tutorial')"><span>{{ S.lobby.tutorial }}</span><Icon name="arrow" class="ar" /></button>
            <button class="link" @click="open('rules')"><span>{{ S.lobby.rules }}</span><Icon name="arrow" class="ar" /></button>
            <button v-if="game.settings.length" class="link" @click="open('settings')"><span>{{ S.lobby.settings }}</span><Icon name="arrow" class="ar" /></button>
          </div>
          <p v-if="game.record" :key="game.id" class="t-label record rise" style="--i: 5">{{ game.record() }}</p>
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
  --tone: var(--color-red);
}
.mode.c-board {
  --tone: var(--color-blue);
}
.head {
  display: flex;
  align-items: center;
  gap: 0.9rem;
}
.title {
  font-size: 2rem;
  line-height: 1.15;
  letter-spacing: -0.04em;
}
.pk {
  margin-left: auto;
}
.rule {
  height: 0.22rem;
  margin-top: 0.45rem;
  background: var(--color-ink);
}
.body {
  display: flex;
  min-height: 0;
  flex: 1;
  gap: 1.8rem;
  padding-top: 1rem;
}
.cards {
  display: flex;
  min-width: 0;
  flex: 1.25;
  gap: 1.1rem;
  padding: 0 0.3rem 0.3rem 0;
}
/* 卡片：米白底、黑框、右下實心陰影。選起時浮起、陰影拉長，插圖底色染上分類色。 */
.card {
  position: relative;
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  border: 0.14rem solid var(--color-ink);
  border-radius: 0.5rem;
  background: var(--color-card);
  padding: 0;
  text-align: left;
  box-shadow: 0.22rem 0.22rem 0 var(--color-ink);
  transition:
    transform 220ms var(--ease-out),
    box-shadow 220ms var(--ease-out);
}
.card.on {
  transform: translate(-0.15rem, -0.2rem);
  box-shadow: 0.4rem 0.45rem 0 var(--color-ink);
}
.card:active {
  transform: translate(0.12rem, 0.12rem);
  box-shadow: 0.08rem 0.08rem 0 var(--color-ink);
}
.cover {
  position: relative;
  display: block;
  min-height: 0;
  flex: 1;
  padding: 0.7rem 0.5rem 0.4rem;
  border-bottom: 0.14rem solid var(--color-ink);
  border-radius: 0.36rem 0.36rem 0 0;
  background-color: var(--color-paper-2);
  --dot: rgb(20 20 20 / 0.1);
  transition: background-color 260ms ease;
}
.on .cover {
  background-color: var(--tone);
  --dot: rgb(251 248 241 / 0.18);
}
.info {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  padding: 0.5rem 0.8rem 0.7rem;
}
.no {
  font-size: 0.85rem;
  color: var(--color-red);
}
.nm {
  font-size: 1.35rem;
  line-height: 1.2;
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
  margin-top: 0.35rem;
}
.tag {
  padding: 0 0.4rem;
  border: 0.08rem solid var(--color-ink);
  font-size: 0.6rem;
  font-weight: 900;
}
.on .tag {
  background: var(--color-yellow);
}
.check {
  position: absolute;
  right: 0.6rem;
  top: 0.6rem;
  display: grid;
  width: 1.6rem;
  height: 1.6rem;
  place-items: center;
  border: 0.13rem solid var(--color-ink);
  border-radius: 50%;
  background: var(--color-card);
  color: transparent;
  transition: transform 300ms var(--ease-back);
}
.check svg {
  width: 0.85rem;
}
.on .check {
  background: var(--color-yellow);
  color: var(--color-ink);
  transform: scale(1.1) rotate(-8deg);
}
.panel {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  justify-content: space-between;
}
.name {
  margin-top: 0.1rem;
  font-size: 3.2rem;
  line-height: 1;
  letter-spacing: -0.04em;
}
.summary {
  margin-top: 0.45rem;
  font-size: 0.9rem;
  color: var(--color-ink-2);
}
.acts {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}
/* 少用的按鈕：一排細線分隔的小字列，滑鼠移上去箭頭往前推 */
.minor {
  display: flex;
  border-top: 0.14rem solid var(--color-ink);
  border-bottom: 0.08rem solid var(--color-ink);
}
.link {
  position: relative;
  display: inline-flex;
  flex: 1;
  align-items: center;
  gap: 0.35rem;
  border: 0;
  background: none;
  padding: 0.5rem 0.6rem;
  font-size: 0.8rem;
  font-weight: 900;
  white-space: nowrap;
  overflow: hidden;
}
.link + .link {
  border-left: 0.08rem solid var(--color-ink);
}
.link::before {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--color-ink);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 240ms var(--ease-out);
}
.link > * {
  position: relative;
}
.ar {
  width: 0.9rem;
  margin-left: auto;
  transition: transform 220ms var(--ease-out);
}
.link:active::before {
  transform: none;
}
.link:active {
  color: var(--color-card);
}
.record {
  color: var(--color-ink-3);
  letter-spacing: 0.1em;
}
@media (hover: hover) and (pointer: fine) {
  .card.peek {
    transform: translate(-0.08rem, -0.1rem);
    box-shadow: 0.3rem 0.32rem 0 var(--color-ink);
  }
  .card.peek .cover {
    background-color: color-mix(in srgb, var(--tone) 22%, var(--color-paper-2));
  }
  .link:hover .ar {
    transform: translateX(0.3rem);
  }
  .link:hover {
    color: var(--color-red);
  }
}
</style>
