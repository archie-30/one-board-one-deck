<script setup lang="ts">
// 五子棋：你在左、對手在右，中間一張棋盤。棋子從各自的棋罐沿弧線飛到落點，落地時壓扁並泛起墨圈。
import { computed, onBeforeUnmount, ref } from 'vue'
import { playSound } from '@/core/audio'
import { pickOpponents } from '@/core/opponents'
import { stats } from '@/core/settings'
import { PLAYER_LOOK } from '@/data/names'
import { S } from '@/data/strings'
import { seedRng } from '@/engine/common/rng'
import { chooseGomokuMove } from '@/engine/gomoku/ai'
import { canPlace, createGomoku, placeStone, toXY, type GomokuOptions, type GomokuState, type Player } from '@/engine/gomoku/rules'
import type { GameDef } from '@/games/types'
import ArtBowl from '@/ui/art/ArtBowl.vue'
import ArtKid from '@/ui/art/ArtKid.vue'
import ArtStone from '@/ui/art/ArtStone.vue'
import type { KidMood } from '@/ui/art/kid'
import GameMenu from '@/ui/GameMenu.vue'
import InkDialog from '@/ui/InkDialog.vue'
import MenuButton from '@/ui/MenuButton.vue'
import RoundButton from '@/ui/RoundButton.vue'
import RpsDuel from '@/ui/RpsDuel.vue'
import GomokuBoard from './GomokuBoard.vue'

const props = defineProps<{ game: GameDef; options: Record<string, string | boolean> }>()
const emit = defineEmits<{ exit: [] }>()

const options = { ...props.options } as unknown as GomokuOptions
const T = S.gomoku

const state = ref<GomokuState>(createGomoku(options))
const human = ref<Player>(1)
const opponent = ref(pickOpponents(1)[0])
const phase = ref<'rps' | 'playing' | 'over'>('rps')
const preview = ref(-1)
const message = ref('')
const menuOpen = ref(false)
const resultOpen = ref(false)
const flying = ref(false)
const moods = ref<[KidMood, KidMood]>(['idle', 'idle'])
let rng = seedRng(Date.now())
const timers = new Set<number>()
const later = (fn: () => void, ms: number) => {
  const id = window.setTimeout(() => {
    timers.delete(id)
    fn()
  }, ms)
  timers.add(id)
}
onBeforeUnmount(() => timers.forEach((t) => window.clearTimeout(t)))

const myTurn = computed(() => phase.value === 'playing' && !flying.value && state.value.turn === human.value)
const lastMove = computed(() => state.value.moves[state.value.moves.length - 1] ?? -1)
const resultTitle = computed(() => (state.value.winner === 3 ? T.draw : state.value.winner === human.value ? T.win : T.lose(opponent.value.name)))
const status = computed(() => {
  if (message.value) return message.value
  if (phase.value === 'over') return resultTitle.value
  if (phase.value === 'rps') return ''
  return state.value.turn === human.value ? T.yourTurn : T.cpuTurn(opponent.value.name)
})

// ── 棋子飛行 ──
const sectionEl = ref<HTMLElement>()
const boardEl = ref<HTMLElement>()
const bowlEls = ref<(HTMLElement | null)[]>([null, null])
const flier = ref<HTMLElement>()
const flierBlack = ref(true)

function pointOnScreen(index: number) {
  const rect = boardEl.value!.getBoundingClientRect()
  const [x, y] = toXY(index, state.value.size)
  const total = (state.value.size - 1) * 10 + 14
  return { x: rect.left + (rect.width * (7 + x * 10)) / total, y: rect.top + (rect.height * (7 + y * 10)) / total, d: (rect.width * 8.6) / total }
}

