<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { playSound } from '@/core/audio'
import { stats } from '@/core/settings'
import { S } from '@/data/strings'
import { seedRng } from '@/engine/common/rng'
import type { Difficulty } from '@/engine/common/types'
import { chooseGomokuMove } from '@/engine/gomoku/ai'
import { canPlace, createGomoku, placeStone, type GomokuOptions, type GomokuState, type Player } from '@/engine/gomoku/rules'
import type { GameDef } from '@/games/types'
import GameMenu from '@/ui/GameMenu.vue'
import InkButton from '@/ui/InkButton.vue'
import InkDialog from '@/ui/InkDialog.vue'
import InkIcon from '@/ui/InkIcon.vue'
import RpsDuel from '@/ui/RpsDuel.vue'
import GomokuBoard from './GomokuBoard.vue'

const props = defineProps<{ game: GameDef; options: Record<string, string | boolean>; difficulty: Difficulty }>()
const emit = defineEmits<{ exit: [] }>()

// 規則在開局時固定下來
const options = { ...props.options } as unknown as GomokuOptions
const T = S.gomoku

const state = ref<GomokuState>(createGomoku(options))
const human = ref<Player>(1)
const phase = ref<'rps' | 'playing' | 'over'>('rps')
const preview = ref(-1)
const message = ref('')
const menuOpen = ref(false)
const resultOpen = ref(false)
let rng = seedRng(Date.now())
let timer = 0

const myTurn = computed(() => phase.value === 'playing' && state.value.turn === human.value)
const lastMove = computed(() => state.value.moves[state.value.moves.length - 1] ?? -1)
const resultTitle = computed(() => (state.value.winner === 3 ? T.draw : state.value.winner === human.value ? T.win : T.lose))
const status = computed(() => {
  if (phase.value === 'over') return resultTitle.value
  if (phase.value === 'rps') return ''
  return myTurn.value ? T.yourTurn : T.cpuTurn
})
const seats = computed(() => [
  { color: 1 as Player, name: human.value === 1 ? S.common.you : S.common.cpu, label: T.black },
  { color: 2 as Player, name: human.value === 2 ? S.common.you : S.common.cpu, label: T.white },
])

function startAfterRps(playerWins: boolean) {
  human.value = playerWins ? 1 : 2
  state.value = createGomoku(options)
  preview.value = -1
  message.value = ''
  phase.value = 'playing'
  if (!playerWins) scheduleCpu()
}

function restart() {
  window.clearTimeout(timer)
  menuOpen.value = false
  resultOpen.value = false
  state.value = createGomoku(options)
  preview.value = -1
  message.value = ''
  phase.value = 'rps'
}

function commit(index: number) {
  const result = placeStone(state.value, index)
  if (!result.ok) {
    message.value = T.errors[result.reason]
    playSound('error')
    return
  }
  state.value = result.state
  preview.value = -1
  message.value = ''
  playSound('stone')
  if (result.state.winner !== 0) finish()
  else if (result.state.turn !== human.value) scheduleCpu()
}

function finish() {
  phase.value = 'over'
  const w = state.value.winner
  if (w === 3) stats.gomoku.draws++
  else if (w === human.value) stats.gomoku.wins++
  else stats.gomoku.losses++
  timer = window.setTimeout(() => {
    playSound(w === human.value ? 'win' : w === 3 ? 'pass' : 'lose')
    resultOpen.value = true
  }, 900)
}

function scheduleCpu() {
  timer = window.setTimeout(() => {
    let move: number
    ;[move, rng] = chooseGomokuMove(state.value, props.difficulty, rng)
    if (move >= 0) commit(move)
  }, 520)
}

function pick(index: number) {
  if (!myTurn.value) return
  if (index === preview.value) return confirmMove()
  const error = canPlace(state.value, index)
  if (error) {
    message.value = T.errors[error]
    if (error === 'forbidden') playSound('error')
    return
  }
  message.value = ''
  preview.value = index
  playSound('tap')
}

function confirmMove() {
  if (myTurn.value && preview.value >= 0) commit(preview.value)
}

onUnmounted(() => window.clearTimeout(timer))
</script>

