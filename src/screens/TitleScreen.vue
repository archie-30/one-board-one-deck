<script setup lang="ts">
// 主畫面：左邊一欄是遊戲名稱，中間「撲克牌」、右邊「棋盤」兩塊大面板。
// 滑鼠移上去：圖微微動（預覽）。點一下：從點的位置染上顏色、圖動起來，接著直接進入模式選單。
import { ref } from 'vue'
import { reducedMotion } from '@/core/motion'
import { go } from '@/core/nav'
import { playSound } from '@/core/audio'
import { S } from '@/data/strings'
import { VERSION } from '@/data/version'
import BoardMini from '@/games/gomoku/BoardMini.vue'
import type { GameCategory } from '@/games/types'
import Card from '@/ui/art/Card.vue'
import Icon from '@/ui/art/Icon.vue'
import IconBtn from '@/ui/IconBtn.vue'
import AppSettings from './AppSettings.vue'

const picked = ref<GameCategory | null>(null)
const origin = ref({ x: '50%', y: '50%' })
const settingsOpen = ref(false)
const hovered = ref<GameCategory | null>(null)
const fan = [
  { rank: 'A', suit: 2 },
  { rank: '2', suit: 3 },
  { rank: 'K', suit: 1 },
]

function tap(side: GameCategory, event: MouseEvent) {
  if (picked.value) return
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  origin.value = { x: `${event.clientX - rect.left}px`, y: `${event.clientY - rect.top}px` }
  picked.value = side
  playSound(side === 'cards' ? 'flip' : 'stone')
  // 顏色染開一點後就進入模式選單
  window.setTimeout(() => go({ name: 'category', category: side }), reducedMotion() ? 0 : 340)
}
function hover(side: GameCategory, event: PointerEvent) {
  if (event.pointerType === 'mouse') hovered.value = side
}
</script>

<template>
  <section class="choose home">
    <aside class="intro">
      <header class="top">
        <span class="t-label rise">{{ S.title.label }}</span>
        <span class="t-label rise" style="--i: 1">{{ VERSION.number }}</span>
      </header>
      <div class="rule wipe" style="--i: 1" />
      <h1 class="t-black big">
        <span class="mask" style="--i: 1"><span>{{ S.title.line1 }}</span></span>
        <span class="mask" style="--i: 2"><span>{{ S.title.line2 }}</span></span>
      </h1>
      <div class="foot rise" style="--i: 5">
        <IconBtn icon="gear" :label="S.choose.settings" @click="settingsOpen = true" />
      </div>
    </aside>

    <button
      v-for="side in ['cards', 'board'] as const"
      :key="side"
      class="panel rise"
      :class="[side, { on: picked === side, off: picked && picked !== side, peek: hovered === side && picked !== side }]"
      :style="{ '--i': side === 'cards' ? 1 : 2, '--ox': origin.x, '--oy': origin.y, viewTransitionName: picked === side ? 'hero' : 'none' }"
      @click="tap(side, $event)"
      @pointermove="hover(side, $event)"
      @pointerleave="hovered = null"
    >
      <span class="flood halftone" />
      <span class="t-label tag">{{ side === 'cards' ? S.choose.cardsTag : S.choose.boardTag }}</span>
      <span class="art">
        <svg v-if="side === 'cards'" viewBox="0 0 200 150" class="fan" aria-hidden="true">
          <g v-for="(c, i) in fan" :key="i" class="fc" :style="{ '--a': `${(i - 1) * 16}deg`, '--i': i }">
            <Card :rank="c.rank" :suit="c.suit" transform="translate(64 22)" />
          </g>
        </svg>
        <BoardMini v-else :busy="picked === 'board' || hovered === 'board'" />
      </span>
      <span class="name t-black">{{ side === 'cards' ? S.choose.cards : S.choose.board }}</span>
      <span class="go"><Icon name="arrow" class="ar" /></span>
    </button>

    <AppSettings :open="settingsOpen" @close="settingsOpen = false" />
  </section>
</template>

<style scoped>
.choose {
  display: flex;
  height: 100%;
}
.intro {
  position: relative;
  display: flex;
  width: 36%;
  flex-shrink: 0;
  flex-direction: column;
  padding: 0.9rem 1.2rem 1rem max(1.6rem, env(safe-area-inset-left));
}
.top {
  display: flex;
  justify-content: space-between;
}
.rule {
  height: 0.22rem;
  margin-top: 0.35rem;
  background: var(--color-ink);
}
.big {
  display: flex;
  flex-direction: column;
  margin-top: auto;
  font-size: 3.3rem;
  line-height: 1.02;
  letter-spacing: -0.05em;
  white-space: nowrap;
}
.foot {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  margin-top: 1rem;
}
.panel {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: flex-start;
  border: 0;
  border-left: 0.14rem solid var(--color-ink);
  background: transparent;
  padding: 1.1rem 1.4rem 1.2rem;
  text-align: left;
  overflow: hidden;
  transition: flex-grow 520ms var(--ease-out);
}
.panel.on {
  flex-grow: 1.35;
}
.cards {
  --tone: var(--color-red);
}
.board {
  --tone: var(--color-blue);
}
/* 從點的位置染開的顏色 */
.flood {
  position: absolute;
  inset: 0;
  background-color: var(--tone);
  --dot: rgb(251 248 241 / 0.16);
  clip-path: circle(0% at var(--ox) var(--oy));
  transition: clip-path 620ms var(--ease-in-out);
}
.on .flood {
  clip-path: circle(150% at var(--ox) var(--oy));
}
/* 滑鼠預覽：游標處一小圈顏色跟著走 */
.peek .fc {
  --spread: 1.15;
}

.tag,
.name,
.go,
.art {
  position: relative;
  transition: color 300ms ease 120ms;
}
.on .tag,
.on .name,
.on .go {
  color: var(--color-card);
}
.art {
  display: block;
  width: 100%;
  flex: 1;
  min-height: 0;
  margin: 0.4rem 0;
}
.fan {
  width: 100%;
  height: 100%;
  overflow: visible;
}
.fc {
  transform-box: view-box;
  transform-origin: 100px 140px;
  transform: rotate(calc(var(--a) * var(--spread, 0.8)));
  transition: transform 520ms var(--ease-back);
  transition-delay: calc(var(--i) * 40ms);
}
.on .fc {
  --spread: 1.6;
}
.name {
  font-size: 2.6rem;
  line-height: 1;
}
.off .name,
.off .art {
  opacity: 0.35;
}
.go {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  height: 1.4rem;
  margin-top: 0.4rem;
  font-size: 0.85rem;
  font-weight: 900;
  opacity: 0;
  transform: translateY(0.4rem);
  transition:
    opacity 200ms ease,
    transform 320ms var(--ease-out);
}
.on .go,
.peek .go {
  opacity: 1;
  transform: none;
}
.ar {
  width: 1rem;
  animation: nudge 1.2s ease-in-out infinite;
}
@keyframes nudge {
  50% {
    transform: translateX(0.35rem);
  }
}
</style>
