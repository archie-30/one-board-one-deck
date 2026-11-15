<script setup lang="ts">
// 黑白棋：你在左、對手在右，中間 8 × 8 棋盤。先猜拳決定黑白（贏的人拿黑棋先下）。
// 棋子從棋罐飛到落點，被夾到的子一顆顆翻面；沒地方下就自動輪空，雙方都沒地方下就結束、數子。
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'
import { playSound } from '@/core/audio'
import { useGrace } from '@/core/grace'
import { reducedMotion } from '@/core/motion'
import { opponentById, pickOpponents } from '@/core/opponents'
import { stats } from '@/core/settings'
import { PLAYER_LOOK } from '@/data/names'
import { S } from '@/data/strings'
import { TURN_SECONDS } from '@/data/timer'
import { asLevel, extraThink, othelloAt } from '@/engine/common/difficulty'
import { seedRng } from '@/engine/common/rng'
import { chooseOthelloMove } from '@/engine/othello/ai'
import { applyOthello, countDiscs, createOthello, flipsFor, legalMoves, toXY, type OthelloState, type Player } from '@/engine/othello/rules'
import type { GameDef } from '@/games/types'
import Avatar from '@/ui/art/Avatar.vue'
import Bowl from '@/ui/art/Bowl.vue'
import type { Mood as KidMood } from '@/ui/art/look'
import Stone from '@/ui/art/Stone.vue'
import Btn from '@/ui/Btn.vue'
import Dialog from '@/ui/Dialog.vue'
import GameMenu from '@/ui/GameMenu.vue'
import IconBtn from '@/ui/IconBtn.vue'
import RpsDuel from '@/ui/RpsDuel.vue'
import TurnGlow from '@/ui/TurnGlow.vue'
import TurnTimer from '@/ui/TurnTimer.vue'
import UndoBtn from '@/ui/UndoBtn.vue'
import OthelloBoard from './OthelloBoard.vue'

const props = defineProps<{ game: GameDef; options: Record<string, string | boolean>; resume?: unknown }>()
const emit = defineEmits<{ exit: []; save: [data: unknown] }>()

/** 「保存進度並退出」存的資料 */
interface Saved {
  state: OthelloState
  human: Player
  opponent: number
  rng: number
  undoFrom?: OthelloState | null
  undoUsed?: boolean
}

/** 規則設定的「倒數計時」 */
const timed = props.options.timer !== false
/** 難度：只決定電腦多強 */
const level = asLevel(props.options.difficulty)
const T = S.othello

const state = ref<OthelloState>(createOthello())
const human = ref<Player>(1)
const opponent = ref(pickOpponents(1)[0])
const phase = ref<'rps' | 'playing' | 'over'>('rps')
const preview = ref(-1)
const message = ref('')
const menuOpen = ref(false)
const resultOpen = ref(false)
const flying = ref(false)
const moods = ref<[KidMood, KidMood]>(['idle', 'idle'])
/** 悔棋：每局一次，退回玩家上一步之前的局面 */
const undoFrom = shallowRef<OthelloState | null>(null)
const undoUsed = ref(false)
let rng = seedRng(Date.now())
const timers = new Set<number>()
const later = (fn: () => void, ms: number) => {
  const id = window.setTimeout(() => {
    timers.delete(id)
    // 暫停中（選單打開）：電腦也停下來，等繼續再走
    if (menuOpen.value) later(fn, 250)
    else fn()
  }, ms)
  timers.add(id)
}
onBeforeUnmount(() => timers.forEach((t) => window.clearTimeout(t)))

const ai = computed<Player>(() => (human.value === 1 ? 2 : 1))
const myTurn = computed(() => phase.value === 'playing' && !flying.value && state.value.turn === human.value)
const hints = computed(() => (myTurn.value ? legalMoves(state.value.board, human.value) : []))
const count = computed(() => countDiscs(state.value.board))
const mine = computed(() => (human.value === 1 ? count.value.black : count.value.white))
const theirs = computed(() => (human.value === 1 ? count.value.white : count.value.black))
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
  const [x, y] = toXY(index)
  const total = 90
  return { x: rect.left + (rect.width * (10 + x * 10)) / total, y: rect.top + (rect.height * (10 + y * 10)) / total, d: (rect.width * 7.8) / total }
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
      { transform: `translate(${(x0 + x1) / 2}px, ${(y0 + y1) / 2 - lift}px) translate(-50%, -50%) scale(1.4)`, offset: 0.5 },
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
function reset() {
  state.value = createOthello()
  preview.value = -1
  message.value = ''
  moods.value = ['idle', 'idle']
  undoFrom.value = null
  undoUsed.value = false
}
function startAfterRps(playerWins: boolean) {
  human.value = playerWins ? 1 : 2
  reset()
  phase.value = 'playing'
  if (!playerWins) scheduleCpu()
}

function restart() {
  timers.forEach((t) => window.clearTimeout(t))
  timers.clear()
  menuOpen.value = false
  resultOpen.value = false
  opponent.value = pickOpponents(1)[0]
  reset()
  phase.value = 'rps'
}

