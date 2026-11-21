<script setup lang="ts">
// 點格棋互動教學：4 課（畫一條線、補第四邊拿格子、不畫第三邊、一路連吃），3 × 3 的小棋盤，照發亮的線做就過關。
// 跟對局一樣：點一下先出現虛線預覽，再點一次才畫。
import { computed, ref, shallowRef } from 'vue'
import { playSound } from '@/core/audio'
import { online } from '@/core/online'
import { myLook } from '@/core/profile'
import { S } from '@/data/strings'
import { applyDots, captures, createDots, isSafe, openLines, type DotsState } from '@/engine/dots/rules'
import Avatar from '@/ui/art/Avatar.vue'
import Btn from '@/ui/Btn.vue'
import GuideNote from '@/ui/GuideNote.vue'
import IconBtn from '@/ui/IconBtn.vue'
import DotsBoard from './DotsBoard.vue'

const emit = defineEmits<{ exit: []; play: []; rules: [] }>()
const T = S.dots
const N = 3

interface Lesson {
  /** 已經畫好的線（對方畫的，藍色） */
  drawn: number[]
  /** 要畫的線：固定幾條，或 'safe'＝任何安全的線、'eat'＝把能吃的都吃掉 */
  goal: number[] | 'safe' | 'eat'
}
// 3 × 3：橫線 0～11（第 r 排點 × 3 + c）、直線 12～23（12 + 第 r 列 × 4 + c）
const LESSONS: Lesson[] = [
  { drawn: [], goal: [4] },
  { drawn: [4, 7, 17], goal: [18] },
  // 四個角各有兩條邊：再畫它們的邊就送格子了
  { drawn: [0, 12, 2, 15, 9, 20, 11, 23], goal: 'safe' },
  // 最上面一排三格被打開了：從左邊一格一格吃過去
  { drawn: [0, 1, 2, 3, 4, 5, 12], goal: 'eat' },
]

const step = ref(0)
const solved = ref(false)
const misses = ref(0)
const finished = ref(false)
const chosen = ref(-1)
function build(): DotsState {
  const s = createDots(N)
  const lines = s.lines.slice()
  for (const l of LESSONS[step.value].drawn) lines[l] = 2
  return { ...s, lines }
}
const state = shallowRef<DotsState>(build())
const lesson = computed(() => LESSONS[step.value])
const text = computed(() => T.tutorial[step.value])
/** 要亮起來的線 */
const hints = computed(() => {
  if (solved.value || finished.value) return []
  const g = lesson.value.goal
  const s = state.value
  if (g === 'safe') return openLines(s).filter((l) => isSafe(s, l))
  if (g === 'eat') return openLines(s).filter((l) => captures(s, l))
  return g.filter((l) => !s.lines[l])
})

function pick(l: number) {
  if (solved.value || finished.value || state.value.lines[l]) return
  if (chosen.value !== l) {
    chosen.value = l
    playSound('piecePick')
    return
  }
  chosen.value = -1
  const before = state.value
  const good = hints.value.includes(l)
  const r = applyDots(before, { type: 'line', line: l })
  if (!r.ok) return
  state.value = { ...r.state, turn: 0 }
  playSound(r.state.last?.boxes.length ? 'capture' : 'piece')
  if (!good) {
    // 畫了但不是這一課要的：先讓你看到，再退回來
    misses.value++
    playSound('error')
    window.setTimeout(() => (state.value = before), 800)
    return
  }
  const g = lesson.value.goal
  if (g === 'eat' ? state.value.score[0] < 3 : false) return
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
  chosen.value = -1
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
        <DotsBoard
          :key="step"
          :n="state.n"
          :lines="state.lines"
          :boxes="state.boxes"
          :interactive="!solved && !finished"
          :preview="chosen >= 0 ? { line: chosen, side: 0 } : null"
          :hints="hints"
          :last="state.last?.line"
          :got="state.last?.boxes"
          @pick="pick"
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
  /* 3 × 3 的小棋盤：大螢幕上不跟著放到超大 */
  width: min(100cqw, 100cqh, 460px);
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
