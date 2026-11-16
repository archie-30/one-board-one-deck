<script setup lang="ts">
// 主畫面：左邊一欄是遊戲名稱，中間「撲克牌」、右邊「棋盤」兩塊大面板。
// 滑鼠移上去：圖微微動（預覽）。點一下：從點的位置染上顏色、圖動起來，接著直接進入模式選單。
import { ref } from 'vue'
import { reducedMotion } from '@/core/motion'
import { go } from '@/core/nav'
import { playSound } from '@/core/audio'
import { S } from '@/data/strings'
import BoardMini from '@/games/gomoku/BoardMini.vue'
import type { GameCategory } from '@/games/types'
import Card from '@/ui/art/Card.vue'
import Icon from '@/ui/art/Icon.vue'
import IconBtn from '@/ui/IconBtn.vue'
import OnlineDialog from '@/ui/OnlineDialog.vue'
import ProfileChip from '@/ui/ProfileChip.vue'
import AppSettings from './AppSettings.vue'

const picked = ref<GameCategory | null>(null)
const origin = ref({ x: '50%', y: '50%' })
const settingsOpen = ref(false)
const onlineOpen = ref(false)
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
      <!-- 招牌：ONE BOARD／ONE DECK 兩行大字 -->
      <header class="brand t-slab" :aria-label="S.title.label">
        <span class="mask"><span>{{ S.title.brand[0] }}</span></span>
        <span class="mask" style="--i: 1"><span class="red">{{ S.title.brand[1] }}</span></span>
      </header>
      <div class="rule wipe" style="--i: 1" />
      <h1 class="t-black big">
        <span class="mask" style="--i: 1"><span>{{ S.title.line1 }}</span></span>
        <span class="mask" style="--i: 2"><span>{{ S.title.line2 }}</span></span>
      </h1>
      <div class="foot rise" style="--i: 5">
        <ProfileChip />
        <IconBtn icon="gear" :label="S.choose.settings" @click="settingsOpen = true" />
        <IconBtn icon="badge" :label="S.names.open" @click="go({ name: 'names' })" />
      </div>
    </aside>

    <div class="sides">
    <div class="row">
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
    </div>
    <!-- 連線對戰：橫跨撲克牌、棋盤兩塊的底下一條 -->
    <button class="online rise" :class="{ off: picked }" style="--i: 3" @click="onlineOpen = true">
      <span class="fill" />
      <Icon name="online" class="oi" />
      <span class="t-black ot">{{ S.online.open }}</span>
      <span class="t-label ol">{{ S.online.tag }} — {{ S.online.lead }}</span>
      <Icon name="arrow" class="oa" />
    </button>
    </div>

    <OnlineDialog :open="onlineOpen" @close="onlineOpen = false" />
    <AppSettings :open="settingsOpen" @close="settingsOpen = false" />
  </section>
</template>

<style scoped>
.choose {
  display: flex;
  height: 100%;
}
.sides {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}
.row {
  display: flex;
  min-height: 0;
  flex: 1;
}
/* 連線對戰：底下一整條，左邊、上面一條粗黑線接著兩塊面板的框線 */
.online {
  position: relative;
  display: flex;
  height: 3.3rem;
  flex: none;
  align-items: center;
  gap: 0.7rem;
  overflow: hidden;
  border: 0;
  border-top: 0.14rem solid var(--color-ink);
  border-left: 0.14rem solid var(--color-ink);
  background: transparent;
  padding: 0 1.4rem;
  text-align: left;
  transition: opacity 300ms ease;
}
.online.off {
  opacity: 0.35;
  pointer-events: none;
}
/* 滑鼠移上去／按下：亮黃色從左邊鋪過來 */
.online .fill {
  position: absolute;
  inset: 0;
  background: var(--color-yellow);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 360ms var(--ease-out);
}
.online:active .fill {
  transform: scaleX(1);
}
@media (hover: hover) and (pointer: fine) {
  .online:hover .fill {
    transform: scaleX(1);
  }
  .online:hover .oa {
    transform: translateX(0.35rem);
  }
}
.oi,
.ot,
.ol,
.oa {
  position: relative;
}
.oi {
  width: 1.35rem;
  height: 1.35rem;
  color: var(--color-blue);
}
.ot {
  font-size: 1.25rem;
  line-height: 1;
}
.ol {
  color: var(--color-ink-2);
}
.oa {
  width: 1.2rem;
  height: 1.2rem;
  margin-left: auto;
  transition: transform 200ms var(--ease-out);
}
.intro {
  position: relative;
  display: flex;
  width: 36%;
  flex-shrink: 0;
  flex-direction: column;
  padding: 0.9rem 1.2rem 1rem 1.6rem;
}
.brand {
  display: flex;
  flex-direction: column;
  font-size: 1.55rem;
  line-height: 0.98;
  letter-spacing: 0.01em;
  white-space: nowrap;
}
.brand .red {
  color: var(--color-red);
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
.foot > * {
  flex: none;
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