/** 下完（或逾時跳過）之後：輪空提示、結束判斷、換電腦 */
function after(prev: OthelloState) {
  const s = state.value
  if (s.lastFlipped.length) {
    window.setTimeout(() => playSound('stonePick'), 140)
    const who = prev.turn === human.value ? 0 : 1
    if (s.lastFlipped.length >= 5) flash(who, 'happy')
  }
  if (s.over) return finish()
  if (s.skipped) message.value = T.skipped(s.skipped === human.value ? S.common.you : opponent.value.name)
  if (s.turn === ai.value) scheduleCpu()
  else moods.value = ['idle', 'idle']
}

async function commit(index: number, who: 0 | 1) {
  if (who === 0) acted.value = true
  if (!flipsFor(state.value.board, index, state.value.turn).length) {
    message.value = T.errors.noFlip
    playSound('error')
    return
  }
  preview.value = -1
  message.value = ''
  const before = state.value
  await fly(who, index, state.value.turn === 1)
  const r = applyOthello(state.value, { type: 'play', index })
  if (!r.ok) return
  if (who === 0) undoFrom.value = before
  state.value = r.state
  playSound('stone')
  after(before)
}

function flash(who: 0 | 1, mood: KidMood) {
  const next: [KidMood, KidMood] = [...moods.value]
  next[who] = mood
  moods.value = next
  later(() => {
    if (moods.value[who] === mood && phase.value === 'playing') {
      const back: [KidMood, KidMood] = [...moods.value]
      back[who] = 'idle'
      moods.value = back
    }
  }, 1100)
}

function finish() {
  phase.value = 'over'
  const w = state.value.winner
  if (w === 3) stats.othello.draws++
  else if (w === human.value) stats.othello.wins++
  else stats.othello.losses++
  moods.value = w === 3 ? ['shock', 'shock'] : w === human.value ? ['happy', 'sad'] : ['sad', 'happy']
  later(() => {
    playSound(w === human.value ? 'win' : w === 3 ? 'draw' : 'lose')
    resultOpen.value = true
  }, 1100)
}

function scheduleCpu() {
  moods.value = [moods.value[0], 'think']
  const st = othelloAt(opponent.value.persona.othello, level, opponent.value.id)
  const think = 800 + st.depth * 150 + extraThink(level) + Math.random() * 500
  later(() => {
    let move: number
    ;[move, rng] = chooseOthelloMove(state.value, st, rng)
    moods.value = [moods.value[0], 'idle']
    if (move >= 0) void commit(move, 1)
  }, think)
}

function pick(index: number) {
  if (!myTurn.value) return
  if (index === preview.value) return confirmMove()
  if (state.value.board[index] !== 0 || !flipsFor(state.value.board, index, human.value).length) {
    message.value = state.value.board[index] !== 0 ? T.errors.occupied : T.errors.noFlip
    return
  }
  message.value = ''
  preview.value = index
  playSound('stonePick')
}

/** 時間到：這一手跳過，換對方 */
function onTimeout() {
  if (!myTurn.value) return
  acted.value = true
  preview.value = -1
  const before = state.value
  const r = applyOthello(state.value, { type: 'timeout' })
  if (!r.ok) return
  undoFrom.value = before
  state.value = r.state
  playSound('error')
  after(before)
  if (phase.value === 'playing') message.value = S.common.timedOut
}

const canUndo = computed(() => phase.value === 'playing' && !flying.value && !!undoFrom.value && !undoUsed.value)
/** 悔棋：電腦還在想就停下來，局面退回玩家上一步之前 */
function undo() {
  if (!canUndo.value || !undoFrom.value) return
  timers.forEach((t) => window.clearTimeout(t))
  timers.clear()
  state.value = undoFrom.value
  undoFrom.value = null
  undoUsed.value = true
  preview.value = -1
  message.value = ''
  moods.value = ['idle', 'idle']
  playSound('stonePick')
}

function confirmMove() {
  if (myTurn.value && preview.value >= 0) void commit(preview.value, 0)
}

// ── 保存進度並退出／讀回存檔 ──
/** 玩家自己有沒有動過（還沒動過就離開：不必按兩次、也不需要存檔） */
const acted = ref(!!props.resume)
const canSave = computed(() => phase.value === 'playing' && acted.value)
/** 目前的進度（可以存檔時才有；還沒動過、已經結束就是 null） */
function snapshot(): Saved | null {
  if (!canSave.value) return null
  return { state: state.value, human: human.value, opponent: opponent.value.id, rng, undoFrom: undoFrom.value, undoUsed: undoUsed.value }
}
function saveAndExit() {
  const data = snapshot()
  if (data) emit('save', data)
}
// 給外框用：切走分頁、離開視窗時自動暫停並存下進度
defineExpose({ pause: () => phase.value === 'playing' && !resultOpen.value && (menuOpen.value = true), snapshot })
if (props.resume) {
  const d = props.resume as Saved
  state.value = d.state
  human.value = d.human
  opponent.value = opponentById(d.opponent)
  rng = d.rng
  undoFrom.value = d.undoFrom ?? null
  undoUsed.value = d.undoUsed ?? false
  phase.value = 'playing'
  if (state.value.turn !== human.value) scheduleCpu()
}
const grace = useGrace(props.options, state, () => state.value.turn === human.value)
</script>

