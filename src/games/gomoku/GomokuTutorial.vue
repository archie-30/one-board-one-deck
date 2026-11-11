<script setup lang="ts">
import { computed, ref } from 'vue'
import { playSound } from '@/core/audio'
import { S } from '@/data/strings'
import { createGomoku, placeStone, toIndex, type GomokuState } from '@/engine/gomoku/rules'
import Doodle from '@/ui/art/Doodle.vue'
import DoodleButton from '@/ui/DoodleButton.vue'
import StoneButton from './StoneButton.vue'
import GomokuBoard from './GomokuBoard.vue'
import { GOMOKU_LESSONS } from './tutorialData'

const emit = defineEmits<{ exit: []; play: [] }>()
const T = S.gomoku

const step = ref(0)
const preview = ref(-1)
const solved = ref(false)
const misses = ref(0)
const finished = ref(false)
const state = ref<GomokuState>(build(0))

const lesson = computed(() => GOMOKU_LESSONS[step.value])
const text = computed(() => T.tutorial[step.value])
const targets = computed(() => lesson.value.targets.map(([x, y]) => toIndex(x, y)))
const highlights = computed(() => (!solved.value && (lesson.value.showTargets || misses.value >= 2) ? targets.value : []))

function build(n: number): GomokuState {
  const s = createGomoku()
  for (const [x, y] of GOMOKU_LESSONS[n].black) s.board[toIndex(x, y)] = 1
  for (const [x, y] of GOMOKU_LESSONS[n].white) s.board[toIndex(x, y)] = 2
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
  const result = placeStone(state.value, preview.value)
  if (!result.ok) return
  state.value = result.state
  preview.value = -1
  solved.value = true
  playSound('stone')
}

function next() {
  if (step.value + 1 >= GOMOKU_LESSONS.length) {
    finished.value = true
    playSound('win')
    return
  }
  step.value++
  state.value = build(step.value)
  solved.value = false
  misses.value = 0
  preview.value = -1
}
</script>

<template>
  <section class="flex h-full items-stretch gap-[1.4rem] px-[max(1.2rem,env(safe-area-inset-left))] py-[0.7rem]">
    <div class="board-wrap">
      <GomokuBoard
        :board="state.board"
        :win-line="state.winLine"
        :preview="preview"
        :highlights="highlights"
        :interactive="!solved && !finished"
        @pick="pick"
      />
    </div>

    <aside class="flex min-w-0 flex-1 flex-col py-[0.3rem]">
      <header class="flex items-center gap-[0.6rem]">
        <button class="back" :aria-label="S.common.back" @click="emit('exit')"><Doodle name="back" class="h-[1.8rem] w-[1.8rem]" /></button>
        <h1 class="font-display text-[1.5rem] leading-none">{{ S.tutorial.title }}</h1>
        <span v-if="!finished" class="ml-auto text-[0.9rem] text-ink-soft tabular-nums">{{ S.tutorial.step(step + 1, GOMOKU_LESSONS.length) }}</span>
      </header>

      <div v-if="finished" class="rise flex flex-1 flex-col justify-center gap-[0.4rem]">
        <p class="font-display text-[2rem] leading-tight">{{ S.tutorial.finish }}</p>
        <p class="text-ink-soft">{{ S.tutorial.finishLead }}</p>
      </div>
      <div v-else :key="step" class="rise flex-1 pt-[1.1rem]">
        <p class="text-[1.05rem] leading-relaxed text-pretty">{{ text.text }}</p>
        <p v-if="solved" class="rise mt-[0.8rem] border-l-[0.25rem] border-leaf pl-[0.7rem] text-[1rem] leading-relaxed">{{ text.ok }}</p>
        <p v-else-if="misses > 0" :key="misses" class="rise mt-[0.8rem] text-[0.95rem] text-red">{{ S.tutorial.tryAgain }}</p>
      </div>

      <div class="flex justify-center gap-[1.6rem]">
        <template v-if="finished">
          <DoodleButton :label="S.tutorial.play" size="5rem" @click="emit('play')"><Doodle name="resume" /></DoodleButton>
          <DoodleButton :label="S.common.back" size="5rem" @click="emit('exit')"><Doodle name="exit" /></DoodleButton>
        </template>
        <DoodleButton v-else-if="solved" :label="step + 1 >= GOMOKU_LESSONS.length ? S.common.done : S.common.next" size="5rem" @click="next"><Doodle name="resume" /></DoodleButton>
        <StoneButton v-else :label="T.place" black :disabled="preview < 0" @click="confirmMove" />
      </div>
    </aside>
  </section>
</template>

<style scoped>
.board-wrap {
  height: 100%;
  aspect-ratio: 1;
  flex-shrink: 0;
}
.back {
  display: grid;
  place-items: center;
  width: 2.2rem;
  height: 2.2rem;
  margin-left: -0.4rem;
  border: 0;
  background: none;
}
</style>
