<script setup lang="ts">
// 星形跳棋互動教學：4 課（走一格、跳過一顆、連跳、遠跳），每一課在空棋盤上擺幾顆彈珠，照著發亮的提示走一步就過關。
// 跟對局一樣一步一步跳：每跳一格再顯示下一跳（教學到了目標那格就算過關，不用按「結束」）。
import { computed, ref, shallowRef } from 'vue'
import { playSound } from '@/core/audio'
import { online } from '@/core/online'
import { myLook } from '@/core/profile'
import { S } from '@/data/strings'
import { cellAt, CELLS, createStar, nextHops, type StarState } from '@/engine/starcheckers/rules'
import Avatar from '@/ui/art/Avatar.vue'
import Btn from '@/ui/Btn.vue'
import GuideNote from '@/ui/GuideNote.vue'
import IconBtn from '@/ui/IconBtn.vue'
import StarBoard from './StarBoard.vue'

const emit = defineEmits<{ exit: []; play: []; rules: [] }>()
const T = S.starcheckers

interface Lesson {
  /** 擺哪些彈珠：[q, r, 座位+1] */
  marbles: [number, number, number][]
  long: boolean
  from: [number, number]
  /** 依序要跳到的格子（最後一格是目標） */
  route: [number, number][]
}
const LESSONS: Lesson[] = [
  { marbles: [[0, 2, 1]], long: false, from: [0, 2], route: [[0, 1]] },
  { marbles: [[0, 2, 1], [0, 1, 2]], long: false, from: [0, 2], route: [[0, 0]] },
  { marbles: [[0, 4, 1], [0, 3, 2], [0, 1, 3]], long: false, from: [0, 4], route: [[0, 2], [0, 0]] },
  { marbles: [[0, 4, 1], [0, 2, 2]], long: true, from: [0, 4], route: [[0, 0]] },
]

const step = ref(0)
const solved = ref(false)
const misses = ref(0)
const finished = ref(false)
const selected = ref(-1)
function build(): StarState {
  const l = LESSONS[step.value]
  const s = createStar({ longJump: l.long })
  const board = Array(CELLS.length).fill(0)
  for (const [q, r, v] of l.marbles) board[cellAt(q, r)] = v
  return { ...s, board, turn: 0 }
}
const state = shallowRef<StarState>(build())
const last = shallowRef<number[] | null>(null)
/** 走到一半的路線 */
const moving = ref<number[] | null>(null)
const anim = ref<{ key: number; path: number[] } | null>(null)
const lesson = computed(() => LESSONS[step.value])
const text = computed(() => T.tutorial[step.value])
const from = computed(() => cellAt(...lesson.value.from))
const route = computed(() => lesson.value.route.map(([q, r]) => cellAt(q, r)))
/** 畫面上的棋盤：走到一半的那顆畫在現在的位置 */
const shown = computed(() => {
  const p = moving.value
  if (!p) return state.value.board
  const b = state.value.board.slice()
  b[p[p.length - 1]] = b[p[0]]
  b[p[0]] = 0
  return b
})
const targets = computed(() => {
  if (solved.value || finished.value) return []
  if (moving.value) return nextHops(state.value, moving.value)
  return selected.value >= 0 ? nextHops(state.value, [selected.value]) : []
})
// 還沒選子時亮起要動的那顆；之後依序亮起下一個要跳到的格子
const glow = computed(() => (solved.value || finished.value ? [] : selected.value < 0 ? [from.value] : [route.value[(moving.value?.length ?? 1) - 1]]))

function pick(i: number) {
  if (solved.value || finished.value) return
  if (i === from.value && selected.value < 0) {
    selected.value = i
    playSound('piecePick')
    return
  }
  if (selected.value < 0 || !targets.value.includes(i)) {
    misses.value++
    playSound('error')
    if (!moving.value) selected.value = -1
    return
  }
  const p = moving.value ?? [selected.value]
  moving.value = [...p, i]
  selected.value = i
  anim.value = { key: (anim.value?.key ?? 0) + 1, path: [p[p.length - 1], i] }
  playSound(step.value === 0 ? 'stone' : 'stonePick')
  const want = route.value[moving.value.length - 2]
  if (i === want && moving.value.length - 1 === route.value.length) {
    last.value = moving.value
    return pass()
  }
  if (i === want) return
  // 跳錯了：先讓你看到，再退回來
  misses.value++
  window.setTimeout(() => {
    state.value = build()
    moving.value = null
    selected.value = -1
    last.value = null
  }, 900)
}
function drop(a: number, b: number) {
  if (a === (moving.value ? moving.value[moving.value.length - 1] : from.value)) {
    if (!moving.value) selected.value = a
    pick(b)
  }
}
function pass() {
  solved.value = true
  window.setTimeout(() => playSound('correct'), 300 + (last.value?.length ?? 2) * 120)
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
  moving.value = null
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
        <StarBoard :key="step" :board="shown" :selected="selected" :targets="targets" :last="moving ?? last" :anim="anim" :hints="glow" :interactive="!solved && !finished" :can-drag="(i) => !solved && (moving ? i === moving[moving.length - 1] : i === from)" @pick="pick" @drop="drop" />
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
  width: min(100cqw, calc(100cqh * 236 / 264));
  aspect-ratio: 236 / 264;
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