<template>
  <section ref="sectionEl" class="gm">
    <!-- 輪到誰：那個人那一側淡淡亮起 -->
    <TurnGlow side="left" :on="phase === 'playing' && state.turn === human" />
    <TurnGlow side="right" :on="phase === 'playing' && state.turn !== human" />
    <TurnTimer v-if="timed" :side="state.turn === human ? 'left' : 'right'" :active="phase === 'playing' && !flying && !(grace && state.turn === human)" :paused="menuOpen" :seconds="TURN_SECONDS.board" :turn-key="state" @timeout="onTimeout" />
    <div class="corner"><IconBtn icon="menu" :label="S.common.menu" @click="menuOpen = true" /></div>

    <aside class="side left">
      <div class="who rise" :class="{ active: phase === 'playing' && state.turn === human }">
        <span class="av"><Avatar :look="PLAYER_LOOK" :mood="moods[0]" /></span>
        <span :ref="(el) => (bowlEls[0] = el as HTMLElement | null)" class="bowl"><Bowl :black="human === 1" /></span>
      </div>
      <p class="nm t-black"><span class="hl" :class="{ on: phase === 'playing' && state.turn === human }" />{{ S.common.you }}</p>
      <p v-if="phase !== 'rps'" class="t-label tg">{{ human === 1 ? T.black : T.white }}</p>
      <p v-if="phase !== 'rps'" class="t-slab count">{{ String(mine).padStart(2, '0') }}</p>
    </aside>

    <div ref="boardEl" class="board-wrap">
      <OthelloBoard
        :board="state.board"
        :last-move="state.lastMove"
        :flipped="state.lastFlipped"
        :move-key="state.moves"
        :hints="hints"
        :preview="preview"
        :preview-color="human"
        :interactive="myTurn"
        @pick="pick"
      />
    </div>

    <aside class="side right">
      <div class="who rise" style="--i: 1" :class="{ active: phase === 'playing' && state.turn !== human }">
        <span class="av"><Avatar :look="opponent.look" :mood="moods[1]" flip /></span>
        <span :ref="(el) => (bowlEls[1] = el as HTMLElement | null)" class="bowl"><Bowl :black="human === 2" /></span>
      </div>
      <p class="nm t-black"><span class="hl" :class="{ on: phase === 'playing' && state.turn !== human }" />{{ opponent.name }}</p>
      <p class="t-label tg">{{ opponent.tag }}<template v-if="phase !== 'rps'"> · {{ human === 2 ? T.black : T.white }}</template></p>
      <p v-if="phase !== 'rps'" class="t-slab count">{{ String(theirs).padStart(2, '0') }}</p>
      <div class="status-box">
        <p class="status" :class="{ mine: myTurn && !message, warn: !!message }">{{ status }}</p>
        <p class="hint">{{ myTurn && !message ? T.previewHint : '' }}</p>
      </div>
      <div class="act">
        <template v-if="phase === 'over'">
          <Btn tone="ink" icon="again" block @click="restart">{{ S.common.again }}</Btn>
          <Btn class="mt-[0.5rem]" size="sm" icon="book" block @click="resultOpen = true">{{ S.common.showResult }}</Btn>
        </template>
        <template v-else>
          <Btn tone="red" size="lg" arrow block :disabled="!myTurn || preview < 0" @click="confirmMove">{{ T.place }}</Btn>
          <UndoBtn class="mt-[0.5rem]" block :disabled="!canUndo" :used="undoUsed" @undo="undo" />
        </template>
      </div>
    </aside>

    <div ref="flier" class="flier"><svg viewBox="-12 -12 26 26"><Stone :cx="0" :cy="0" :r="10" :black="flierBlack" /></svg></div>

    <RpsDuel :open="phase === 'rps' && !menuOpen" :opponent="opponent" :seconds="timed ? TURN_SECONDS.rps : 0" @done="startAfterRps" @back="emit('exit')" />
    <GameMenu :open="menuOpen" :game="game" :options="props.options" :can-save="canSave" @close="menuOpen = false" @restart="restart" @exit="emit('exit')" @save-exit="saveAndExit" />
    <Dialog flip :open="resultOpen" :title="resultTitle" :label="T.resultLabel" tone="blue" @close="resultOpen = false">
      <p class="text-[0.95rem]">{{ T.resultLead(count.black, count.white) }}</p>
      <p class="t-label pt-[0.4rem] text-ink-2">{{ T.record(stats.othello.wins, stats.othello.losses, stats.othello.draws) }}</p>
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
.count {
  margin-top: 0.3rem;
  font-size: 1.7rem;
  line-height: 1;
  color: var(--color-red);
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
