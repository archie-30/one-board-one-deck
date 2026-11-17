<script setup lang="ts">
// 暗棋棋盤：4 × 8 的格子，每格一顆圓棋子。蓋著的棋是背面（墨黑＋米白網點），翻開的棋寫中文字（紅／黑）。
// 動畫：剛翻開的棋像翻牌一樣轉過來；走過去的棋從原本那格滑過來；被吃的棋在原地縮小消失。
// 純畫面：點哪一格就往外丟 pick(格子)，規則與輪到誰由外面決定。
import { computed, nextTick, ref, watch } from 'vue'
import { reducedMotion } from '@/core/motion'
import { S } from '@/data/strings'
import { COLS, colOf, colorOf, kindOf, rowOf, type Piece } from '@/engine/banqi/rules'

const props = defineProps<{
  board: readonly (Piece | null)[]
  up: readonly boolean[]
  selected: number
  targets: readonly number[]
  lastMove: { from: number; to: number; flip: boolean } | null
  /** 每走一步就變（觸發動畫用） */
  moveKey: number
  interactive: boolean
  /** 教學用：發亮提示的格子 */
  glow?: readonly number[]
}>()
const emit = defineEmits<{ pick: [i: number] }>()

const cells = computed(() => props.board.map((p, i) => ({ i, p, up: props.up[i] })))
const nameOf = (p: Piece) => S.xiangqi.names[colorOf(p)][kindOf(p) as 'K']
const root = ref<HTMLElement>()

// 走棋：棋子從原本那格滑過來（翻棋：翻面動畫由 CSS 的 .flipin 負責）
watch(
  () => props.moveKey,
  async () => {
    const m = props.lastMove
    if (!m || m.flip || reducedMotion()) return
    await nextTick()
    const el = root.value?.querySelector<HTMLElement>(`[data-i="${m.to}"] .pc`)
    if (!el) return
    const dx = (colOf(m.from) - colOf(m.to)) * 100
    const dy = (rowOf(m.from) - rowOf(m.to)) * 100
    el.animate([{ transform: `translate(${dx}%, ${dy}%) scale(1.08)` }, { transform: 'translate(0, 0) scale(1.08)', offset: 0.8 }, { transform: 'none' }], { duration: 300, easing: 'cubic-bezier(.22,1,.36,1)' })
  },
)
const isFlip = (i: number) => props.lastMove?.flip && props.lastMove.to === i
</script>

<template>
  <div ref="root" class="bq" :style="{ '--cols': COLS }">
    <button
      v-for="c in cells"
      :key="c.i"
      :data-i="c.i"
      class="cell"
      :class="{ sel: selected === c.i, tgt: targets.includes(c.i), last: lastMove && (lastMove.from === c.i || lastMove.to === c.i), glow: glow?.includes(c.i), live: interactive }"
      :aria-label="c.p ? (c.up ? nameOf(c.p) : '?') : ''"
      @click="emit('pick', c.i)"
    >
      <span v-if="c.p" :key="`${c.i}-${c.p}-${c.up}`" class="pc" :class="[c.up ? (colorOf(c.p) === 'r' ? 'red' : 'black') : 'down', { flipin: c.up && isFlip(c.i) }]">
        <svg viewBox="0 0 40 40" aria-hidden="true">
          <circle cx="21.2" cy="21.6" r="17" fill="var(--color-ink)" />
          <circle cx="20" cy="20" r="17" class="disc" stroke="var(--color-ink)" stroke-width="2.4" />
          <template v-if="c.up">
            <circle cx="20" cy="20" r="13.2" fill="none" class="ring" stroke-width="1.2" />
            <text x="20" y="27.5" class="ch">{{ nameOf(c.p) }}</text>
          </template>
          <template v-else>
            <circle cx="20" cy="20" r="11" fill="none" stroke="rgb(251 248 241 / .35)" stroke-width="1.4" stroke-dasharray="2 2.4" />
            <circle cx="20" cy="20" r="3" fill="var(--color-red)" />
          </template>
        </svg>
      </span>
      <span v-if="targets.includes(c.i)" class="dot" :class="{ eat: !!c.p }" />
    </button>
  </div>
</template>

<style scoped>
/* 棋盤：亮黃底、墨黑格線，跟其他棋盤同一家族 */
.bq {
  display: grid;
  width: 100%;
  height: 100%;
  grid-template-columns: repeat(var(--cols), 1fr);
  grid-template-rows: repeat(4, 1fr);
  border: 0.18rem solid var(--color-ink);
  background: var(--color-board);
  box-shadow: 0.35rem 0.35rem 0 var(--color-ink);
}
.cell {
  position: relative;
  display: grid;
  place-items: center;
  border: 0.06rem solid rgb(20 20 20 / 0.55);
  background: none;
  padding: 0;
}
.cell.live {
  cursor: pointer;
}
.cell.last {
  background: rgb(255 74 28 / 0.14);
}
.pc {
  display: block;
  width: 86%;
  aspect-ratio: 1;
  transition: transform 160ms var(--ease-out);
}
.pc svg {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.pc .disc {
  fill: var(--color-card);
}
.pc.down .disc {
  fill: var(--color-ink);
}
.pc.red .ring,
.pc.red .ch {
  stroke: var(--color-red);
  fill: var(--color-red);
}
.pc.black .ring,
.pc.black .ch {
  stroke: var(--color-ink);
  fill: var(--color-ink);
}
.pc .ring {
  fill: none !important;
}
.ch {
  font-size: 19px;
  font-weight: 900;
  text-anchor: middle;
  stroke: none !important;
}
/* 選起來：紅框縮進來再輕輕呼吸，棋子本身不動 */
.cell.sel::after {
  content: '';
  position: absolute;
  inset: 4%;
  border: 0.16rem solid var(--color-red);
  border-radius: 0.3rem;
  animation: sel-in 260ms var(--ease-back) both, breathe 1.6s ease-in-out 260ms infinite;
  pointer-events: none;
}
@keyframes sel-in {
  from {
    transform: scale(1.25);
    opacity: 0;
  }
}
@keyframes breathe {
  50% {
    transform: scale(0.95);
  }
}
/* 教學提示：鈷藍細框呼吸 */
.cell.glow::before {
  content: '';
  position: absolute;
  inset: 8%;
  border: 0.13rem solid var(--color-blue);
  border-radius: 50%;
  box-shadow: 0 0 0.6rem rgb(35 64 217 / 0.35);
  animation: breathe 1.4s ease-in-out infinite;
  pointer-events: none;
}
/* 能走的格子：小圓點；能吃的：一圈紅框 */
.dot {
  position: absolute;
  width: 22%;
  aspect-ratio: 1;
  border-radius: 50%;
  background: rgb(20 20 20 / 0.45);
  pointer-events: none;
}
.dot.eat {
  width: 90%;
  background: none;
  border: 0.16rem solid var(--color-red);
}
/* 翻開：像翻牌一樣轉過來 */
.pc.flipin {
  animation: flip-in 420ms var(--ease-out) both;
}
@keyframes flip-in {
  0% {
    transform: scaleX(0) translateY(-8%);
  }
  60% {
    transform: scaleX(1.06) translateY(-8%);
  }
}
@media (hover: hover) and (pointer: fine) {
  .cell.live:hover .pc {
    transform: translateY(-4%);
  }
}
@media (prefers-reduced-motion: reduce) {
  .pc.flipin,
  .cell.sel::after,
  .cell.glow::before {
    animation: none;
  }
}
</style>
