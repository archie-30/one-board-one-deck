<script setup lang="ts">
// 五子棋：你在左、對手在右，中間一張棋盤。棋子從各自的棋罐沿弧線飛到落點，落地時壓扁並泛起墨圈。
import { computed, onBeforeUnmount, ref } from 'vue'
import { playSound } from '@/core/audio'
import { reducedMotion } from '@/core/motion'
import { opponentById, pickOpponents } from '@/core/opponents'
import { stats } from '@/core/settings'
import { PLAYER_LOOK } from '@/data/names'
import { S } from '@/data/strings'
import { seedRng } from '@/engine/common/rng'
import { chooseGomokuMove } from '@/engine/gomoku/ai'
import { canPlace, createGomoku, placeStone, toXY, type GomokuOptions, type GomokuState, type Player } from '@/engine/gomoku/rules'
import type { GameDef } from '@/games/types'
import Avatar from '@/ui/art/Avatar.vue'
import Bowl from '@/ui/art/Bowl.vue'
import type { Mood as KidMood } from '@/ui/art/look'
import Stone from '@/ui/art/Stone.vue'
import Btn from '@/ui/Btn.vue'
import Dialog from '@/ui/Dialog.vue'
import GameMenu from '@/ui/GameMenu.vue'
import TurnGlow from '@/ui/TurnGlow.vue'
import IconBtn from '@/ui/IconBtn.vue'
import RpsDuel from '@/ui/RpsDuel.vue'
import GomokuBoard from './GomokuBoard.vue'

const props = defineProps<{ game: GameDef; options: Record<string, string | boolean>; resume?: unknown }>()
const emit = defineEmits<{ exit: []; save: [data: unknown] }>()

/** 「保存進度並退出」存的資料 */
interface Saved {
  state: GomokuState
  human: Player
  opponent: number
  rng: number
}

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
  if (!el || !bowl || !host || reducedMotion()) return Promise.resolve()
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
  playSound('stonePick')
}

function confirmMove() {
  if (myTurn.value && preview.value >= 0) void commit(preview.value, 0)
}

// ── 保存進度並退出／讀回存檔 ──
const canSave = computed(() => phase.value === 'playing')
function saveAndExit() {
  const data: Saved = { state: state.value, human: human.value, opponent: opponent.value.id, rng }
  emit('save', data)
}
if (props.resume) {
  const d = props.resume as Saved
  state.value = d.state
  human.value = d.human
  opponent.value = opponentById(d.opponent)
  rng = d.rng
  phase.value = 'playing'
  if (state.value.turn !== human.value) scheduleCpu()
}
</script>

