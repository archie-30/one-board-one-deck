<script setup lang="ts">
// 海克斯互動教學：4 課（補上缺口連通、擋住對方、保橋、搭橋），5 × 5 的小棋盤，照亮起來的格子下就過關。
// 跟對局一樣：點一下先出現淡淡的子，再點一次才下。你是紅方（連通上下兩邊）。
import { computed, ref, shallowRef } from 'vue'
import { playSound } from '@/core/audio'
import { online } from '@/core/online'
import { myLook } from '@/core/profile'
import { S } from '@/data/strings'
import { applyHex, createHex, type HexState } from '@/engine/hex/rules'
import Avatar from '@/ui/art/Avatar.vue'
import Btn from '@/ui/Btn.vue'
import GuideNote from '@/ui/GuideNote.vue'
import IconBtn from '@/ui/IconBtn.vue'
import HexBoard from './HexBoard.vue'

const emit = defineEmits<{ exit: []; play: []; rules: [] }>()
const T = S.hex
const N = 5

interface Lesson {
  /** 棋盤：R 紅、B 藍、. 空，一行一列 */
  rows: string[]
  /** 藍方剛下的那一格（保橋那一課，畫面上標出來） */
  last?: number
  /** 要下的格子 */
  goal: number
}
const at = (r: number, c: number) => r * N + c
const LESSONS: Lesson[] = [
  // 缺口只有一個：(2,2) 已經被藍方佔了，只能補 (2,1)
  { rows: ['..R..', '..R..', '..B..', '.R...', '.R...'], goal: at(2, 1) },
  { rows: ['.....', '.R...', 'BB.BB', '..R..', '.....'], goal: at(2, 2) },
  { rows: ['.....', '..R..', '.B...', '.R...', '.....'], last: at(2, 1), goal: at(2, 2) },
  { rows: ['..R..', '..R..', '.....', '.....', '.....'], goal: at(3, 1) },
]

const step = ref(0)
const solved = ref(false)
const misses = ref(0)
const finished = ref(false)
const chosen = ref(-1)
function build(): HexState {
  const l = LESSONS[step.value]
  const s = createHex(N)
  const cells = l.rows.join('').split('').map((ch) => (ch === 'R' ? 0 : ch === 'B' ? 1 : -1))
  return { ...s, cells, last: l.last !== undefined ? { side: 1, cell: l.last } : null }
}
const state = shallowRef<HexState>(build())
const lesson = computed(() => LESSONS[step.value])
const text = computed(() => T.tutorial[step.value])
const hints = computed(() => (solved.value || finished.value ? [] : [lesson.value.goal]))

function pick(c: number) {
  if (solved.value || finished.value || state.value.cells[c] >= 0) return
  if (chosen.value !== c) {
    chosen.value = c
    playSound('stonePick')
    return
  }
  chosen.value = -1
  const before = state.value
  const r = applyHex(before, { type: 'place', cell: c })
  if (!r.ok) return
  state.value = r.state
  playSound('stone')
  if (c !== lesson.value.goal) {
    // 下了但不是這一課要的：先讓你看到，再退回來
    misses.value++
    playSound('error')
    window.setTimeout(() => (state.value = before), 800)
    return
  }
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
        <HexBoard
          :key="step"
          :n="state.n"
          :cells="state.cells"
          :interactive="!solved && !finished"
          :preview="chosen >= 0 ? { cell: chosen, side: 0 } : null"
          :hints="hints"
          :last="state.last"
          :path="state.path"
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
  /* 5 × 5 的小棋盤（菱形，長寬比約 1.4）：大螢幕上不跟著放到超大 */
  width: min(100cqw, 140cqh, 560px);
  aspect-ratio: 1.4;
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
