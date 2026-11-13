<script setup lang="ts">
// 模式選單：左半邊是各模式的卡片，疊成一疊、可以左右滑（最前面那張就是選中的模式），
// 右半邊是選中模式的介紹、最常用的「開始遊戲」大按鈕，以及比較少用的小按鈕（教學、規則、設定）。
// 滑：手指（或滑鼠）按住最前面那張左右拖，放開後換下一張／上一張；也可以點後面露出來的卡片、按左右箭頭。
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
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
const n = computed(() => games.value.length)
const start = games.value.findIndex((g) => g.id === settings.lastGame[props.category])
const index = ref(start >= 0 ? start : 0)
const game = computed(() => games.value[index.value])
const hoverId = ref<string | null>(null)
const pad = (k: number) => String(k).padStart(2, '0')

function show(k: number) {
  const next = Math.min(n.value - 1, Math.max(0, k))
  if (next === index.value) return
  index.value = next
  settings.lastGame[props.category] = games.value[next].id
  playSound('card')
}
function open(name: 'play' | 'tutorial' | 'rules' | 'settings') {
  if (name === 'play') playSound(props.category === 'cards' ? 'deal' : 'stone')
  go({ name, gameId: game.value.id })
}

// ── 一疊卡片：最前面那張完整顯示，後面的往右側露出一條、越後面越小越淡；
//    往左滑時前面那張整張滑出去，下一張放大補上。拖曳時跟著手指連續變化。 ──
const deckEl = ref<HTMLElement>()
const cardW = ref(220)
const dragX = ref(0)
const dragging = ref(false)
let x0 = 0
let pid = -1
let moved = false
let ro: ResizeObserver | undefined
onMounted(() => {
  const measure = () => {
    const el = deckEl.value?.querySelector<HTMLElement>('.card')
    if (el) cardW.value = el.offsetWidth
  }
  measure()
  ro = new ResizeObserver(measure)
  if (deckEl.value) ro.observe(deckEl.value)
})
onBeforeUnmount(() => ro?.disconnect())

/** 目前「位置」：整數 = 停在某張；拖曳時是小數。頭尾拉不過去，會有一點阻力。 */
const pos = computed(() => {
  let p = index.value - dragX.value / (cardW.value * 0.9)
  if (p < 0) p = p * 0.3
  if (p > n.value - 1) p = n.value - 1 + (p - (n.value - 1)) * 0.3
  return p
})
const rel = (k: number) => k - pos.value
const PEEK = 26