<template>
  <section ref="sectionEl" class="gm">
    <!-- 輪到誰：那個人那一側淡淡亮起 -->
    <TurnGlow side="left" :on="phase === 'playing' && state.turn === human" />
    <TurnGlow side="right" :on="phase === 'playing' && state.turn !== human" />
    <div class="corner"><IconBtn icon="menu" :label="S.common.menu" @click="menuOpen = true" /></div>

    <aside class="side left">
      <div class="who rise" :class="{ active: phase === 'playing' && state.turn === human }">
        <span class="av"><Avatar :look="PLAYER_LOOK" :mood="moods[0]" /></span>
        <span :ref="(el) => (bowlEls[0] = el as HTMLElement | null)" class="bowl"><Bowl :black="human === 1" /></span>
      </div>
      <p class="nm t-black"><span class="hl" :class="{ on: phase === 'playing' && state.turn === human }" />{{ S.common.you }}</p>
      <p v-if="phase !== 'rps'" class="t-label tg">{{ human === 1 ? T.black : T.white }}</p>
    </aside>

    <div ref="boardEl" class="board-wrap">
      <GomokuBoard :board="state.board" :last-move="lastMove" :win-line="state.winLine" :preview="preview" :preview-color="human" :interactive="myTurn" @pick="pick" />
    </div>

    <aside class="side right">
      <div class="who rise" style="--i: 1" :class="{ active: phase === 'playing' && state.turn !== human }">
        <span class="av"><Avatar :look="opponent.look" :mood="moods[1]" flip /></span>
        <span :ref="(el) => (bowlEls[1] = el as HTMLElement | null)" class="bowl"><Bowl :black="human === 2" /></span>
      </div>
      <p class="nm t-black"><span class="hl" :class="{ on: phase === 'playing' && state.turn !== human }" />{{ opponent.name }}</p>
      <p class="t-label tg">{{ opponent.tag }}<template v-if="phase !== 'rps'"> · {{ human === 2 ? T.black : T.white }}</template></p>
      <div class="status-box">
        <p class="t-slab moves">{{ phase !== 'rps' ? String(state.moves.length).padStart(3, '0') : '' }}</p>
        <p class="status" :class="{ mine: myTurn && !message, warn: !!message }">{{ status }}</p>
        <p class="hint">{{ myTurn && !message ? T.previewHint : '' }}</p>
      </div>
      <div class="act">
        <template v-if="phase === 'over'">
          <Btn tone="ink" size="lg" icon="again" block @click="restart">{{ S.common.again }}</Btn>
          <Btn class="mt-[0.5rem]" size="sm" icon="book" block @click="resultOpen = true">{{ S.common.showResult }}</Btn>
        </template>
        <Btn v-else tone="red" size="lg" arrow block :disabled="!myTurn || preview < 0" @click="confirmMove">{{ T.place }}</Btn>
      </div>
    </aside>

    <div ref="flier" class="flier"><svg viewBox="-12 -12 26 26"><Stone :cx="0" :cy="0" :r="10" :black="flierBlack" /></svg></div>

    <RpsDuel :open="phase === 'rps' && !menuOpen" :opponent="opponent" @done="startAfterRps" />
    <GameMenu :open="menuOpen" :game="game" :options="props.options" @close="menuOpen = false" @restart="restart" @exit="emit('exit')" :can-save="canSave" @save-exit="saveAndExit" />
    <Dialog :open="resultOpen" :title="resultTitle" :label="T.resultLabel" :tone="state.winner === human ? 'red' : 'ink'" @close="resultOpen = false">
      <p class="text-[0.95rem]">{{ state.winner === 3 ? T.drawLead : T.winLead(state.moves.length) }}</p>
      <p class="t-label pt-[0.4rem] text-ink-2">{{ T.record(stats.gomoku.wins, stats.gomoku.losses, stats.gomoku.draws) }}</p>
      <template #actions>
        <Btn size="sm" icon="exit" @click="emit('exit')">{{ S.common.quit }}</Btn>
        <Btn size="sm" icon="check" @click="resultOpen = false">{{ S.common.viewBoard }}</Btn>
        <Btn tone="red" icon="again" @click="restart">{{ S.common.again }}</Btn>
      </template>
    </Dialog>
  </section>
</template>

<style scoped>
.gm {
  position: relative;
  isolation: isolate;
  display: flex;
  height: 100%;
  align-items: stretch;
  gap: 1.4rem;
  padding: 0.7rem max(1.2rem, env(safe-area-inset-right)) 0.7rem max(1.2rem, env(safe-area-inset-left));
}
.corner {
  position: absolute;
  left: max(0.9rem, env(safe-area-inset-left));
  top: max(0.7rem, env(safe-area-inset-top));
  z-index: 5;
}
.board-wrap {
  height: 100%;
  aspect-ratio: 1;
  flex-shrink: 0;
  animation: rise 520ms var(--ease-out) both;
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
  padding-bottom: 0.6rem;
}
.right {
  padding-top: 0.4rem;
}
.who {
  position: relative;
  width: 6.4rem;
  height: 5.2rem;
  transition: transform 300ms var(--ease-back);
}
.who.active {
  transform: translateY(-0.3rem);
}
.av {
  position: absolute;
  left: 0;
  top: 0;
  width: 4.2rem;
  height: 4.2rem;
}
.right .av {
  left: auto;
  right: 0;
}
.bowl {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 2.8rem;
  height: 2.8rem;
}
.right .bowl {
  right: auto;
  left: 0;
}
.av :deep(svg),
.bowl :deep(svg) {
  width: 100%;
  height: 100%;
}
.nm {
  position: relative;
  margin-top: 0.4rem;
  padding: 0 0.3rem;
  font-size: 1.1rem;
  line-height: 1.3;
}
.hl {
  position: absolute;
  inset: 0.2rem -0.1rem 0.05rem;
  z-index: -1;
  background: var(--color-yellow);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 300ms var(--ease-out);
}
.hl.on {
  transform: none;
}
.tg {
  font-size: 0.5rem;
  color: var(--color-ink-2);
}
.status-box {
  margin-top: auto;
  text-align: center;
}
.moves {
  font-size: 1.5rem;
  line-height: 1;
  color: var(--color-red);
}
.status {
  margin-top: 0.2rem;
  font-size: 1.05rem;
  font-weight: 900;
  line-height: 1.4;
  color: var(--color-ink-3);
}
.status.mine {
  color: var(--color-ink);
}
.status.warn {
  color: var(--color-red);
}
.hint {
  min-height: 2.4em;
  font-size: 0.72rem;
  line-height: 1.3;
  color: var(--color-ink-2);
}
.act {
  width: 8.6rem;
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
