<script setup lang="ts">
// 九子棋互動教學：4 課（放子成三、拿走對方一顆、走子成三、擋住對方成三），照亮起來的點做就過關。你是紅子。
import { computed, ref } from 'vue'
import { playSound } from '@/core/audio'
import { online } from '@/core/online'
import { myLook } from '@/core/profile'
import { S } from '@/data/strings'
import { removable, POINTS } from '@/engine/morris/rules'
import Avatar from '@/ui/art/Avatar.vue'
import Btn from '@/ui/Btn.vue'
import GuideNote from '@/ui/GuideNote.vue'
import IconBtn from '@/ui/IconBtn.vue'
import MorrisBoard from './MorrisBoard.vue'

const emit = defineEmits<{ exit: []; play: []; rules: [] }>()
const T = S.morris

interface Lesson {
  reds: number[]
  blues: number[]
  kind: 'place' | 'remove' | 'move'
  /** 放子／走子的目的地 */
  goal: number
  /** 走子：要動哪一顆 */
  from?: number
}
// 點的編號見 engine/morris/rules.ts（0 1 2 是最外圈上面一排）
const LESSONS: Lesson[] = [
  { reds: [0, 1], blues: [9, 13], kind: 'place', goal: 2 },
  // 藍子 3、4、5 已經成三，不能拿；只能拿 9 或 21
  { reds: [0, 1, 2], blues: [3, 4, 5, 9, 21], kind: 'remove', goal: -1 },
  { reds: [0, 2, 4], blues: [9, 13, 20, 22], kind: 'move', from: 4, goal: 1 },
  // 藍子 21、22 差 23 就成三；把紅子 14 走到 23 擋住
  { reds: [14, 6, 7], blues: [21, 22, 10], kind: 'move', from: 14, goal: 23 },
]

const step = ref(0)
const solved = ref(false)
const misses = ref(0)
const finished = ref(false)
const selected = ref(-1)
const stamp = ref(0)
function build(): number[] {
  const l = LESSONS[step.value]
  const b = Array(POINTS).fill(-1)
  for (const p of l.reds) b[p] = 0
  for (const p of l.blues) b[p] = 1
  return b
}
const board = ref<number[]>(build())
const lesson = computed(() => LESSONS[step.value])
const text = computed(() => T.tutorial[step.value])
const last = ref<{ from: number; to: number; removed: number; victim: number } | null>(null)
const removables = computed(() => (lesson.value.kind === 'remove' && !solved.value ? removable(board.value, 1) : []))
const targets = computed(() => (lesson.value.kind === 'move' && selected.value >= 0 && !solved.value ? [lesson.value.goal] : []))
const hints = computed(() => {
  if (solved.value || finished.value) return []
  const l = lesson.value
  if (l.kind === 'place') return [l.goal]
  if (l.kind === 'move') return selected.value >= 0 ? [] : [l.from!]
  return []
})

function wrong() {
  misses.value++
  playSound('error')
}
function pick(p: number) {
  if (solved.value || finished.value) return
  const l = lesson.value
  const b = board.value.slice()
  if (l.kind === 'place') {
    if (b[p] >= 0) return
    if (p !== l.goal) return wrong()
    b[p] = 0
    last.value = { from: -1, to: p, removed: -1, victim: 1 }
    playSound('stone')
  } else if (l.kind === 'remove') {
    if (!removables.value.includes(p)) return b[p] === 1 ? wrong() : undefined
    b[p] = -1
    last.value = { from: -1, to: -1, removed: p, victim: 1 }
    playSound('capture')
  } else {
    if (selected.value < 0) {
      if (p !== l.from) return b[p] === 0 ? wrong() : undefined
      selected.value = p
      playSound('piecePick')
      return
    }
    if (p !== l.goal) {
      if (p === l.from) selected.value = -1
      else wrong()
      return
    }
    b[l.from!] = -1
    b[p] = 0
    selected.value = -1
    last.value = { from: l.from!, to: p, removed: -1, victim: 1 }
    playSound('piece')
  }
  stamp.value++
  board.value = b
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
  board.value = build()
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
        <MorrisBoard
          :key="step"
          :board="board"
          :interactive="!solved && !finished"
          :selected="selected"
          :targets="targets"
          :removables="removables"
          :hints="hints"
          :last="last"
          :stamp="stamp"
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
  /* 大螢幕上不跟著放到超大 */
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
