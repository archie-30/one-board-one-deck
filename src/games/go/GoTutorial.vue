<script setup lang="ts">
// 圍棋互動教學：9 路棋盤，一步一步練習提子、逃跑、做眼、打劫、圍地
import { computed, ref } from 'vue'
import { playSound } from '@/core/audio'
import { PLAYER_LOOK } from '@/data/names'
import { S } from '@/data/strings'
import { applyGo, createGo, hashBoard, other, toIndex, type GoState, type Point } from '@/engine/go/rules'
import Avatar from '@/ui/art/Avatar.vue'
import Bowl from '@/ui/art/Bowl.vue'
import Btn from '@/ui/Btn.vue'
import GuideNote from '@/ui/GuideNote.vue'
import IconBtn from '@/ui/IconBtn.vue'
import GoBoard from './GoBoard.vue'
import { GO_LESSONS } from './tutorialData'

const emit = defineEmits<{ exit: []; play: [] }>()
const T = S.go

const step = ref(0)
const preview = ref(-1)
const solved = ref(false)
const misses = ref(0)
const finished = ref(false)
const captured = ref<{ key: number; color: 1 | 2; points: number[] } | null>(null)
const state = ref<GoState>(build(0))

const lesson = computed(() => GO_LESSONS[step.value])
const text = computed(() => T.tutorial[step.value])
const targets = computed(() => lesson.value.targets.map(([x, y]) => toIndex(x, y, 9)))
const highlights = computed(() => (!solved.value && (lesson.value.showTargets || misses.value >= 2) ? targets.value : []))

function build(n: number): GoState {
  const s = createGo({ size: 9 })
  s.board = GO_LESSONS[n].rows.join('').split('').map((c): Point => (c === 'X' ? 1 : c === 'O' ? 2 : 0))
  s.history = [hashBoard(s.board)]
  return s
}

function pick(index: number) {
  if (solved.value || state.value.board[index] !== 0) return
  if (index === preview.value) return confirmMove()
  preview.value = index
  playSound('tap')
}

function confirmMove() {
  if (preview.value < 0 || solved.value) return
  if (!targets.value.includes(preview.value)) {
    misses.value++
    preview.value = -1
    playSound('error')
    return
  }
  const r = applyGo(state.value, { type: 'play', index: preview.value })
  if (!r.ok) return
  if (r.state.lastCaptured.length) captured.value = { key: r.state.moves + step.value * 100, color: other(1), points: r.state.lastCaptured }
  state.value = r.state
  preview.value = -1
  solved.value = true
  playSound('stone')
}

function next() {
  if (step.value + 1 >= GO_LESSONS.length) {
    finished.value = true
    playSound('win')
    return
  }
  step.value++
  state.value = build(step.value)
  solved.value = false
  misses.value = 0
  preview.value = -1
  captured.value = null
}
</script>

<template>
  <section class="gt">
    <div class="corner"><IconBtn icon="back" :label="S.common.back" @click="emit('exit')" /></div>
    <aside class="side">
      <div class="who">
        <span class="kid"><Avatar :look="PLAYER_LOOK" :mood="finished || solved ? 'happy' : misses ? 'shock' : 'think'" /></span>
        <span class="bowl"><Bowl black /></span>
      </div>
    </aside>
    <div class="board-wrap">
      <GoBoard :key="step" :board="state.board" :size="9" :last-move="state.lastMove" :preview="preview" :highlights="highlights" :captured="captured" :interactive="!solved && !finished" @pick="pick" />
    </div>
    <aside class="guide">
      <GuideNote v-if="!finished" :step="step" :total="GO_LESSONS.length" :text="text.text" :ok="text.ok" :solved="solved" :misses="misses" />
      <div v-else>
        <h2 class="t-black text-[2.4rem] leading-tight"><span class="mask"><span>{{ S.tutorial.finish }}</span></span></h2>
        <p class="text-ink-2">{{ S.tutorial.finishLead }}</p>
      </div>
      <div class="act">
        <template v-if="finished">
          <Btn tone="red" size="lg" arrow block @click="emit('play')">{{ S.tutorial.play }}</Btn>
          <Btn icon="back" size="sm" block @click="emit('exit')">{{ S.common.back }}</Btn>
        </template>
        <Btn v-else-if="solved" class="rise" tone="red" size="lg" arrow block @click="next">{{ step + 1 >= GO_LESSONS.length ? S.common.done : S.common.next }}</Btn>
        <Btn v-else tone="red" size="lg" arrow block :disabled="preview < 0" @click="confirmMove">{{ T.place }}</Btn>
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
  padding: 0.6rem max(1.2rem, env(safe-area-inset-right)) 0.6rem max(1.2rem, env(safe-area-inset-left));
}
.corner {
  position: absolute;
  left: max(0.9rem, env(safe-area-inset-left));
  top: max(0.7rem, env(safe-area-inset-top));
  z-index: 5;
}
.side {
  display: flex;
  width: 7rem;
  flex-shrink: 0;
  align-items: flex-end;
  padding-bottom: 1rem;
}
.who {
  position: relative;
  width: 6.4rem;
  height: 5.6rem;
}
.kid {
  position: absolute;
  left: 0;
  top: 0;
  width: 4.2rem;
  height: 4.2rem;
}
.bowl {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 2.8rem;
  height: 2.8rem;
}
.kid :deep(svg),
.bowl :deep(svg) {
  width: 100%;
  height: 100%;
}
.board-wrap {
  height: 100%;
  aspect-ratio: 1;
  flex-shrink: 0;
  animation: rise 520ms var(--ease-out) both;
}
.guide {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  justify-content: space-between;
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
