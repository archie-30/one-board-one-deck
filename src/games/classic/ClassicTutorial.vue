<script setup lang="ts" generic="St">
// 西洋棋、象棋互動教學：每一課一個小盤面，只能動發亮的那顆子，照著提示走一步就過關
import { computed, ref, shallowRef } from 'vue'
import { playSound } from '@/core/audio'
import { PLAYER_LOOK } from '@/data/names'
import { S } from '@/data/strings'
import type { Promo } from '@/engine/chess/rules'
import Avatar from '@/ui/art/Avatar.vue'
import PieceIcon from '@/ui/art/PieceIcon.vue'
import Btn from '@/ui/Btn.vue'
import Dialog from '@/ui/Dialog.vue'
import GuideNote from '@/ui/GuideNote.vue'
import IconBtn from '@/ui/IconBtn.vue'
import type { Adapter } from './adapters'
import ClassicBoard from './ClassicBoard.vue'
import type { ClassicLesson } from './tutorialData'

const props = defineProps<{ adapter: Adapter<St>; lessons: ClassicLesson<St>[]; pieceStyle?: 'text' | 'icon' }>()
const emit = defineEmits<{ exit: []; play: [] }>()
const A = props.adapter
const T = A.kind === 'chess' ? S.chess : S.xiangqi

const step = ref(0)
const solved = ref(false)
const misses = ref(0)
const finished = ref(false)
const selected = ref(-1)
const promoAsk = ref<{ from: number; to: number } | null>(null)
const state = shallowRef<St>(props.lessons[0].build())

const lesson = computed(() => props.lessons[step.value])
const text = computed(() => T.tutorial[step.value])
const targets = computed(() => (selected.value >= 0 && !solved.value ? A.targets(state.value, selected.value) : []))
// 還沒選子時，亮起要動的那顆；選了之後，亮起能走的位置
const hints = computed(() => (solved.value || finished.value ? [] : selected.value < 0 ? [lesson.value.from] : []))

function pick(i: number) {
  if (solved.value || finished.value) return
  if (i === lesson.value.from) {
    selected.value = selected.value === i ? -1 : i
    playSound('cardPick')
    return
  }
  if (selected.value < 0 || !targets.value.includes(i)) {
    if (selected.value >= 0) misses.value++
    selected.value = -1
    return
  }
  if (A.needsPromotion(state.value, selected.value, i)) {
    promoAsk.value = { from: selected.value, to: i }
    return
  }
  move(selected.value, i)
}
function move(from: number, to: number, promo?: Promo) {
  const r = A.apply(state.value, { from, to, promo })
  selected.value = -1
  if (!r.ok) {
    misses.value++
    playSound('error')
    return
  }
  playSound('piece')
  if (lesson.value.done(r.state)) {
    state.value = r.state
    solved.value = true
    window.setTimeout(() => playSound('win'), 250)
  } else {
    // 走了但不是這一課要的：先讓你看到，再退回來
    state.value = r.state
    misses.value++
    playSound('error')
    window.setTimeout(() => (state.value = lesson.value.build()), 700)
  }
}
function promote(p: Promo) {
  const ask = promoAsk.value
  promoAsk.value = null
  if (ask) move(ask.from, ask.to, p)
}
function next() {
  if (step.value + 1 >= props.lessons.length) {
    finished.value = true
    return
  }
  step.value++
  solved.value = false
  misses.value = 0
  selected.value = -1
  state.value = lesson.value.build()
}
const aspect = A.kind === 'chess' ? '1 / 1' : '94 / 104'
</script>

<template>
  <section class="gt">
    <div class="corner"><IconBtn icon="back" :label="S.common.back" @click="emit('exit')" /></div>
    <aside class="side">
      <span class="kid"><Avatar :look="PLAYER_LOOK" :mood="finished || solved ? 'happy' : misses ? 'shock' : 'think'" /></span>
    </aside>
    <div class="board-wrap" :style="{ aspectRatio: aspect }">
      <ClassicBoard
        :key="step"
        :kind="A.kind"
        :board="A.board(state)"
        :selected="selected"
        :targets="targets"
        :hints="hints"
        :last-move="A.lastMove(state)"
        :check-sq="A.checkSq(state)"
        :piece-style="pieceStyle ?? 'text'"
        :interactive="!solved && !finished"
        :move-key="A.plies(state)"
        @pick="pick"
      />
    </div>
    <aside class="guide">
      <GuideNote v-if="!finished" :step="step" :total="lessons.length" :text="text.text" :ok="text.ok" :solved="solved" :misses="misses" />
      <div v-else>
        <h2 class="t-black text-[2.4rem] leading-tight"><span class="mask"><span>{{ S.tutorial.finish }}</span></span></h2>
        <p class="text-ink-2">{{ S.tutorial.finishLead }}</p>
      </div>
      <div class="act">
        <template v-if="finished">
          <Btn tone="red" size="lg" arrow block @click="emit('play')">{{ S.tutorial.play }}</Btn>
          <Btn icon="back" size="sm" block @click="emit('exit')">{{ S.common.back }}</Btn>
        </template>
        <Btn v-else-if="solved" class="rise" tone="red" size="lg" arrow block @click="next">{{ step + 1 >= lessons.length ? S.common.done : S.common.next }}</Btn>
      </div>
    </aside>

    <Dialog :open="!!promoAsk" :title="S.chess.promoTitle" label="TUTORIAL" tone="yellow" @close="promoAsk = null">
      <p class="text-[0.9rem] text-ink-2">{{ S.chess.promoLead }}</p>
      <div class="promo">
        <button v-for="k in (['Q', 'R', 'B', 'N'] as Promo[])" :key="k" class="pc" @click="promote(k)">
          <svg viewBox="0 0 40 40"><PieceIcon :kind="k" /></svg>
          <span class="t-black">{{ S.chess.pieces[k] }}</span>
        </button>
      </div>
    </Dialog>
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
  width: 6rem;
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
  height: 100%;
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
.promo {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.5rem;
  margin-top: 0.7rem;
}
.pc {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
  border: 0.13rem solid var(--color-ink);
  background: var(--color-card);
  padding: 0.4rem 0;
  box-shadow: 0.15rem 0.15rem 0 var(--color-ink);
}
.pc svg {
  width: 2.6rem;
  height: 2.6rem;
}
</style>
