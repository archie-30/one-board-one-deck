<script setup lang="ts">
import { computed, ref } from 'vue'
import { playSound } from '@/core/audio'
import { S } from '@/data/strings'
import { createGomoku, placeStone, toIndex, type GomokuState } from '@/engine/gomoku/rules'
import { PLAYER_LOOK } from '@/data/names'
import ArtBowl from '@/ui/art/ArtBowl.vue'
import ArtKid from '@/ui/art/ArtKid.vue'
import GuideNote from '@/ui/GuideNote.vue'
import MenuButton from '@/ui/MenuButton.vue'
import RoundButton from '@/ui/RoundButton.vue'
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
  <section class="gt">
    <div class="corner"><RoundButton icon="back" :label="S.common.back" @click="emit('exit')" /></div>
    <aside class="side">
      <div class="who">
        <ArtKid class="kid" :look="PLAYER_LOOK" :mood="finished || solved ? 'happy' : misses ? 'shock' : 'think'" :seed="7" />
        <span class="bowl"><ArtBowl black /></span>
      </div>
    </aside>
    <div class="board-wrap">
      <GomokuBoard :board="state.board" :last-move="solved ? state.moves[state.moves.length - 1] : -1" :win-line="state.winLine" :preview="preview" :highlights="highlights" :interactive="!solved && !finished" @pick="pick" />
    </div>
    <aside class="guide">
      <GuideNote v-if="!finished" :step="step" :total="GOMOKU_LESSONS.length" :text="text.text" :ok="text.ok" :solved="solved" :misses="misses" />
      <div v-else class="pop">
        <p class="font-display text-[2rem] font-black leading-tight">{{ S.tutorial.finish }}</p>
        <p class="text-ink-soft">{{ S.tutorial.finishLead }}</p>
      </div>
      <div class="act">
        <template v-if="finished">
          <MenuButton primary icon="play" size="md" :label="S.tutorial.play" :seed="91" @click="emit('play')" />
          <MenuButton icon="back" size="sm" :label="S.common.back" :chevron="false" :seed="93" @click="emit('exit')" />
        </template>
        <MenuButton v-else-if="solved" class="pop" primary icon="play" size="md" :label="step + 1 >= GOMOKU_LESSONS.length ? S.common.done : S.common.next" :chevron="false" :seed="95" @click="next" />
        <MenuButton v-else primary icon="stone" size="md" :label="T.place" :chevron="false" :disabled="preview < 0" :seed="97" @click="confirmMove" />
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
  left: max(0.8rem, env(safe-area-inset-left));
  top: max(0.6rem, env(safe-area-inset-top));
  z-index: 5;
}
.side {
  display: flex;
  width: 8rem;
  flex-shrink: 0;
  align-items: flex-end;
  padding-bottom: 1rem;
}
.who {
  position: relative;
  width: 7rem;
  height: 8.6rem;
}
.kid {
  position: absolute;
  left: 0;
  top: 0;
  width: 5.4rem;
  height: 7.6rem;
}
.bowl {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 3.4rem;
  height: 3.4rem;
}
.bowl :deep(svg),
.kid :deep(svg) {
  width: 100%;
  height: 100%;
}
.board-wrap {
  height: 100%;
  aspect-ratio: 1;
  flex-shrink: 0;
  animation: pop 360ms var(--ease-back) both;
}
.guide {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  justify-content: space-between;
  padding: 1rem 0 0.4rem;
}
.act {
  display: flex;
  width: 10rem;
  flex-direction: column;
  gap: 0.5rem;
  align-self: flex-end;
}
</style>
