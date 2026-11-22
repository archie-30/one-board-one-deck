<script setup lang="ts">
// 「新玩法上架」公告（core/news.ts）：整個畫面的一頁（跟設定頁一樣蓋在最上面），任何螢幕大小都不用捲動。
// 左上大標題、粗黑線，中間每個新玩法一大格（上半是模式卡片的封面，會動；下半是名字、分類、一句話說明），右下「知道了」。
// 點一格就關掉、到那個分類的模式選單並停在那個玩法；Esc、Android 返回鍵（data-back）＝知道了。
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { playSound } from '@/core/audio'
import { go } from '@/core/nav'
import { newsOpen } from '@/core/news'
import { settings } from '@/core/settings'
import { NEWS } from '@/data/news'
import { S } from '@/data/strings'
import { getGame } from '@/games/registry'
import Btn from './Btn.vue'

const T = S.app
const games = computed(() => NEWS.games.map((id) => getGame(id)).filter((g) => g.id && NEWS.games.includes(g.id)))
function close() {
  newsOpen.value = false
}
function open(id: string) {
  const g = getGame(id)
  playSound('tap')
  settings.lastGame[g.category] = g.id
  newsOpen.value = false
  window.setTimeout(() => go({ name: 'category', category: g.category }), 220)
}
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' || !newsOpen.value) return
  e.preventDefault()
  e.stopPropagation()
  close()
}
onMounted(() => window.addEventListener('keydown', onKey, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <Transition name="np">
    <!-- role=dialog：Android 返回鍵（core/native.ts）找最上面的視窗，按它的 data-back 按鈕 -->
    <section v-if="newsOpen" class="np" role="dialog" aria-modal="true">
      <div class="backdrop" />
      <header class="head">
        <h1 class="t-black title"><span class="mask"><span>{{ T.newsTitle }}</span></span></h1>
        <p class="t-label rise badge" style="--i: 2">{{ T.newsLabel }}</p>
      </header>
      <div class="rule wipe" style="--i: 2" />
      <p class="lead rise" style="--i: 2">{{ T.newsLead }}</p>
      <div class="tiles">
        <button v-for="(g, i) in games" :key="g.id" class="tile rise" :class="g.category" :style="{ '--i': i + 3 }" @click="open(g.id)">
          <span class="cv halftone"><component :is="g.cover" active /></span>
          <span class="info">
            <span class="row">
              <span class="nm t-black">{{ g.name }}</span>
              <span class="cat t-label">{{ g.category === 'cards' ? T.newsCards : T.newsBoard }}</span>
              <span class="go t-label">{{ T.newsGo }}</span>
            </span>
            <span class="sm">{{ g.summary }}</span>
          </span>
        </button>
      </div>
      <footer class="foot rise" style="--i: 5">
        <Btn tone="ink" arrow data-back @click="close">{{ T.newsOk }}</Btn>
      </footer>
    </section>
  </Transition>
</template>

<style scoped>
/* 整個畫面：蓋在所有東西上面，內縮跟 #app 一樣避開鏡頭 */
.np {
  position: fixed;
  inset: 0;
  z-index: 960;
  display: flex;
  flex-direction: column;
  padding: calc(0.9rem + var(--cut-t)) calc(1.6rem + var(--cut-r)) calc(0.8rem + var(--cut-b)) calc(1.6rem + var(--cut-l));
}
.backdrop {
  position: absolute;
  inset: 0;
  z-index: -1;
  background: var(--color-paper);
}
.head {
  display: flex;
  align-items: baseline;
  gap: 1.2rem;
}
.title {
  font-size: 2.3rem;
  line-height: 1.1;
}
.badge {
  padding: 0.05rem 0.5rem;
  background: var(--color-yellow);
  border: 0.12rem solid var(--color-ink);
}
.rule {
  height: 0.22rem;
  margin: 0.35rem 0 0.5rem;
  background: var(--color-ink);
}
.lead {
  font-size: 0.95rem;
  color: var(--color-ink-2);
}
/* 中間：每個玩法一大格，平分剩下的高度、寬度（不會超出畫面、不用捲） */
.tiles {
  display: grid;
  min-height: 0;
  flex: 1;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  gap: 1.4rem;
  padding: 0.7rem 0.45rem 0.9rem 0;
}
.tile {
  --tone: var(--color-red);
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  border: 0.16rem solid var(--color-ink);
  border-radius: 0.5rem;
  background: var(--color-card);
  padding: 0;
  text-align: left;
  box-shadow: 0.35rem 0.35rem 0 var(--color-ink);
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
  inset: -0.35rem;
}
.tile:active {
  translate: 0.35rem 0.35rem;
  box-shadow: none;
}
@media (hover: hover) and (pointer: fine) {
  .tile:hover {
    translate: 0 -0.2rem;
  }
}
/* 縮圖：跟模式卡片一樣的封面插圖（分類色底＋網點），佔剩下的高度 */
.cv {
  display: block;
  min-height: 0;
  flex: 1;
  border-bottom: 0.16rem solid var(--color-ink);
  background-color: var(--tone);
  padding: 0.6rem;
}
/* 只撐開封面最外層那張圖（裡面的牌也是 svg，不能一起撐開，不然會變形） */
.cv > :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}
.info {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.6rem 0.9rem 0.75rem;
}
.row {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}
.nm {
  font-size: 1.45rem;
  line-height: 1.2;
}
.cat {
  padding: 0.05rem 0.35rem;
  background: var(--tone);
  color: var(--color-card);
}
.go {
  margin-left: auto;
  color: var(--tone);
}
.sm {
  font-size: 0.85rem;
  line-height: 1.5;
  color: var(--color-ink-2);
}
.foot {
  display: flex;
  justify-content: flex-end;
}
.np-enter-active {
  transition:
    opacity 220ms var(--ease-out),
    transform 320ms var(--ease-out);
}
.np-leave-active {
  transition:
    opacity 200ms cubic-bezier(0.4, 0, 1, 1),
    transform 200ms cubic-bezier(0.4, 0, 1, 1);
}
.np-enter-from {
  opacity: 0;
  transform: translateY(1rem);
}
.np-leave-to {
  opacity: 0;
  transform: translateY(0.8rem);
}
@media (prefers-reduced-motion: reduce) {
  .np-enter-active,
  .np-leave-active {
    transition: none;
  }
}
</style>
