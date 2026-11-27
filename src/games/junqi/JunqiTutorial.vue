<script setup lang="ts">
// 軍棋互動教學：4 課（鐵路衝刺、大吃小、工兵轉彎挖地雷、奪旗），照亮起來的地方做就過關。你是紅方（左邊）。
// 教學裡對方的子先翻開給你看（真的對局看不到）。
import { computed, ref, shallowRef } from 'vue'
import { playSound } from '@/core/audio'
import { online } from '@/core/online'
import { myLook } from '@/core/profile'
import { S } from '@/data/strings'
import { applyJunqi, BATTALION, BRIGADE, cell, COMPANY, createJunqi, DIVISION, ENGINEER, FLAG, MINE, PER_SIDE, PLATOON, REGIMENT, type JunqiState } from '@/engine/junqi/rules'
import Avatar from '@/ui/art/Avatar.vue'
import Btn from '@/ui/Btn.vue'
import GuideNote from '@/ui/GuideNote.vue'
import IconBtn from '@/ui/IconBtn.vue'
import JunqiBoard, { type JunqiFx } from './JunqiBoard.vue'

/** 子的大小（大到小）：司令 > 軍長 > … > 工兵 */
const ORDER = [9, 8, 7, 6, 5, 4, 3, 2, 1]
const emit = defineEmits<{ exit: []; play: []; rules: [] }>()
const T = S.junqi

interface Lesson {
  /** [點, 哪一方, 什麼子] */
  pieces: [number, 0 | 1, number][]
  from: number
  goal: number
}
// 點的編號：第 r 列第 c 行（0 號在下面第 6～11 列，畫面上轉成左邊）
const LESSONS: Lesson[] = [
  { pieces: [[cell(10, 4), 0, REGIMENT], [cell(11, 1), 0, FLAG], [cell(9, 0), 0, COMPANY], [cell(1, 2), 1, PLATOON], [cell(0, 3), 1, FLAG]], from: cell(10, 4), goal: cell(3, 4) },
  { pieces: [[cell(6, 2), 0, BRIGADE], [cell(5, 2), 1, BATTALION], [cell(11, 1), 0, FLAG], [cell(0, 3), 1, FLAG], [cell(3, 0), 1, DIVISION]], from: cell(6, 2), goal: cell(5, 2) },
  { pieces: [[cell(10, 0), 0, ENGINEER], [cell(1, 2), 1, MINE], [cell(11, 1), 0, FLAG], [cell(0, 3), 1, FLAG], [cell(8, 1), 0, COMPANY]], from: cell(10, 0), goal: cell(1, 2) },
  { pieces: [[cell(1, 1), 0, PLATOON], [cell(0, 1), 1, FLAG], [cell(11, 1), 0, FLAG], [cell(2, 1), 1, DIVISION], [cell(1, 3), 1, COMPANY]], from: cell(1, 1), goal: cell(0, 1) },
]

function build(l: Lesson): JunqiState {
  const s = createJunqi()
  s.phase = 'play'
  s.deployed = [true, true]
  s.alive = s.alive.map(() => false)
  const next = [0, PER_SIDE]
  for (const [at, side, rank] of l.pieces) {
    const id = next[side]++
    s.board[at] = id
    s.rank[id] = rank
    s.alive[id] = true
  }
  return s
}

const step = ref(0)
const solved = ref(false)
const misses = ref(0)
const finished = ref(false)
const selected = ref(-1)
const state = shallowRef<JunqiState>(build(LESSONS[0]))
const fx = ref<JunqiFx | null>(null)
let key = 0
const lesson = computed(() => LESSONS[step.value])
const text = computed(() => T.tutorial[step.value])
const targets = computed(() => (selected.value >= 0 && !solved.value ? [lesson.value.goal] : []))
const hints = computed(() => (solved.value || finished.value ? [] : selected.value >= 0 ? [] : [lesson.value.from]))

function wrong() {
  misses.value++
  playSound('error')
}
function pick(at: number) {
  if (solved.value || finished.value) return
  const l = lesson.value
  if (selected.value < 0) {
    if (at !== l.from) return state.value.board[at] >= 0 && state.value.board[at] < PER_SIDE ? wrong() : undefined
    selected.value = at
    playSound('piecePick')
    return
  }
  if (at === l.from) {
    selected.value = -1
    return
  }
  if (at !== l.goal) return wrong()
  const s = state.value
  const a = s.board[l.from]
  const d = s.board[at]
  const r = applyJunqi(s, { type: 'move', from: l.from, to: at })
  if (!r.ok) return wrong()
  fx.value = { key: ++key, from: l.from, to: at, out: r.state.last?.out ?? 'move', att: { side: 0, rank: s.rank[a] }, def: d >= 0 ? { side: 1, rank: s.rank[d] } : null }
  state.value = r.state
  selected.value = -1
  playSound('xqPiece')
  if (d >= 0) window.setTimeout(() => playSound('xqCapture'), 300)
  solved.value = true
  window.setTimeout(() => playSound('correct'), 650)
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
  fx.value = null
  state.value = build(LESSONS[step.value])
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
        <JunqiBoard :key="step" :board="state.board" :rank="state.rank" :interactive="!solved && !finished" :selected="selected" :targets="targets" :hints="hints" :fx="fx" @pick="pick" />
      </div>
      <!-- 子的大小：一直顯示 -->
      <div class="order">
        <p class="t-label ol">{{ T.orderLabel }}</p>
        <p class="row">
          <template v-for="(r, i) in ORDER" :key="r">
            <b v-if="i" class="arr">&gt;</b>
            <span class="tl">{{ T.full[r] }}</span>
          </template>
        </p>
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
  gap: 1rem;
  padding: 0.6rem 1.2rem;
}
.side {
  display: flex;
  width: 4.6rem;
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
.board-wrap {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  container-type: size;
  animation: rise 520ms var(--ease-out) both;
}
.board-box {
  /* 下面留一行給子的大小 */
  width: min(100cqw, (100cqh - 3.4rem) * 130 / 54);
  aspect-ratio: 130 / 54;
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
.order {
  max-width: 100%;
  margin-top: 0.55rem;
  text-align: center;
}
.order .row {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: center;
  gap: 0.2rem;
}
.ol {
  margin-bottom: 0.25rem;
  font-size: 0.56rem;
  color: var(--color-ink-2);
}
.tl {
  padding: 0.12rem 0.3rem;
  border: 0.1rem solid var(--color-ink);
  border-radius: 0.25rem;
  background: var(--color-red);
  box-shadow: 0.12rem 0.14rem 0 var(--color-ink);
  color: var(--color-paper);
  font-size: 0.72rem;
  font-weight: 900;
  line-height: 1.2;
  white-space: nowrap;
}
.arr {
  font-size: 0.75rem;
  color: var(--color-ink-2);
}
/* 手機：一排放得下 */
@media (max-width: 720px) {
  .tl {
    padding: 0.08rem 0.18rem;
    font-size: 0.6rem;
  }
  .arr {
    font-size: 0.6rem;
  }
  .order .row {
    gap: 0.12rem;
  }
}
</style>
