<script setup lang="ts">
// 步步為營互動教學：4 課（往前走、放牆擋人、跳過對方、斜跳），每一課一個小盤面，照著發亮的提示做一步就過關。
import { computed, ref, shallowRef } from 'vue'
import { playSound } from '@/core/audio'
import { online } from '@/core/online'
import { myLook } from '@/core/profile'
import { S } from '@/data/strings'
import { applyQuoridor, cellAt, createQuoridor, distance, pawnMoves, W, wallProblem, type Orient, type QuoridorState } from '@/engine/quoridor/rules'
import Avatar from '@/ui/art/Avatar.vue'
import Btn from '@/ui/Btn.vue'
import GuideNote from '@/ui/GuideNote.vue'
import IconBtn from '@/ui/IconBtn.vue'
import QuoridorBoard from './QuoridorBoard.vue'

const emit = defineEmits<{ exit: []; play: []; rules: [] }>()
const T = S.quoridor
const wa = (r: number, c: number) => r * W + c

interface Lesson {
  red: number
  blue: number
  /** 已經擺好的牆 */
  walls?: { at: number; o: Orient }[]
  /** 走棋：要走到的格子（任一格都算）；放牆：要放的那道牆（亮起來的） */
  to?: number[]
  wall?: { at: number; o: Orient }
}
const LESSONS: Lesson[] = [
  { red: cellAt(8, 4), blue: cellAt(0, 4), to: [cellAt(7, 4)] },
  // 藍子在第 7 列，下一步就到終點（最下面一列）：在它下面放一道橫牆
  { red: cellAt(2, 4), blue: cellAt(7, 4), wall: { at: wa(7, 4), o: 'h' } },
  { red: cellAt(5, 4), blue: cellAt(4, 4), to: [cellAt(3, 4)] },
  { red: cellAt(5, 4), blue: cellAt(4, 4), walls: [{ at: wa(3, 4), o: 'h' }], to: [cellAt(4, 3), cellAt(4, 5)] },
]

const step = ref(0)
const solved = ref(false)
const misses = ref(0)
const finished = ref(false)
const preview = ref<{ at: number; o: Orient } | null>(null)
function build(): QuoridorState {
  const l = LESSONS[step.value]
  let s: QuoridorState = { ...createQuoridor(), pawns: [l.red, l.blue] }
  for (const w of l.walls ?? []) {
    const h = s.h.slice()
    const v = s.v.slice()
    ;(w.o === 'h' ? h : v)[w.at] = true
    s = { ...s, h, v }
  }
  return s
}
const state = shallowRef<QuoridorState>(build())
const lesson = computed(() => LESSONS[step.value])
const text = computed(() => T.tutorial[step.value])
const wallLesson = computed(() => !!lesson.value.wall)
const targets = computed(() => (solved.value || finished.value || wallLesson.value ? [] : pawnMoves(state.value)))
const glow = computed(() => (solved.value || finished.value ? [] : (lesson.value.to ?? [])))
const shownPreview = computed(() => (preview.value ? { ...preview.value, ok: !wallProblem(state.value, preview.value.at, preview.value.o) } : null))

/** 走棋跟對局一樣按兩下：第一下選好（淡淡的棋子），再點同一格才走 */
const moveTo = ref(-1)
function pick(i: number) {
  if (solved.value || finished.value || wallLesson.value) return
  if (!targets.value.includes(i)) return void (moveTo.value = -1)
  if (moveTo.value !== i) {
    moveTo.value = i
    playSound('piecePick')
    return
  }
  moveTo.value = -1
  const r = applyQuoridor(state.value, { type: 'move', to: i })
  if (!r.ok) return
  state.value = r.state
  playSound('piece')
  if (lesson.value.to!.includes(i)) return pass()
  // 走了但不是這一課要的：先讓你看到，再退回來
  misses.value++
  playSound('error')
  window.setTimeout(() => (state.value = build()), 800)
}
/** 放牆課：點溝先預覽，再點同一道放下去；能把藍子擋得多繞路就算過 */
function tapWall(at: number, o: Orient) {
  if (solved.value || finished.value || !wallLesson.value) return
  const p = preview.value
  if (!p || p.at !== at || p.o !== o) {
    preview.value = { at, o }
    playSound('piecePick')
    return
  }
  const before = distance(state.value, 1)
  const r = applyQuoridor(state.value, { type: 'wall', at, o })
  preview.value = null
  if (!r.ok) {
    misses.value++
    playSound('error')
    return
  }
  state.value = r.state
  playSound('xqPiece')
  if (distance(r.state, 1) > before) return pass()
  misses.value++
  playSound('error')
  window.setTimeout(() => (state.value = build()), 800)
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
  preview.value = null
  moveTo.value = -1
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
        <QuoridorBoard
          :key="step"
          :pawns="state.pawns"
          :h="state.h"
          :v="state.v"
          :targets="targets"
          :wall-mode="wallLesson"
          :preview="shownPreview"
          :ghost="moveTo >= 0 ? { cell: moveTo, side: 0 } : null"
          :hints="glow"
          :hint-wall="wallLesson && !solved ? lesson.wall : null"
          :interactive="!solved && !finished"
          :last="state.last && state.last.type === 'wall' ? { type: 'wall', at: state.last.at, o: state.last.o } : null"
          @pick="pick"
          @wall="tapWall"
        />
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
