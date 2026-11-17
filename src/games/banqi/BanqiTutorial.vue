<script setup lang="ts">
// 暗棋互動教學：4 課（翻棋、大吃小、兵吃帥、炮隔子吃），每一課一個小盤面，照著發亮的提示做一步就過關
import { computed, ref, shallowRef } from 'vue'
import { playSound } from '@/core/audio'
import { online } from '@/core/online'
import { myLook } from '@/core/profile'
import { S } from '@/data/strings'
import { applyBanqi, COLS, createBanqi, SIZE, targetsFrom, type BanqiState, type Piece } from '@/engine/banqi/rules'
import Avatar from '@/ui/art/Avatar.vue'
import Btn from '@/ui/Btn.vue'
import GuideNote from '@/ui/GuideNote.vue'
import IconBtn from '@/ui/IconBtn.vue'
import BanqiBoard from './BanqiBoard.vue'

const emit = defineEmits<{ exit: []; play: []; rules: [] }>()
const T = S.banqi
const sq = (r: number, c: number) => r * COLS + c

/** 擺盤：shown 是翻開的棋，hidden 是蓋著的棋；你是紅方、先動 */
function setup(shown: Record<number, Piece>, hidden: Record<number, Piece>, colors = true): BanqiState {
  const board: (Piece | null)[] = Array(SIZE).fill(null)
  const up = Array(SIZE).fill(false)
  for (const [i, p] of Object.entries(shown)) ((board[+i] = p), (up[+i] = true))
  for (const [i, p] of Object.entries(hidden)) board[+i] = p
  const s = createBanqi(board, {}, up)
  return colors ? { ...s, colors: ['r', 'b'] } : s
}
interface Lesson {
  build: () => BanqiState
  /** 要動的那顆（翻棋課是 -1：任何一顆蓋著的都行） */
  from: number
  to: number
}
const LESSONS: Lesson[] = [
  {
    build: () => setup({}, { [sq(1, 2)]: 'R', [sq(1, 3)]: 'n', [sq(1, 4)]: 'C', [sq(1, 5)]: 'p', [sq(2, 2)]: 'k', [sq(2, 3)]: 'P', [sq(2, 4)]: 'b', [sq(2, 5)]: 'A' }, false),
    from: -1,
    to: -1,
  },
  { build: () => setup({ [sq(1, 3)]: 'R', [sq(1, 4)]: 'n' }, { [sq(3, 0)]: 'p', [sq(0, 7)]: 'P' }), from: sq(1, 3), to: sq(1, 4) },
  { build: () => setup({ [sq(2, 3)]: 'P', [sq(2, 4)]: 'k', [sq(1, 3)]: 'a' }, { [sq(0, 0)]: 'n', [sq(3, 7)]: 'B' }), from: sq(2, 3), to: sq(2, 4) },
  { build: () => setup({ [sq(1, 1)]: 'C', [sq(1, 5)]: 'r', [sq(2, 1)]: 'k' }, { [sq(1, 3)]: 'p', [sq(3, 7)]: 'N' }), from: sq(1, 1), to: sq(1, 5) },
]

const step = ref(0)
const solved = ref(false)
const misses = ref(0)
const finished = ref(false)
const selected = ref(-1)
const state = shallowRef<BanqiState>(LESSONS[0].build())
const lesson = computed(() => LESSONS[step.value])
const text = computed(() => T.tutorial[step.value])
const targets = computed(() => (selected.value >= 0 && !solved.value ? targetsFrom(state.value, selected.value) : []))
// 還沒選子時亮起要動的那顆；選了之後亮起要去的那一格；翻棋課亮所有蓋著的棋
const glow = computed(() => {
  if (solved.value || finished.value) return []
  const l = lesson.value
  if (l.from < 0) return state.value.board.map((p, i) => (p && !state.value.up[i] ? i : -1)).filter((i) => i >= 0)
  return [selected.value < 0 ? l.from : l.to]
})
const moveKey = ref(0)

