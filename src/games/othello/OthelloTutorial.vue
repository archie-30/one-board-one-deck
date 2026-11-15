<script setup lang="ts">
// 黑白棋互動教學：每一關擺好盤面，照提示下一手（點格子預覽，再按「落子」）
import { computed, ref } from 'vue'
import { playSound } from '@/core/audio'
import { PLAYER_LOOK } from '@/data/names'
import { S } from '@/data/strings'
import { applyOthello, createOthello, legalMoves, toIndex, type Disc, type OthelloState } from '@/engine/othello/rules'
import Avatar from '@/ui/art/Avatar.vue'
import Bowl from '@/ui/art/Bowl.vue'
import Btn from '@/ui/Btn.vue'
import GuideNote from '@/ui/GuideNote.vue'
import IconBtn from '@/ui/IconBtn.vue'
import OthelloBoard from './OthelloBoard.vue'
import { OTHELLO_LESSONS } from './tutorialData'

const emit = defineEmits<{ exit: []; play: [] }>()
const T = S.othello

const step = ref(0)
const preview = ref(-1)
const solved = ref(false)
const misses = ref(0)
const finished = ref(false)
const state = ref<OthelloState>(build(0))

const lesson = computed(() => OTHELLO_LESSONS[step.value])
const text = computed(() => T.tutorial[step.value])
const legal = computed(() => (solved.value ? [] : legalMoves(state.value.board, 1)))
const targets = computed(() => lesson.value.targets?.map(([x, y]) => toIndex(x, y)) ?? legal.value)
const highlights = computed(() => (!solved.value && lesson.value.targets && (lesson.value.showTargets || misses.value >= 2) ? targets.value : []))

function build(n: number): OthelloState {
  const s = createOthello()
  s.board = OTHELLO_LESSONS[n].rows.join('').split('').map((c): Disc => (c === 'X' ? 1 : c === 'O' ? 2 : 0))
  return s
}

function pick(index: number) {
  if (solved.value || finished.value) return
  if (index === preview.value) return confirmMove()
  if (!legal.value.includes(index)) {
    misses.value++
    playSound('error')
    return
  }
  preview.value = index
  playSound('stonePick')
}

function confirmMove() {
  if (preview.value < 0 || solved.value) return
  if (!targets.value.includes(preview.value)) {
    misses.value++
    preview.value = -1
    playSound('error')
    return
  }
  const r = applyOthello(state.value, { type: 'play', index: preview.value })
  if (!r.ok) return
  state.value = r.state
  preview.value = -1
  solved.value = true
  playSound('stone')
  window.setTimeout(() => playSound('stonePick'), 140)
}

function next() {
  if (step.value + 1 >= OTHELLO_LESSONS.length) {
    finished.value = true
    playSound('correct')
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
    <div class="corner"><IconBtn icon="back" :label="S.common.back" @click="emit('exit')" /></div>
    <aside class="side">
      <div class="who">
        <span class="kid"><Avatar :look="PLAYER_LOOK" :mood="finished || solved ? 'happy' : misses ? 'shock' : 'think'" /></span>
        <span class="bowl"><Bowl black /></span>
      </div>
    </aside>
    <div class="board-wrap">
      <OthelloBoard
        :key="step"
        :board="state.board"
        :last-move="solved ? state.lastMove : -1"
        :flipped="solved ? state.lastFlipped : []"
        :move-key="state.moves"
        :hints="solved || finished ? [] : legal"
        :highlights="highlights"
        :preview="preview"
        :interactive="!solved && !finished"
        @pick="pick"
      />
    </div>
    <aside class="guide">
      <GuideNote v-if="!finished" :step="step" :total="OTHELLO_LESSONS.length" :text="text.text" :ok="text.ok" :solved="solved" :misses="misses" />
      <div v-else class="pop">
        <h2 class="t-black text-[2.4rem] leading-tight"><span class="mask"><span>{{ S.tutorial.finish }}</span></span></h2>
        <p class="text-ink-2">{{ S.tutorial.finishLead }}</p>
      </div>
      <div class="act">
        <template v-if="finished">
          <Btn tone="red" size="lg" arrow block @click="emit('play')">{{ S.tutorial.play }}</Btn>
          <Btn icon="back" size="sm" block @click="emit('exit')">{{ S.common.back }}</Btn>
        </template>
        <Btn v-else-if="solved" class="rise" tone="red" size="lg" arrow block @click="next">{{ step + 1 >= OTHELLO_LESSONS.length ? S.common.done : S.common.next }}</Btn>
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
  height: 6rem;
}
.kid {
  position: absolute;
  left: 0;
  top: 0;
  width: 4.6rem;
  height: 4.6rem;
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
  animation: rise 520ms var(--ease-out) both;
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
