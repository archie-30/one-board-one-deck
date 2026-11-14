<script setup lang="ts">
// 模式選單：左半邊是各模式的卡片，疊成一疊、可以左右滑（最前面那張就是選中的模式），
// 右半邊是選中模式的介紹、最常用的「開始遊戲」大按鈕，以及比較少用的小按鈕（教學、規則、設定）。
// 滑：手指（或滑鼠）按住最前面那張左右拖，放開後換下一張／上一張；也可以點後面露出來的卡片、按左右箭頭。
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { back, go } from '@/core/nav'
import { playSound } from '@/core/audio'
import { startLaunch } from '@/core/launch'
import { reducedMotion } from '@/core/motion'
import { gamePrefs, settings } from '@/core/settings'
import { S } from '@/data/strings'
import { resolveOptions } from '@/games/options'
import { gamesIn } from '@/games/registry'
import type { GameCategory } from '@/games/types'
import Icon from '@/ui/art/Icon.vue'
import Btn from '@/ui/Btn.vue'
import IconBtn from '@/ui/IconBtn.vue'
import Tabs from '@/ui/Tabs.vue'
import AppSettings from './AppSettings.vue'

const props = defineProps<{ category: GameCategory }>()
const games = computed(() => gamesIn(props.category))
const n = computed(() => games.value.length)
const start = games.value.findIndex((g) => g.id === settings.lastGame[props.category])
/** 目前選中的是第幾張。不繞圈：前面的模式疊在左邊、後面的疊在右邊，到頭尾就停住。 */
const index = ref(start >= 0 ? start : 0)
const game = computed(() => games.value[index.value])
const hoverId = ref<string | null>(null)
const settingsOpen = ref(false)

/** 難度這類常用設定：直接在這裡選，不用進「規則設定」 */
const quick = computed(() => {
  const d = game.value.settings.find((x) => x.key === 'difficulty')
  return d && d.type === 'choice' ? d : null
})
const quickTick = ref(0)
const quickValue = computed(() => {
  void quickTick.value
  return quick.value ? String(resolveOptions(game.value)[quick.value.key]) : ''
})
function setQuick(v: string) {
  if (!quick.value) return
  gamePrefs(game.value.id).options[quick.value.key] = v
  quickTick.value++
}
const pad = (k: number) => String(k).padStart(2, '0')

/** 換到第 k 張 */
function show(k: number) {
  const next = Math.min(n.value - 1, Math.max(0, k))
  if (next === index.value) return
  index.value = next
  settings.lastGame[props.category] = games.value[next].id
  playSound('slide')
}
/** 往右（+）或往左（−）換幾張 */
const turn = (d: number) => show(index.value + d)
function open(name: 'play' | 'tutorial' | 'rules' | 'settings') {
  if (name === 'play') playSound(props.category === 'cards' ? 'shuffle' : 'stonePick')
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

/** 目前轉到的位置：整數 = 停在某張；拖曳時是小數（往左拖 = 往下一張轉） */
const pos = computed(() => {
  let p = index.value - dragX.value / (cardW.value * 0.75)
  // 頭尾拉不過去，會有一點阻力
  if (p < 0) p = p * 0.3
  if (p > n.value - 1) p = n.value - 1 + (p - (n.value - 1)) * 0.3
  return p
})
/** 第 k 張相對中間的位置：0 = 正中間，負的在左、正的在右 */
const rel = (k: number) => k - pos.value

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
  if (!moved) {
    // 沒有拖：當作點一下（拖曳時抓住了指標，點擊事件不會傳到卡片上，所以在這裡找點到哪一張）
    dragX.value = 0
    const hit = document.elementsFromPoint(e.clientX, e.clientY).find((el) => cardEls.includes(el as HTMLElement))
    if (hit) tapCard(cardEls.indexOf(hit as HTMLElement))
    return
  }
  const target = Math.round(pos.value - Math.sign(dragX.value) * 0.25 * (Math.abs(dragX.value) > 30 ? 1 : 0))
  dragX.value = 0
  show(target)
}
function tapCard(k: number) {
  if (k !== index.value) show(k)
  else void launch()
}
/** 鍵盤（Enter／空白鍵）按卡片 */
function onClick(k: number, e: MouseEvent) {
  if (e.detail === 0) tapCard(k)
}
function cardStyle(k: number) {
  const r = rel(k)
  const a = Math.abs(r)
  const sg = Math.sign(r)
  const w = cardW.value
  // 中間那張正面朝前；前面的模式疊在左邊、後面的疊在右邊，往後退、轉個角度朝向中間
  const x = sg * (Math.min(a, 1) * w * 0.42 + Math.max(0, a - 1) * w * 0.12)
  const z = -Math.min(a, 2) * w * 0.5
  const rot = -sg * Math.min(a, 1) * 52
  // 左右最多各看得到兩張；更後面的淡出，改用灰色陰影表示「還有」
  const op = Math.max(0, Math.min(1, (2.6 - a) * 1.7))
  const style: Record<string, string | number> = {
    zIndex: 100 - Math.round(a * 10),
    opacity: op,
    '--fade': Math.min(0.8, a * 0.72),
    transform: `translateX(-50%) translateX(${x}px) translateZ(${z}px) rotateY(${rot}deg)`,
  }
  if (dragging.value) style.transition = 'none'
  return style
}

