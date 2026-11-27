<script setup lang="ts">
// 孔明棋互動教學：4 課（跳一下、不能斜跳、連跳、最後停在正中間），照亮起來的地方做就過關。
import { computed, ref, shallowRef } from 'vue'
import { playSound } from '@/core/audio'
import { online } from '@/core/online'
import { myLook } from '@/core/profile'
import { S } from '@/data/strings'
import { applyPegs, fromPegs, jumpsFrom, type PegsState } from '@/engine/pegs/rules'
import Avatar from '@/ui/art/Avatar.vue'
import Btn from '@/ui/Btn.vue'
import GuideNote from '@/ui/GuideNote.vue'
import IconBtn from '@/ui/IconBtn.vue'
import PegsBoard, { type PegsFx } from './PegsBoard.vue'

const emit = defineEmits<{ exit: []; play: []; rules: [] }>()
const T = S.pegs
const at = (r: number, c: number) => r * 7 + c

interface Lesson {
  pegs: number[]
  /** 照順序要跳的步 */
  steps: { from: number; to: number }[]
  /** 要不要亮出要動哪一顆（第 2 課讓你自己找） */
  showFrom: boolean
}
const LESSONS: Lesson[] = [
  { pegs: [at(3, 1), at(3, 2)], steps: [{ from: at(3, 1), to: at(3, 3) }], showFrom: true },
  // (2,2) 斜跳過 (3,3) 不行；(4,3) 直直跳過 (3,3) 到 (2,3) 才可以（下面兩顆擋住其他跳法，只剩這一步）
  { pegs: [at(2, 2), at(3, 3), at(4, 3), at(5, 3), at(6, 3)], steps: [{ from: at(4, 3), to: at(2, 3) }], showFrom: false },
  {
    pegs: [at(5, 3), at(4, 3), at(2, 3)],
    steps: [
      { from: at(5, 3), to: at(3, 3) },
      { from: at(3, 3), to: at(1, 3) },
    ],
    showFrom: true,
  },
  { pegs: [at(3, 5), at(3, 4)], steps: [{ from: at(3, 5), to: at(3, 3) }], showFrom: true },
]

const step = ref(0)
const sub = ref(0)
const solved = ref(false)
const misses = ref(0)
const finished = ref(false)
const selected = ref(-1)
const state = shallowRef<PegsState>(fromPegs(LESSONS[0].pegs))
const fx = ref<PegsFx | null>(null)
let key = 0
const lesson = computed(() => LESSONS[step.value])
const text = computed(() => T.tutorial[step.value])
const want = computed(() => lesson.value.steps[sub.value])
const targets = computed(() => (selected.value >= 0 && !solved.value ? jumpsFrom(state.value, selected.value) : []))
const hints = computed(() => {
  if (solved.value || finished.value || !want.value) return []
  if (selected.value >= 0) return [want.value.to]
  return lesson.value.showFrom ? [want.value.from] : []
})

function wrong() {
  misses.value++
  playSound('error')
}
function pick(p: number) {
  if (solved.value || finished.value) return
  const w = want.value
  if (state.value.pegs[p]) {
    if (selected.value === p) {
      selected.value = -1
      return
    }
    if (p !== w.from) return wrong()
    selected.value = p
    playSound('stonePick')
    return
  }
  if (selected.value < 0) return
  if (p !== w.to) return targets.value.includes(p) ? wrong() : undefined
  jump(w.from, w.to)
}
function jump(from: number, to: number) {
  const r = applyPegs(state.value, { from, to })
  if (!r.ok) return wrong()
  const l = r.state.last!
  fx.value = { key: ++key, from: l.from, over: l.over, to: l.to }
  // 教學用：一顆剩下也繼續（連跳的課第一步之後還要跳）
  state.value = { ...r.state, status: 'playing' }
  selected.value = -1
  playSound('stone')
  window.setTimeout(() => playSound('capture'), 180)
  if (sub.value + 1 < lesson.value.steps.length) {
    sub.value++
    selected.value = to
    return
  }
  solved.value = true
  window.setTimeout(() => playSound('correct'), 550)
}
const canDrag = (p: number) => !solved.value && !finished.value && p === want.value?.from
function drop(from: number, to: number) {
  if (!canDrag(from)) return
  if (to !== want.value.to) return wrong()
  jump(from, to)
}
function next() {
  if (step.value + 1 >= LESSONS.length) {
    finished.value = true
    return
  }
  step.value++
  sub.value = 0
  solved.value = false
  misses.value = 0
  selected.value = -1
  fx.value = null
  state.value = fromPegs(LESSONS[step.value].pegs)
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
        <PegsBoard :key="step" :pegs="state.pegs" :interactive="!solved && !finished" :selected="selected" :targets="targets" :hints="hints" :fx="fx" :can-drag="canDrag" @pick="pick" @grab="(p) => canDrag(p) && (selected = p)" @drop="drop" />
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
