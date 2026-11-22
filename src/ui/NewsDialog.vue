<script setup lang="ts">
// 「新玩法上架」視窗（core/news.ts）：每個新玩法一格小縮圖（模式卡片的封面，會動）＋名字、一句話說明、分類。
// 點一格就關掉視窗、到那個分類的模式選單並停在那個玩法；「知道了」就只是關掉。
import { computed } from 'vue'
import { playSound } from '@/core/audio'
import { go } from '@/core/nav'
import { newsOpen } from '@/core/news'
import { settings } from '@/core/settings'
import { NEWS } from '@/data/news'
import { S } from '@/data/strings'
import { getGame } from '@/games/registry'
import Btn from './Btn.vue'
import Dialog from './Dialog.vue'

const T = S.app
const games = computed(() => NEWS.games.map((id) => getGame(id)).filter((g) => !!g))
function close() {
  newsOpen.value = false
}
function open(id: string) {
  const g = getGame(id)
  if (!g) return
  playSound('tap')
  settings.lastGame[g.category] = g.id
  newsOpen.value = false
  window.setTimeout(() => go({ name: 'category', category: g.category }), 240)
}
</script>

<template>
  <Dialog :open="newsOpen" :title="T.newsTitle" :label="T.newsLabel" tone="yellow" wide @close="close">
    <p class="lead">{{ T.newsLead }}</p>
    <div class="tiles">
      <button v-for="(g, i) in games" :key="g.id" class="tile rise" :class="g.category" :style="{ '--i': i + 2 }" @click="open(g.id)">
        <span class="cv halftone"><component :is="g.cover" active /></span>
        <span class="info">
          <span class="row">
            <span class="nm t-black">{{ g.name }}</span>
            <span class="cat t-label">{{ g.category === 'cards' ? T.newsCards : T.newsBoard }}</span>
          </span>
          <span class="sm">{{ g.summary }}</span>
        </span>
      </button>
    </div>
    <template #actions>
      <Btn tone="ink" data-back @click="close">{{ T.newsOk }}</Btn>
    </template>
  </Dialog>
</template>

<style scoped>
.lead {
  font-size: 0.9rem;
  color: var(--color-ink-2);
}
.tiles {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.9rem;
  padding-top: 0.55rem;
}
.tile {
  --tone: var(--color-red);
  position: relative;
  display: flex;
  min-width: 0;
  flex-direction: column;
  overflow: hidden;
  border: 0.14rem solid var(--color-ink);
  border-radius: 0.45rem;
  background: var(--color-card);
  padding: 0;
  text-align: left;
  box-shadow: 0.25rem 0.25rem 0 var(--color-ink);
  transition:
    translate 120ms var(--ease-out),
    box-shadow 120ms var(--ease-out);
}
.tile.board {
  --tone: var(--color-blue);
}
/* 整顆會移動：多一圈看不見的點擊範圍 */
.tile::after {
  content: '';
  position: absolute;
  inset: -0.3rem;
}
.tile:active {
  translate: 0.25rem 0.25rem;
  box-shadow: none;
}
@media (hover: hover) and (pointer: fine) {
  .tile:hover {
    translate: 0 -0.15rem;
  }
}
/* 小縮圖：跟模式卡片一樣的封面插圖（分類色底＋網點） */
.cv {
  display: block;
  /* 矮的螢幕（手機橫拿）縮小一點，整個視窗才放得下、說明不會被切掉 */
  height: clamp(3.4rem, 17vh, 6.2rem);
  border-bottom: 0.14rem solid var(--color-ink);
  background-color: var(--tone);
  padding: 0.3rem;
}
.cv :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}
.info {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.45rem 0.6rem 0.55rem;
}
.row {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}
.nm {
  font-size: 1.1rem;
}
.cat {
  padding: 0 0.3rem;
  background: var(--tone);
  color: var(--color-card);
}
.sm {
  font-size: 0.72rem;
  line-height: 1.45;
  color: var(--color-ink-2);
}
</style>
