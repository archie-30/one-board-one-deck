<script setup lang="ts">
// 選擇畫面：左邊一欄標題，中間「撲克牌」、右邊「棋盤」兩塊大面板。
// 滑鼠移上去：游標處先染一小圈顏色、圖微微動（預覽）。點一下：整塊染色、圖動起來；再點一下：進入模式選單。
import { ref } from 'vue'
import { back, go } from '@/core/nav'
import { playSound } from '@/core/audio'
import { S } from '@/data/strings'
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
  if (picked.value !== side) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    origin.value = { x: `${event.clientX - rect.left}px`, y: `${event.clientY - rect.top}px` }
    picked.value = side
    playSound(side === 'cards' ? 'card' : 'stone')
    return
  }
  playSound('tap')
  go({ name: 'category', category: side })
}

// 滑鼠移動時，讓預覽的色圈跟著游標（只在還沒選起時）
function hover(side: GameCategory, event: PointerEvent) {
  if (event.pointerType !== 'mouse' || picked.value === side) return
  hovered.value = side
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  origin.value = { x: `${event.clientX - rect.left}px`, y: `${event.clientY - rect.top}px` }
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
      <span class="sub">{{ side === 'cards' ? S.choose.cardsLead : S.choose.boardLead }}</span>
      <span class="go"><span>{{ S.choose.again }}</span><Icon name="arrow" class="ar" /></span>
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
  display: flex;
  width: 28%;
  flex-shrink: 0;
  flex-direction: column;
  padding: 1rem 1.2rem 1.2rem max(1.6rem, env(safe-area-inset-left));
}
.big {
  margin-top: auto;
  font-size: 2.9rem;
  line-height: 1;
  letter-spacing: -0.05em;
  white-space: nowrap;
}
.lead {
  margin-top: 0.6rem;
  font-size: 0.85rem;
  color: var(--color-ink-2);
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
.peek .flood {
  clip-path: circle(3.2rem at var(--ox) var(--oy));
  transition: clip-path 260ms var(--ease-out);
}
.peek .fc {
  --spread: 1.15;
}

.tag,
.name,
.sub,
.go,
.art {
  position: relative;
  transition: color 300ms ease 120ms;
}
.on .tag,
.on .name,
.on .sub,
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
.sub {
  margin-top: 0.3rem;
  font-size: 0.85rem;
  color: var(--color-ink-2);
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
.on .go {
  opacity: 1;
  transform: none;
  transition-delay: 260ms;
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