<template>
  <section class="flex h-full items-stretch gap-[1.2rem] px-[max(1.2rem,env(safe-area-inset-left))] py-[0.7rem]">
    <aside class="flex w-[9.5rem] shrink-0 flex-col">
      <button class="icon-btn" :aria-label="S.common.menu" @click="menuOpen = true"><InkIcon name="menu" class="h-[1.6rem] w-[1.6rem]" /></button>
      <ul v-if="phase !== 'rps'" class="mt-auto mb-auto flex flex-col gap-[0.9rem]">
        <li v-for="seat in seats" :key="seat.color" class="seat" :class="{ active: phase === 'playing' && state.turn === seat.color }">
          <span class="dot" :class="seat.color === 1 ? 'black' : 'white'" />
          <span class="flex flex-col leading-tight">
            <span class="font-display text-[1.3rem]">{{ seat.name }}</span>
            <span class="text-[0.8rem] text-ink-soft">{{ seat.label }}</span>
          </span>
        </li>
      </ul>
    </aside>

    <div class="board-wrap">
      <GomokuBoard
        :board="state.board"
        :last-move="lastMove"
        :win-line="state.winLine"
        :preview="preview"
        :preview-color="human"
        :interactive="myTurn"
        @pick="pick"
      />
    </div>

    <aside class="flex min-w-0 flex-1 flex-col justify-between py-[0.3rem]">
      <div>
        <p class="font-display text-[1.5rem] leading-tight" :class="{ 'text-leaf': myTurn }">{{ status }}</p>
        <p v-if="phase !== 'rps'" class="text-[0.85rem] text-ink-soft tabular-nums">{{ T.moveCount(state.moves.length) }}</p>
        <p class="note pt-[0.5rem] text-[0.88rem] leading-snug" :class="message ? 'text-red' : 'text-ink-soft'">
          {{ message || (myTurn ? T.previewHint : '') }}
        </p>
      </div>
      <div class="flex flex-col gap-[0.6rem]">
        <InkButton v-if="phase === 'over'" tone="red" size="lg" @click="restart">{{ S.common.again }}</InkButton>
        <InkButton v-else tone="red" size="lg" :disabled="!myTurn || preview < 0" @click="confirmMove">{{ T.place }}</InkButton>
      </div>
    </aside>

    <RpsDuel :open="phase === 'rps' && !menuOpen" @done="startAfterRps" />
    <GameMenu :open="menuOpen" :game="game" :options="props.options" @close="menuOpen = false" @restart="restart" @exit="emit('exit')" />
    <InkDialog :open="resultOpen" :title="resultTitle" @close="resultOpen = false">
      <p class="text-center text-[1rem]">{{ state.winner === 3 ? T.drawLead : T.winLead(state.moves.length) }}</p>
      <p class="pt-[0.3rem] text-center text-[0.85rem] text-ink-soft tabular-nums">{{ T.record(stats.gomoku.wins, stats.gomoku.losses, stats.gomoku.draws) }}</p>
      <template #actions>
        <InkButton tone="red" @click="restart">{{ S.common.again }}</InkButton>
        <InkButton :variant="1" @click="emit('exit')">{{ S.common.quit }}</InkButton>
      </template>
    </InkDialog>
  </section>
</template>

<style scoped>
.board-wrap {
  height: 100%;
  aspect-ratio: 1;
  flex-shrink: 0;
}
.icon-btn {
  display: grid;
  place-items: center;
  width: 2.6rem;
  height: 2.6rem;
  margin-left: -0.4rem;
  border: 0;
  background: none;
  transition: transform 160ms var(--ease-out);
}
.icon-btn:active {
  transform: scale(0.92);
}
.seat {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.35rem 0.5rem;
  opacity: 0.55;
  transition: opacity 200ms ease;
}
.seat.active {
  opacity: 1;
}
/* 輪到誰：左邊一道綠色筆劃 */
.seat::before {
  content: '';
  position: absolute;
  left: -0.2rem;
  top: 12%;
  width: 0.28rem;
  height: 76%;
  border-radius: 0.2rem;
  background: var(--color-leaf);
  transform: scaleY(0);
  transition: transform 220ms var(--ease-out);
}
.seat.active::before {
  transform: scaleY(1);
}
.dot {
  width: 1.7rem;
  height: 1.7rem;
  flex-shrink: 0;
  border: 0.14rem solid var(--color-ink);
  border-radius: 50%;
}
.dot.black {
  background: var(--color-ink);
}
.dot.white {
  background: var(--color-card);
}
.note {
  min-height: 2.6em;
}
</style>