/** 棋子從 who 的棋罐飛到 index，飛完才真的落子 */
function fly(who: 0 | 1, index: number, black: boolean): Promise<void> {
  const el = flier.value
  const bowl = bowlEls.value[who]
  const host = sectionEl.value
  if (!el || !bowl || !host || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve()
  const base = host.getBoundingClientRect()
  const b = bowl.getBoundingClientRect()
  const to = pointOnScreen(index)
  const x0 = b.left + b.width / 2 - base.left
  const y0 = b.top + b.height / 2 - base.top
  const x1 = to.x - base.left
  const y1 = to.y - base.top
  const lift = Math.min(120, Math.abs(x1 - x0) * 0.35 + 40)
  flierBlack.value = black
  el.style.width = `${to.d}px`
  el.style.height = `${to.d}px`
  el.style.display = 'block'
  flying.value = true
  const anim = el.animate(
    [
      { transform: `translate(${x0}px, ${y0}px) translate(-50%, -50%) scale(0.9)` },
      { transform: `translate(${(x0 + x1) / 2}px, ${(y0 + y1) / 2 - lift}px) translate(-50%, -50%) scale(1.45)`, offset: 0.5 },
      { transform: `translate(${x1}px, ${y1}px) translate(-50%, -50%) scale(1)` },
    ],
    { duration: 420, easing: 'cubic-bezier(0.3, 0.6, 0.35, 1)' },
  )
  return anim.finished.then(() => {
    el.style.display = 'none'
    flying.value = false
  })
}

// ── 流程 ──
function startAfterRps(playerWins: boolean) {
  human.value = playerWins ? 1 : 2
  state.value = createGomoku(options)
  preview.value = -1
  message.value = ''
  moods.value = ['idle', 'idle']
  phase.value = 'playing'
  if (!playerWins) scheduleCpu()
}

function restart() {
  timers.forEach((t) => window.clearTimeout(t))
  timers.clear()
  menuOpen.value = false
  resultOpen.value = false
  opponent.value = pickOpponents(1)[0]
  state.value = createGomoku(options)
  preview.value = -1
  message.value = ''
  moods.value = ['idle', 'idle']
  phase.value = 'rps'
}

async function commit(index: number, who: 0 | 1) {
  const error = canPlace(state.value, index)
  if (error) {
    message.value = T.errors[error]
    playSound('error')
    return
  }
  preview.value = -1
  message.value = ''
  await fly(who, index, state.value.turn === 1)
  const result = placeStone(state.value, index)
  if (!result.ok) return
  state.value = result.state
  playSound('stone')
  if (result.state.winner !== 0) finish()
  else if (result.state.turn !== human.value) scheduleCpu()
  else moods.value = ['idle', 'idle']
}

function finish() {
  phase.value = 'over'
  const w = state.value.winner
  if (w === 3) stats.gomoku.draws++
  else if (w === human.value) stats.gomoku.wins++
  else stats.gomoku.losses++
  moods.value = w === 3 ? ['shock', 'shock'] : w === human.value ? ['happy', 'sad'] : ['sad', 'happy']
  later(() => {
    playSound(w === human.value ? 'win' : w === 3 ? 'pass' : 'lose')
    resultOpen.value = true
  }, 1100)
}

function scheduleCpu() {
  moods.value = ['idle', 'think']
  const st = opponent.value.persona.gomoku
  const think = 900 + (1 - st.noise) * 700 + Math.random() * 600
  later(() => {
    let move: number
    ;[move, rng] = chooseGomokuMove(state.value, st, rng)
    if (move >= 0) void commit(move, 1)
  }, think)
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
  if (myTurn.value && preview.value >= 0) void commit(preview.value, 0)
}
</script>

<template>
  <section ref="sectionEl" class="gm">
    <div class="corner"><RoundButton icon="gear" :label="S.common.menu" @click="menuOpen = true" /></div>

    <aside class="side left">
      <div class="who" :class="{ active: phase === 'playing' && state.turn === human }">
        <ArtKid class="kid" :look="PLAYER_LOOK" :mood="moods[0]" :seed="7" />
        <span :ref="(el) => (bowlEls[0] = el as HTMLElement | null)" class="bowl"><ArtBowl :black="human === 1" /></span>
      </div>
      <p class="font-display nm">{{ S.common.you }}</p>
      <p v-if="phase !== 'rps'" class="tg">{{ human === 1 ? T.black : T.white }}</p>
    </aside>

    <div ref="boardEl" class="board-wrap">
      <GomokuBoard :board="state.board" :last-move="lastMove" :win-line="state.winLine" :preview="preview" :preview-color="human" :interactive="myTurn" @pick="pick" />
    </div>

    <aside class="side right">
      <div class="who" :class="{ active: phase === 'playing' && state.turn !== human }">
        <ArtKid class="kid" :look="opponent.look" :mood="moods[1]" :seed="opponent.id" flip />
        <span :ref="(el) => (bowlEls[1] = el as HTMLElement | null)" class="bowl"><ArtBowl :black="human === 2" /></span>
      </div>
      <p class="font-display nm">{{ opponent.name }}</p>
      <p class="tg">{{ opponent.tag }}<template v-if="phase !== 'rps'"> · {{ human === 2 ? T.black : T.white }}</template></p>
      <div class="status-box">
        <p class="status" :class="{ mine: myTurn && !message, warn: !!message }">{{ status }}</p>
        <p v-if="phase !== 'rps'" class="moves font-display">{{ T.moveCount(state.moves.length) }}</p>
        <p class="hint">{{ myTurn && !message ? T.previewHint : '' }}</p>
      </div>
      <div class="act">
        <MenuButton v-if="phase === 'over'" primary icon="again" size="md" :label="S.common.again" :chevron="false" :seed="71" @click="restart" />
        <MenuButton v-else primary icon="stone" size="md" :label="T.place" :chevron="false" :disabled="!myTurn || preview < 0" :seed="73" @click="confirmMove" />
      </div>
    </aside>

    <div ref="flier" class="flier"><svg viewBox="-12 -12 24 24"><ArtStone :cx="0" :cy="0" :r="10" :black="flierBlack" :seed="5" /></svg></div>

    <RpsDuel :open="phase === 'rps' && !menuOpen" :opponent="opponent" @done="startAfterRps" />
    <GameMenu :open="menuOpen" :game="game" :options="props.options" @close="menuOpen = false" @restart="restart" @exit="emit('exit')" />
    <InkDialog :open="resultOpen" :title="resultTitle" @close="resultOpen = false">
      <p class="text-center text-[1rem]">{{ state.winner === 3 ? T.drawLead : T.winLead(state.moves.length) }}</p>
      <p class="font-display pt-[0.3rem] text-center text-[0.8rem] text-ink-soft tabular-nums">{{ T.record(stats.gomoku.wins, stats.gomoku.losses, stats.gomoku.draws) }}</p>
      <template #actions>
        <div class="w-[10rem]"><MenuButton primary icon="again" size="sm" :label="S.common.again" :chevron="false" :seed="75" @click="restart" /></div>
        <div class="w-[10rem]"><MenuButton icon="exit" size="sm" :label="S.common.quit" :chevron="false" :seed="77" @click="emit('exit')" /></div>
      </template>
    </InkDialog>
  </section>
</template>

<style scoped>
.gm {
  position: relative;
  display: flex;
  height: 100%;
  align-items: stretch;
  gap: 1.2rem;
  padding: 0.6rem max(1.2rem, env(safe-area-inset-right)) 0.6rem max(1.2rem, env(safe-area-inset-left));
}
.corner {
  position: absolute;
  left: max(0.8rem, env(safe-area-inset-left));
  top: max(0.6rem, env(safe-area-inset-top));
  z-index: 5;
}
.board-wrap {
  height: 100%;
  aspect-ratio: 1;
  flex-shrink: 0;
  animation: pop 360ms var(--ease-back) both;
}
.side {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  align-items: center;
}
.left {
  justify-content: flex-end;
  padding-bottom: 1rem;
}
.right {
  justify-content: flex-start;
  padding-top: 0.6rem;
}
.who {
  position: relative;
  width: 7rem;
  height: 8.6rem;
  transition: transform 300ms var(--ease-back);
}
.who.active {
  transform: translateY(-0.3rem);
}
.kid {
  position: absolute;
  left: 0;
  top: 0;
  width: 5.4rem;
  height: 7.6rem;
}
.right .kid {
  left: auto;
  right: 0;
}
.bowl {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 3.4rem;
  height: 3.4rem;
}
.right .bowl {
  right: auto;
  left: 0;
}
.bowl :deep(svg) {
  width: 100%;
  height: 100%;
}
.nm {
  position: relative;
  font-size: 1.05rem;
  font-weight: 900;
  line-height: 1.3;
}
.who.active + .nm::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -0.05rem;
  height: 0.17rem;
  border-radius: 0.2rem;
  background: var(--color-red);
  animation: swipe 300ms var(--ease-out) both;
}
.tg {
  font-size: 0.75rem;
  color: var(--color-ink-soft);
}
.status-box {
  margin-top: auto;
  text-align: center;
}
.status {
  font-size: 1.1rem;
  line-height: 1.4;
  color: var(--color-ink-soft);
}
.status.mine {
  color: var(--color-ink);
  font-weight: 700;
}
.status.warn {
  color: var(--color-red);
}
.moves {
  font-size: 0.72rem;
  color: var(--color-mid);
}
.hint {
  min-height: 2.4em;
  font-size: 0.78rem;
  line-height: 1.3;
  color: var(--color-ink-soft);
}
.act {
  width: 9rem;
  margin-top: 0.4rem;
}
.flier {
  position: absolute;
  left: 0;
  top: 0;
  display: none;
  pointer-events: none;
  z-index: 30;
}
.flier svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}
</style>