function pick(i: number) {
  if (solved.value || finished.value) return
  const l = lesson.value
  const s = state.value
  if (l.from < 0) {
    if (!s.board[i] || s.up[i]) return
    const r = applyBanqi(s, { type: 'flip', at: i })
    if (!r.ok) return
    state.value = r.state
    moveKey.value++
    playSound('xqPiece')
    return pass()
  }
  if (i === l.from) {
    selected.value = selected.value === i ? -1 : i
    playSound('piecePick')
    return
  }
  if (selected.value < 0 || !targets.value.includes(i)) {
    if (selected.value >= 0 || s.board[i]) ((misses.value++), playSound('error'))
    selected.value = -1
    return
  }
  const r = applyBanqi(s, { type: 'move', from: selected.value, to: i })
  selected.value = -1
  if (!r.ok) return
  const took = r.state.captured.length > s.captured.length
  state.value = r.state
  moveKey.value++
  playSound(took ? 'xqCapture' : 'xqPiece')
  if (i === l.to) return pass()
  // 走了但不是這一課要的：先讓你看到，再退回來
  misses.value++
  window.setTimeout(() => {
    state.value = l.build()
    moveKey.value++
  }, 700)
}
function pass() {
  solved.value = true
  window.setTimeout(() => playSound('correct'), 250)
}
function next() {
  if (step.value + 1 >= LESSONS.length) {
    finished.value = true
    return
  }
  step.value++
  solved.value = false
  misses.value = 0
  selected.value = -1
  state.value = lesson.value.build()
}
</script>

<template>
  <section class="gt">
    <div class="corner"><IconBtn icon="back" :label="S.common.back" @click="emit('exit')" /></div>
    <aside class="side">
      <span class="kid"><Avatar :look="myLook()" :mood="finished || solved ? 'happy' : misses ? 'shock' : 'think'" /></span>
    </aside>
    <div class="board-wrap">
      <div class="board-box">
        <BanqiBoard :key="step" :board="state.board" :up="state.up" :selected="selected" :targets="targets" :last-move="state.lastMove" :move-key="moveKey" :interactive="!solved && !finished" :glow="glow" @pick="pick" />
      </div>
    </div>
    <aside class="guide">
      <GuideNote v-if="!finished" :step="step" :total="LESSONS.length" :text="text.text" :ok="text.ok" :solved="solved" :misses="misses" />
      <div v-else>
        <h2 class="t-black text-[2.4rem] leading-tight"><span class="mask"><span>{{ S.tutorial.finish }}</span></span></h2>
        <p class="text-ink-2">{{ S.tutorial.finishLead }}</p>
      </div>
      <div class="act">
        <template v-if="finished">
          <!-- 在連線房間裡不能自己開局（開始要在房間裡大家準備） -->
          <Btn v-if="!online.room" tone="red" size="lg" arrow block @click="emit('play')">{{ S.tutorial.play }}</Btn>
          <Btn icon="book" size="sm" block @click="emit('rules')">{{ S.tutorial.rules }}</Btn>
          <Btn icon="back" size="sm" block @click="emit('exit')">{{ S.common.back }}</Btn>
        </template>
        <Btn v-else-if="solved" class="rise" tone="red" size="lg" arrow block @click="next">{{ step + 1 >= LESSONS.length ? S.common.done : S.common.next }}</Btn>
      </div>
    </aside>
  </section>
</template>

<style scoped>
.gt {
  position: relative;
  display: flex;
  height: 100%;
  gap: 1.2rem;
  padding: 0.6rem 1.2rem;
}
.side {
  display: flex;
  width: 5rem;
  flex-shrink: 0;
  align-items: flex-end;
  padding-bottom: 1rem;
}
.kid {
  width: 4.2rem;
  height: 4.2rem;
}
.kid :deep(svg) {
  width: 100%;
  height: 100%;
}
/* 棋盤 2:1：在剩下的空間裡放到最大 */
.board-wrap {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  justify-content: center;
  container-type: size;
  animation: rise 520ms var(--ease-out) both;
}
.board-box {
  width: min(100cqw, 200cqh);
  aspect-ratio: 2;
}
.guide {
  display: flex;
  width: 15rem;
  flex-shrink: 0;
  flex-direction: column;
  justify-content: space-between;
  overflow-y: auto;
  padding: 0.8rem 0 0.4rem;
}
.act {
  display: flex;
  width: 10rem;
  flex-direction: column;
  gap: 0.5rem;
  align-self: flex-end;
}
</style>