function onDown(e: PointerEvent) {
  if (e.button !== undefined && e.button > 0) return
  pid = e.pointerId
  x0 = e.clientX
  moved = false
  dragging.value = true
  deckEl.value?.setPointerCapture(e.pointerId)
}
function onMove(e: PointerEvent) {
  if (!dragging.value || e.pointerId !== pid) return
  dragX.value = e.clientX - x0
  if (Math.abs(dragX.value) > 6) moved = true
}
function onUp(e: PointerEvent) {
  if (!dragging.value || e.pointerId !== pid) return
  dragging.value = false
  const target = Math.round(pos.value + Math.sign(-dragX.value) * 0.25 * (Math.abs(dragX.value) > 30 ? 1 : 0))
  dragX.value = 0
  show(target)
}
function onClick(k: number) {
  if (moved) return
  if (k !== index.value) show(k)
}
function cardStyle(k: number) {
  const r = rel(k)
  let x: number
  let sc: number
  let op: number
  let fade: number
  if (r < 0) {
    // 已經滑過去的：往左整張滑出，快出去時才淡掉
    x = r * cardW.value * 1.15
    sc = 1
    op = Math.min(1, Math.max(0, (1 + r) * 2.5))
    fade = 0
  } else {
    x = r * PEEK
    sc = Math.max(0.6, 1 - r * 0.09)
    op = r > 3 ? 0 : 1
    // 後面的卡片不透明，只是蓋上一層紙色，看起來越後面越淡
    fade = Math.min(0.75, r * 0.3)
  }
  const style: Record<string, string | number> = {
    zIndex: 100 - Math.round(r * 10),
    opacity: op,
    '--fade': fade,
    transform: `translateX(${x}px) scale(${sc})`,
  }
  if (dragging.value) style.transition = 'none'
  return style
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowRight') show(index.value + 1)
  else if (e.key === 'ArrowLeft') show(index.value - 1)
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
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
      <div class="deck-wrap">
        <div
          ref="deckEl"
          class="deck"
          role="listbox"
          :aria-activedescendant="`mode-${game.id}`"
          @pointerdown="onDown"
          @pointermove="onMove"
          @pointerup="onUp"
          @pointercancel="onUp"
        >
          <button
            v-for="(g, k) in games"
            :id="`mode-${g.id}`"
            :key="g.id"
            class="card"
            :class="{ front: k === index, past: k < index, peek: hoverId === g.id && k > index }"
            :style="cardStyle(k)"
            role="option"
            :aria-selected="k === index"
            :tabindex="k === index ? 0 : -1"
            @click="onClick(k)"
            @pointerenter="$event.pointerType === 'mouse' && (hoverId = g.id)"
            @pointerleave="hoverId = null"
          >
            <span class="cover halftone"><component :is="g.cover" :active="k === index || hoverId === g.id" /></span>
            <span class="info">
              <span class="t-slab no">{{ pad(k + 1) }}</span>
              <span class="nm t-black">{{ g.name }}</span>
              <span class="sm">{{ g.summary }}</span>
              <span class="tags">
                <span v-for="t in g.tags" :key="t" class="tag">{{ t }}</span>
              </span>
            </span>
          </button>
        </div>
        <div class="pager">
          <button class="arrow prev" :disabled="index === 0" :aria-label="S.common.back" @click="show(index - 1)"><Icon name="arrow" /></button>
          <span class="t-slab count">{{ pad(index + 1) }} <i>/</i> {{ pad(games.length) }}</span>
          <span class="dots">
            <button v-for="(g, k) in games" :key="g.id" class="dot" :class="{ on: k === index }" :aria-label="g.name" @click="show(k)" />
          </span>
          <button class="arrow" :disabled="index === games.length - 1" :aria-label="S.common.next" @click="show(index + 1)"><Icon name="arrow" /></button>
        </div>
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
/* 左半邊：一疊卡片＋下面的翻頁列 */
.deck-wrap {
  display: flex;
  min-width: 0;
  flex: 0.85;
  flex-direction: column;
  gap: 0.6rem;
}
.deck {
  position: relative;
  display: flex;
  min-height: 0;
  flex: 1;
  align-items: center;
  touch-action: pan-y;
  user-select: none;
  animation: rise 520ms var(--ease-out) 80ms both;
}
/* 直式卡片：米白底、黑框、右下實心陰影。位置由 cardStyle 算（往右後方疊、滑過的往左出去）。 */
.card {
  position: absolute;
  left: 0;
  top: 0;
  display: flex;
  height: 100%;
  aspect-ratio: 0.78;
  flex-direction: column;
  border: 0.14rem solid var(--color-ink);
  border-radius: 0.5rem;
  background: var(--color-card);
  padding: 0;
  text-align: left;
  box-shadow: 0.25rem 0.25rem 0 var(--color-ink);
  transform-origin: 100% 50%;
  transition:
    transform 460ms var(--ease-out),
    opacity 360ms ease,
    box-shadow 220ms var(--ease-out);
}
.card:not(.front) {
  cursor: pointer;
}
.card.front {
  box-shadow: 0.4rem 0.45rem 0 var(--color-ink);
  cursor: grab;
}
.card.past {
  pointer-events: none;
}
/* 越後面的卡片蓋上越濃的紙色 */
.card::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 0.36rem;
  background: var(--color-paper);
  opacity: var(--fade, 0);
  pointer-events: none;
  transition: opacity 300ms ease;
}
.deck:active .card::after {
  transition: none;
}
.deck:active .card.front {
  cursor: grabbing;
}
.cover {
  position: relative;
  display: block;
  min-height: 0;
  flex: 1;
  padding: 0.8rem 1rem 0.4rem;
  border-bottom: 0.14rem solid var(--color-ink);
  border-radius: 0.36rem 0.36rem 0 0;
  background-color: var(--color-paper-2);
  --dot: rgb(20 20 20 / 0.1);
  transition: background-color 260ms ease;
  pointer-events: none;
}
.cover {
  background-color: var(--tone);
  --dot: rgb(251 248 241 / 0.18);
}
.info {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  padding: 0.5rem 0.9rem 0.7rem;
  pointer-events: none;
}
.no {
  font-size: 0.85rem;
  color: var(--color-red);
}
.nm {
  font-size: 1.5rem;
  line-height: 1.2;
}
.sm {
  font-size: 0.75rem;
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
.front .tag {
  background: var(--color-yellow);
}
.pager {
  display: flex;
  align-items: center;
  gap: 0.7rem;
}
.arrow {
  display: grid;
  width: 2rem;
  height: 2rem;
  place-items: center;
  border: 0.13rem solid var(--color-ink);
  border-radius: 50%;
  background: var(--color-card);
  padding: 0;
  box-shadow: 0.12rem 0.12rem 0 var(--color-ink);
  transition: transform 110ms var(--ease-out);
}
.arrow svg {
  width: 0.9rem;
}
.arrow.prev svg {
  rotate: 180deg;
}
.arrow:disabled {
  opacity: 0.3;
}
.arrow:active:not(:disabled) {
  transform: translate(0.12rem, 0.12rem);
  box-shadow: none;
}
.count {
  font-size: 0.95rem;
}
.count i {
  font-style: normal;
  color: var(--color-ink-3);
}
.dots {
  display: flex;
  flex: 1;
  justify-content: center;
  gap: 0.35rem;
}
.dot {
  width: 0.55rem;
  height: 0.55rem;
  border: 0.1rem solid var(--color-ink);
  border-radius: 50%;
  background: none;
  padding: 0;
  transition:
    width 260ms var(--ease-out),
    background-color 200ms ease;
}
.dot.on {
  width: 1.4rem;
  border-radius: 999px;
  background: var(--color-ink);
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
  /* 滑鼠移到後面的卡片上：那張往上探出來一點（預覽） */
  .card.peek {
    translate: 0.5rem 0;
  }
  .card {
    transition:
      transform 460ms var(--ease-out),
      opacity 360ms ease,
      translate 200ms var(--ease-out),
      box-shadow 220ms var(--ease-out);
  }
  .link:hover .ar {
    transform: translateX(0.3rem);
  }
  .link:hover {
    color: var(--color-red);
  }
  .arrow:hover:not(:disabled) {
    background: var(--color-yellow);
  }
}
</style>
