<script setup lang="ts">
// 西洋跳棋互動教學：4 課（往前斜走、跳過去吃、連吃、升王），每一課一個小盤面，照著發亮的提示做一步就過關
import { computed, ref, shallowRef } from 'vue'
import { playSound } from '@/core/audio'
import { online } from '@/core/online'
import { myLook } from '@/core/profile'
import { S } from '@/data/strings'
import { applyCheckers, fromRows, legalMoves, type Cell, type CheckersState } from '@/engine/checkers/rules'
import Avatar from '@/ui/art/Avatar.vue'
import Btn from '@/ui/Btn.vue'
import GuideNote from '@/ui/GuideNote.vue'
import IconBtn from '@/ui/IconBtn.vue'
import CheckersBoard from './CheckersBoard.vue'

const emit = defineEmits<{ exit: []; play: []; rules: [] }>()
const T = S.checkers
const sq = (r: number, c: number) => r * 8 + c

interface Lesson {
  rows: string[]
  /** 要動的那顆、要停在哪一格 */
  from: number
  to: number
}
const LESSONS: Lesson[] = [
  { rows: ['........', '........', '........', '........', '........', '..x.....', '........', '........'], from: sq(5, 2), to: sq(4, 3) },
  { rows: ['........', '........', '........', '........', '...o....', '..x.....', '........', '........'], from: sq(5, 2), to: sq(3, 4) },
  { rows: ['........', '........', '.....o..', '........', '...o....', '..x.....', '........', '........'], from: sq(5, 2), to: sq(1, 6) },
  { rows: ['........', '..x.....', '........', '........', '........', '........', '........', '........'], from: sq(1, 2), to: sq(0, 3) },
]

const step = ref(0)
const solved = ref(false)
const misses = ref(0)
const finished = ref(false)
const selected = ref(-1)
const build = () => fromRows(LESSONS[step.value].rows)
const state = shallowRef<CheckersState>(build())
const last = shallowRef<{ path: number[]; captured: { i: number; c: Cell }[] } | null>(null)
const moveKey = ref(0)
const lesson = computed(() => LESSONS[step.value])
const text = computed(() => T.tutorial[step.value])
const moves = computed(() => (solved.value || finished.value ? [] : legalMoves(state.value)))
const targets = computed(() => (selected.value >= 0 ? moves.value.filter((m) => m.path[0] === selected.value).map((m) => m.path[m.path.length - 1]) : []))
// 還沒選子時亮起要動的那顆；選了之後亮起要去的那一格
const glow = computed(() => (solved.value || finished.value ? [] : [selected.value < 0 ? lesson.value.from : lesson.value.to]))

function pick(i: number) {
  if (solved.value || finished.value) return
  const l = lesson.value
  if (i === l.from && selected.value < 0) {
    selected.value = i
    playSound('piecePick')
    return
  }
  if (selected.value < 0 || !targets.value.includes(i)) {
    misses.value++
    playSound('error')
    selected.value = -1
    return
  }
  const m = moves.value.find((x) => x.path[0] === selected.value && x.path[x.path.length - 1] === i)!
  const before = state.value
  const r = applyCheckers(before, { type: 'move', path: m.path })
  selected.value = -1
  if (!r.ok) return
  last.value = { path: m.path, captured: m.captured.map((c) => ({ i: c, c: before.board[c] })) }
  state.value = r.state
  moveKey.value++
  playSound(m.captured.length ? 'chessCapture' : 'piece')
  if (i === l.to) return pass()
  // 走了但不是這一課要的：先讓你看到，再退回來
  misses.value++
  window.setTimeout(() => {
    state.value = build()
    last.value = null
    moveKey.value++
  }, 800)
}
function pass() {
  solved.value = true
  window.setTimeout(() => playSound('correct'), 300)
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
  last.value = null
  state.value = build()
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
        <CheckersBoard :key="step" :board="state.board" :selected="selected" :targets="targets" :last="last" :move-key="moveKey" :hints="glow" :interactive="!solved && !finished" @pick="pick" />
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
/* 棋盤正方形：在剩下的空間裡放到最大 */
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
  width: min(100cqw, 100cqh);
  aspect-ratio: 1;
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