// ── 點最前面的卡片（或按「開始遊戲」）：卡片放大到整個畫面，同時先把遊戲載好，接著直接開始遊戲 ──
const cardEls: (HTMLElement | null)[] = []
const launching = ref(false)
async function launch() {
  if (launching.value) return
  const el = cardEls[index.value]
  if (!el || reducedMotion()) return open('play')
  launching.value = true
  const g = game.value
  const color = getComputedStyle(el.querySelector('.cover') ?? el).backgroundColor
  playSound(props.category === 'cards' ? 'shuffle' : 'stonePick')
  // 放大的同時先下載遊戲畫面，兩件事都好了才換頁
  const loader = (g.component as { __asyncLoader?: () => Promise<unknown> }).__asyncLoader
  await Promise.all([startLaunch(el, color, g.name, g.players), loader?.().catch(() => {})])
  go({ name: 'play', gameId: g.id })
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowRight') turn(1)
  else if (e.key === 'ArrowLeft') turn(-1)
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
      <IconBtn icon="gear" :label="S.appSettings.title" @click="settingsOpen = true" />
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
          <span v-if="index > 2" class="more left" />
          <span v-if="games.length - 1 - index > 2" class="more right" />
          <button
            v-for="(g, k) in games"
            :id="`mode-${g.id}`"
            :key="g.id"
            :ref="(el) => (cardEls[k] = el as HTMLElement | null)"
            class="card"
            :class="{ front: k === index, peek: hoverId === g.id && k !== index, lifted: launching && k === index }"
            :style="cardStyle(k)"
            role="option"
            :aria-selected="k === index"
            :tabindex="k === index ? 0 : -1"
            @click="onClick(k, $event)"
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
          <button class="arrow prev" :disabled="index === 0" :aria-label="S.common.back" @click="turn(-1)"><Icon name="arrow" /></button>
          <span class="t-slab count">{{ pad(index + 1) }} <i>/</i> {{ pad(games.length) }}</span>
          <span class="dots">
            <button v-for="(g, k) in games" :key="g.id" class="dot" :class="{ on: k === index }" :aria-label="g.name" @click="show(k)" />
          </span>
          <button class="arrow" :disabled="index === games.length - 1" :aria-label="S.common.next" @click="turn(1)"><Icon name="arrow" /></button>
        </div>
      </div>

      <aside class="panel">
        <div :key="game.id" class="detail">
          <p class="t-label rise">{{ game.players }}</p>
          <h2 class="t-black name"><span class="mask"><span>{{ game.name }}</span></span></h2>
          <p class="summary rise" style="--i: 2">{{ game.summary }}</p>
          <div v-if="game.best || quick" class="stats rise" style="--i: 3">
            <p v-if="game.best" class="best">
              <span class="t-label">{{ S.lobby.best }}</span>
              <b class="t-slab">{{ game.best() }}</b>
            </p>
            <div v-if="quick" class="quick" :title="quick.help">
              <span class="t-label">{{ quick.label }}</span>
              <Tabs :choices="quick.choices" :value="quickValue" @change="setQuick" />
            </div>
          </div>
        </div>
        <div class="acts">
          <Btn class="rise" style="--i: 3" tone="red" size="lg" arrow block @click="launch">{{ S.lobby.start }}</Btn>
          <div class="minor rise" style="--i: 4">
            <button class="link" @click="open('tutorial')"><span>{{ S.lobby.tutorial }}</span><Icon name="arrow" class="ar" /></button>
            <button class="link" @click="open('rules')"><span>{{ S.lobby.rules }}</span><Icon name="arrow" class="ar" /></button>
            <button v-if="game.settings.some((d) => d.key !== quick?.key)" class="link" @click="open('settings')"><span>{{ S.lobby.settings }}</span><Icon name="arrow" class="ar" /></button>
          </div>
        </div>
      </aside>
    </div>
    <AppSettings :open="settingsOpen" @close="settingsOpen = false" />

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
  flex: 1.1;
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
/* 3D 透視：兩側的卡片轉個角度往後退 */
.deck {
  perspective: 900px;
  perspective-origin: 50% 45%;
}
/* 直式卡片：米白底、黑框、右下實心陰影。位置由 cardStyle 算（往右後方疊、滑過的往左出去）。 */
.card {
  position: absolute;
  left: 50%;
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
  transform-origin: 50% 50%;
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
/* 進入遊戲時，這張卡片已經被「拿起來」（過場層有一份複製） */
.card.lifted {
  visibility: hidden;
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
  font-size: 2.7rem;
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
.stats {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.4rem 1.4rem;
  margin-top: 0.5rem;
}
.best {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}
.best b {
  font-size: 2.4rem;
  line-height: 1;
  color: var(--color-red);
}
.quick-help {
  margin-top: 0.25rem;
  font-size: 0.7rem;
  color: var(--color-ink-3);
}
/* 左右還有更多卡片時：在那一側加一片灰色漸淡的陰影 */
.more {
  position: absolute;
  top: 6%;
  bottom: 6%;
  z-index: 1;
  width: 3.2rem;
  pointer-events: none;
}
.more.left {
  left: -0.4rem;
  background: linear-gradient(90deg, rgb(20 20 20 / 0.22), transparent);
}
.more.right {
  right: -0.4rem;
  background: linear-gradient(270deg, rgb(20 20 20 / 0.22), transparent);
}
.quick {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
@media (hover: hover) and (pointer: fine) {
  /* 滑鼠移到後面的卡片上：那張往上探出來一點（預覽） */
  /* 滑鼠移到旁邊的卡片上：那張變亮一點（預覽） */
  .card.peek::after {
    opacity: calc(var(--fade, 0) * 0.35);
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
