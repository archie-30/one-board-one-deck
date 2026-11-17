<script setup lang="ts">
// 西洋跳棋對局：你在左、對手在右，中間一張 8 × 8 棋盤。開局猜拳，贏的人拿黑子先走；玩家那一方永遠在棋盤下方。
// 操作：點自己的棋子 → 能走到的格子出現圓點 → 點那一格走過去（連吃一口氣跳完）。能吃一定要吃時，能吃的子會發亮。
// 悔棋每局一次：棋子沿原路跳回去、被吃的子冒回來（連線時要對方同意）。
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { playSound } from '@/core/audio'
import { useBoardNet } from '@/core/boardNet'
import { useGrace } from '@/core/grace'
import { watchSeats } from '@/core/onlineMatch'
import { opponentById, pickOpponents } from '@/core/opponents'
import { myLook } from '@/core/profile'
import { recordResult, stats } from '@/core/settings'
import { S } from '@/data/strings'
import { TURN_SECONDS } from '@/data/timer'
import { chooseCheckersMove } from '@/engine/checkers/ai'
import { applyCheckers, countPieces, createCheckers, legalMoves, type Cell, type CheckersMove, type CheckersState, type Side } from '@/engine/checkers/rules'
import { asLevel, checkersAt, extraThink } from '@/engine/common/difficulty'
import { seedRng, type RngState } from '@/engine/common/rng'
import type { GameDef } from '@/games/types'
import Avatar from '@/ui/art/Avatar.vue'
import type { Mood } from '@/ui/art/look'
import Btn from '@/ui/Btn.vue'
import Dialog from '@/ui/Dialog.vue'
import GameMenu from '@/ui/GameMenu.vue'
import IconBtn from '@/ui/IconBtn.vue'
import RematchBtn from '@/ui/RematchBtn.vue'
import RpsDuel from '@/ui/RpsDuel.vue'
import TurnGlow from '@/ui/TurnGlow.vue'
import TurnTimer from '@/ui/TurnTimer.vue'
import UndoBtn from '@/ui/UndoBtn.vue'
import CheckersBoard from './CheckersBoard.vue'

const props = defineProps<{ game: GameDef; options: Record<string, string | boolean>; resume?: unknown }>()
const emit = defineEmits<{ exit: []; save: [data: unknown] }>()
const T = S.checkers
const record = stats.checkers
/** 連線對局：伺服器當裁判（猜拳、走子、悔棋、認輸都經過伺服器）；沒有就是一般的單人對電腦 */
const bn = props.resume
  ? null
  : useBoardNet('checkers', {
      watchStart: (leftFirst) => startAfterRps(leftFirst),
      apply: (ev) => netApply(ev),
      undo: (by) => netUndo(by),
      resign: (player) => netResign(player),
    })
/** 觀戰：只能看，畫面左邊是 0 號座位那位玩家 */
const watching = !!bn?.watching
const meName = bn?.watching ? bn.left.name : S.common.you
const meLook = () => (bn?.watching ? bn.left.look : myLook())

/** 規則設定：連線時照房主的 */
const rules = bn ? { ...props.options, ...bn.net.opts } : props.options
const timed = rules.timer !== false
const level = asLevel(rules.difficulty)
const opts = { forceCapture: rules.forceCapture !== false }

interface Saved {
  state: CheckersState
  human: Side
  opponent: number
  rng: number
  undoUsed?: boolean
}
const saved = (props.resume ?? null) as Saved | null

const state = shallowRef<CheckersState>(saved ? saved.state : createCheckers(opts))
const human = ref<Side>(saved ? saved.human : 0)
const grace = useGrace(props.options, state, () => state.value.turn === human.value)
const opponent = ref(bn ? bn.opponent : saved ? opponentById(saved.opponent) : pickOpponents(1)[0])
// 連線：對手離開房間、改由電腦代打時，名字換成「＿（電腦代打）」
if (bn) watchSeats(bn.net, (ps) => (opponent.value = ps[1]))
const phase = ref<'rps' | 'playing' | 'over'>(saved ? 'playing' : 'rps')
const selected = ref(-1)
const message = ref('')
const menuOpen = ref(false)
const resultOpen = ref(false)
const resignOpen = ref(false)
const thinking = ref(false)
/** 悔棋倒帶中 */
const rewinding = ref(false)
const moods = ref<[Mood, Mood]>(['idle', 'idle'])
let rng: RngState = saved ? saved.rng : seedRng(Date.now())
const undoUsed = ref(saved?.undoUsed ?? false)
/** 上一步（棋盤做動畫用：路線、被吃的子原本是什麼） */
const last = shallowRef<{ path: number[]; captured: { i: number; c: Cell }[] } | null>(null)
const rewind = ref<{ key: number; steps: { path: number[]; captured: { i: number; c: Cell }[] }[] } | null>(null)
/** 每一步之前的局面、誰走的、走了哪裡（悔棋找「那一方上一手之前」，倒帶動畫用） */
const hist: { state: CheckersState; side: number; step: { path: number[]; captured: { i: number; c: Cell }[] } | null }[] = []
const timers = new Set<number>()
const later = (fn: () => void, ms: number) => {
  const id = window.setTimeout(() => {
    timers.delete(id)
    // 暫停中（選單打開）：電腦也停下來，等繼續再走（連線對局不能暫停）
    if (menuOpen.value && !bn) later(fn, 250)
    else fn()
  }, ms)
  timers.add(id)
}
onBeforeUnmount(() => {
  timers.forEach((t) => window.clearTimeout(t))
  bn?.stop()
})

const myTurn = computed(() => !watching && phase.value === 'playing' && !thinking.value && !rewinding.value && state.value.turn === human.value)
const moves = computed(() => (myTurn.value ? legalMoves(state.value) : []))
const targets = computed(() => (selected.value >= 0 ? moves.value.filter((m) => m.path[0] === selected.value).map((m) => m.path[m.path.length - 1]) : []))
/** 一定要吃的時候：能吃的子發亮 */
const mustFrom = computed(() => (opts.forceCapture && moves.value.length && moves.value[0].captured.length ? [...new Set(moves.value.map((m) => m.path[0]))] : []))
const seatName = (side: Side) => (side === 0 ? T.dark : T.red)
const winner = computed(() => state.value.winner)
const resultTitle = computed(() => (winner.value === null ? T.draw : winner.value === human.value ? (watching ? S.online.watchWin(meName) : T.win) : watching ? S.online.watchWin(opponent.value.name) : T.lose(opponent.value.name)))
const status = computed(() => {
  const t = statusText()
  return watching ? S.online.watchingNow + (t ? '・' + t : '') : t
})
function statusText() {
  if (message.value) return message.value
  if (phase.value === 'over') return resultTitle.value
  if (phase.value === 'rps') return ''
  if (state.value.turn === human.value) return watching ? T.cpuTurn(meName) : T.yourTurn
  return T.cpuTurn(opponent.value.name)
}
const hint = computed(() => (!myTurn.value || message.value ? '' : mustFrom.value.length ? T.mustHint : T.pickHint))
/** 吃掉幾顆對方的子 */
const took = (side: Side) => {
  const o = countPieces(state.value, side === 0 ? 1 : 0)
  return 12 - o.men - o.kings
}

// ── 流程 ──
function startAfterRps(playerWins: boolean) {
  human.value = playerWins ? 0 : 1
  state.value = createCheckers(opts)
  hist.length = 0
  last.value = null
  undoUsed.value = false
  phase.value = 'playing'
  if (bn) return bn.next()
  if (!playerWins) scheduleCpu()
}
function restart() {
  if (bn) return
  timers.forEach((t) => window.clearTimeout(t))
  timers.clear()
  menuOpen.value = false
  resultOpen.value = false
  resignOpen.value = false
  opponent.value = pickOpponents(1)[0]
  state.value = createCheckers(opts)
  hist.length = 0
  last.value = null
  selected.value = -1
  message.value = ''
  thinking.value = false
  moods.value = ['idle', 'idle']
  undoUsed.value = false
  acted.value = false
  phase.value = 'rps'
}

function flash(who: 0 | 1, mood: Mood) {
  const next: [Mood, Mood] = [...moods.value]
  next[who] = mood
  moods.value = next
  later(() => {
    if (moods.value[who] === mood && phase.value === 'playing') {
      const back: [Mood, Mood] = [...moods.value]
      back[who] = 'idle'
      moods.value = back
    }
  }, 1200)
}

/** 走一步（who：0 = 左邊的你、1 = 右邊的對手） */
function commit(path: number[], who: 0 | 1): boolean {
  if (who === 0) acted.value = true
  const before = state.value
  const r = applyCheckers(before, { type: 'move', path })
  if (!r.ok) {
    message.value = T.errors[r.reason] ?? ''
    playSound('error')
    return false
  }
  const step = { path: r.state.last!.path, captured: r.state.last!.captured.map((i) => ({ i, c: before.board[i] })) }
  hist.push({ state: before, side: before.turn, step })
  last.value = step
  state.value = r.state
  selected.value = -1
  message.value = ''
  playSound(step.captured.length ? 'chessCapture' : 'piece')
  if (step.captured.length) {
    flash(who, 'happy')
    if (step.captured.length >= 2) flash(who === 0 ? 1 : 0, 'shock')
  }
  if (state.value.last?.crowned) flash(who, 'smug')
  if (state.value.status !== 'playing') finish()
  else if (state.value.turn !== human.value && !bn) scheduleCpu()
  return true
}

function scheduleCpu() {
  thinking.value = true
  moods.value = [moods.value[0], 'think']
  const st = checkersAt(opponent.value.persona.chess, level)
  later(
    () => {
      let m: CheckersMove | null
      ;[m, rng] = chooseCheckersMove(state.value, st, rng)
      thinking.value = false
      moods.value = [moods.value[0], 'idle']
      if (m) commit(m.path, 1)
    },
    500 + Math.min(st.depth, 6) * 140 + extraThink(level) + Math.random() * 400,
  )
}

/** 時間到：這一步跳過，換對方 */
function onTimeout() {
  if (bn || !myTurn.value) return
  acted.value = true
  selected.value = -1
  const r = applyCheckers(state.value, { type: 'timeout' })
  if (!r.ok) return
  hist.push({ state: state.value, side: state.value.turn, step: null })
  state.value = r.state
  playSound('error')
  if (state.value.status !== 'playing') return finish()
  message.value = S.common.timedOut
  scheduleCpu()
}

function finish(wait = 900) {
  phase.value = 'over'
  const w = winner.value
  if (watching) void 0 // 觀戰不記戰績
  else if (w === null) record.draws++
  else if (w === human.value) record.wins++
  else record.losses++
  // 表現：贏的話剩越多子越好；輸的話吃越多越好
  const mine = countPieces(state.value, human.value)
  if (!watching) recordResult('checkers', level, w === null ? 'd' : w === human.value ? 'w' : 'l', w === human.value ? 0.3 + (mine.men + mine.kings * 1.5) / 18 : took(human.value) / 12)
  moods.value = w === null ? ['shock', 'shock'] : w === human.value ? ['happy', 'sad'] : ['sad', 'happy']
  later(() => {
    playSound(w === human.value ? 'win' : w === null ? 'draw' : 'lose')
    resultOpen.value = true
  }, wait)
}

// ── 你的操作 ──
function pick(i: number) {
  if (!myTurn.value) return
  const own = moves.value.some((m) => m.path[0] === i)
  const c = state.value.board[i]
  // 點自己的子：選起來（再點一次取消）
  if (c && (c <= 2 ? 0 : 1) === human.value) {
    if (!own) {
      // 這顆現在不能動（例如別顆一定要吃）
      message.value = mustFrom.value.length ? T.mustHint : ''
      if (message.value) playSound('error')
      return
    }
    selected.value = selected.value === i ? -1 : i
    message.value = ''
    playSound('piecePick')
    return
  }
  if (selected.value < 0) return
  if (!targets.value.includes(i)) {
    selected.value = -1
    return
  }
  // 好幾條路到同一格：選吃最多的
  const m = moves.value.filter((x) => x.path[0] === selected.value && x.path[x.path.length - 1] === i).sort((a, b) => b.captured.length - a.captured.length)[0]
  mine(m.path)
}
/** 自己走一步：連線時送給伺服器（等它送回來才真的走），單人時直接走 */
function mine(path: number[]) {
  if (!bn) return void commit(path, 0)
  if (!applyCheckers(state.value, { type: 'move', path }).ok) return
  acted.value = true
  selected.value = -1
  bn.send({ type: 'move', path })
}

// ── 悔棋 ──
const canUndo = computed(() => {
  void state.value // hist 跟著 state 一起變：讀一下讓它重新算
  if (watching || phase.value !== 'playing' || rewinding.value) return false
  return hist.some((h) => h.side === human.value) && (bn ? true : !undoUsed.value)
})
const usedUndo = computed(() => (bn ? bn.undoUsed.value : undoUsed.value))
/** 倒回到 hist[k] 之前（棋子沿原路跳回去、被吃的子冒回來） */
function revertTo(k: number) {
  const target = hist[k].state
  const steps = hist
    .splice(k)
    .map((h) => h.step)
    .filter((x): x is NonNullable<typeof x> => !!x)
    .reverse()
  state.value = target
  rewind.value = { key: (rewind.value?.key ?? 0) + 1, steps }
  last.value = null
  selected.value = -1
  message.value = ''
  moods.value = ['idle', 'idle']
  playSound('piecePick')
  rewinding.value = true
  window.setTimeout(() => (rewinding.value = false), 260 + Math.max(0, ...steps.map((x) => x.path.length)) * 140)
}
function undo() {
  if (bn) return canUndo.value && bn.askUndo()
  if (!canUndo.value) return
  timers.forEach((t) => window.clearTimeout(t))
  timers.clear()
  thinking.value = false
  undoUsed.value = true
  revertTo(hist.map((h) => h.side).lastIndexOf(human.value))
}
function netUndo(by: number) {
  const k = hist.map((h) => h.side).lastIndexOf(by)
  if (k >= 0) revertTo(k)
  later(() => bn!.next(), 520)
}
if (bn) watch(bn.undoRefused, () => (message.value = S.common.undoRefused(opponent.value.name)))

function resign() {
  resignOpen.value = false
  if (phase.value !== 'playing') return
  if (bn) return bn.resign()
  timers.forEach((t) => window.clearTimeout(t))
  timers.clear()
  thinking.value = false
  const r = applyCheckers(state.value, { type: 'resign', side: human.value })
  if (r.ok) state.value = r.state
  finish(260)
}

// ── 連線對局：伺服器送來的每一步 ──
function netApply(ev: { type: string; player: number; path?: unknown }) {
  const who = ev.player === human.value ? 0 : 1
  if (ev.type === 'move') commit(ev.path as number[], who)
  else {
    const r = applyCheckers(state.value, { type: 'timeout' })
    if (r.ok) {
      hist.push({ state: state.value, side: state.value.turn, step: null })
      state.value = r.state
      if (who === 0) ((message.value = S.common.timedOut), playSound('error'))
      if (state.value.status !== 'playing') finish()
    }
  }
  later(() => bn!.next(), ev.type === 'move' ? 380 : 50)
}
function netResign(player: number) {
  if (phase.value === 'playing') {
    const r = applyCheckers(state.value, { type: 'resign', side: player as Side })
    if (r.ok) state.value = r.state
    finish(260)
  }
  bn!.next()
}

// ── 保存進度並退出 ──
const acted = ref(!!saved)
const canSave = computed(() => !bn && phase.value === 'playing' && acted.value)
function snapshot(): Saved | null {
  if (!canSave.value) return null
  return { state: state.value, human: human.value, opponent: opponent.value.id, rng, undoUsed: undoUsed.value }
}
function saveAndExit() {
  const data = snapshot()
  if (data) emit('save', data)
}
defineExpose({ pause: () => phase.value === 'playing' && !resultOpen.value && (menuOpen.value = true), snapshot })
if (saved && state.value.turn !== human.value) scheduleCpu()
</script>

<template>
  <section class="gm">
    <TurnGlow side="left" :on="phase === 'playing' && state.turn === human" />
    <TurnGlow side="right" :on="phase === 'playing' && state.turn !== human" />
    <TurnTimer v-if="timed" :side="state.turn === human ? 'left' : 'right'" :active="phase === 'playing' && !(grace && state.turn === human)" :paused="!bn && menuOpen" :seconds="TURN_SECONDS.board" :turn-key="state" @timeout="onTimeout" />
    <div class="corner"><IconBtn icon="menu" :label="S.common.menu" @click="menuOpen = true" /></div>

    <aside class="side left">
      <div class="taken">
        <span v-for="k in took(human)" :key="k" class="tk pop" :class="human === 0 ? 'red' : 'dark'" />
      </div>
      <div class="who rise" :class="{ active: phase === 'playing' && state.turn === human }">
        <span class="av"><Avatar :look="meLook()" :mood="moods[0]" /></span>
      </div>
      <p class="nm t-black"><span class="hl" :class="{ on: phase === 'playing' && state.turn === human }" />{{ meName }}</p>
      <p v-if="phase !== 'rps'" class="t-label tg">{{ seatName(human) }}</p>
    </aside>

    <div class="board-wrap">
      <CheckersBoard
        :board="state.board"
        :flip="human === 1"
        :selected="selected"
        :targets="targets"
        :last="last"
        :move-key="state.plies"
        :rewind="rewind"
        :hints="selected < 0 ? mustFrom : []"
        :interactive="myTurn"
        @pick="pick"
      />
    </div>

    <aside class="side right">
      <div class="who rise" style="--i: 1" :class="{ active: phase === 'playing' && state.turn !== human }">
        <span class="av"><Avatar :look="opponent.look" :mood="moods[1]" flip talk /></span>
      </div>
      <p class="nm t-black"><span class="hl" :class="{ on: phase === 'playing' && state.turn !== human }" />{{ opponent.name }}</p>
      <p class="t-label tg">{{ opponent.tag }}<template v-if="phase !== 'rps'"> · {{ seatName(human === 0 ? 1 : 0) }}</template></p>
      <div class="taken">
        <span v-for="k in took(human === 0 ? 1 : 0)" :key="k" class="tk pop" :class="human === 0 ? 'dark' : 'red'" />
      </div>
      <div class="status-box">
        <p class="t-label quiet">{{ phase === 'playing' && state.quiet >= 40 ? T.quietCount(state.quiet) : '' }}</p>
        <p class="t-slab moves">{{ phase !== 'rps' ? String(Math.ceil(state.plies / 2)).padStart(3, '0') : '' }}</p>
        <p class="status" :class="{ mine: myTurn && !message, warn: !!message }">{{ status }}</p>
        <p class="hint">{{ hint }}</p>
      </div>
      <div class="act">
        <template v-if="phase === 'over'">
          <Btn v-if="!bn" tone="ink" icon="again" block @click="restart">{{ S.common.again }}</Btn>
          <RematchBtn v-else tone="ink" block />
          <div class="end2 mt-[0.5rem] grid grid-cols-2 gap-[0.4rem]">
            <Btn size="sm" block @click="resultOpen = true">{{ S.common.showResult }}</Btn>
            <Btn size="sm" block @click="emit('exit')">{{ bn ? S.online.leaveRoom : S.common.quit }}</Btn>
          </div>
        </template>
        <template v-else>
          <UndoBtn v-if="!watching" block :disabled="!canUndo" :used="usedUndo" :waiting="!!bn?.undoWaiting.value" :asked="!!bn?.undoAsked.value" @answer="(ok) => bn?.answerUndo(ok)" @undo="undo" />
          <Btn v-if="!watching" class="mt-[0.5rem]" size="sm" icon="exit" block :disabled="phase !== 'playing'" @click="resignOpen = true">{{ T.resign }}</Btn>
        </template>
      </div>
    </aside>

    <RpsDuel :open="phase === 'rps' && !watching && (!menuOpen || !!bn)" :opponent="opponent" :lead="T.rpsLead" :seconds="timed ? TURN_SECONDS.rps : 0" :remote="bn?.rps" @pick="(h) => bn?.pickRps(h)" @done="startAfterRps" @back="emit('exit')" />
    <GameMenu :open="menuOpen" :game="game" :options="props.options" :can-save="canSave" @close="menuOpen = false" @restart="restart" @exit="emit('exit')" @save-exit="saveAndExit" />

    <Dialog :open="resignOpen" :title="T.resignAsk" :label="game.name" @close="resignOpen = false">
      <template #actions>
        <div class="grid w-full grid-cols-2 gap-[0.8rem]">
          <Btn block @click="resignOpen = false">{{ S.common.cancel }}</Btn>
          <Btn tone="red" block @click="resign">{{ T.resign }}</Btn>
        </div>
      </template>
    </Dialog>

    <Dialog flip :open="resultOpen" :title="resultTitle" :label="T.resultLabel" tone="blue" @close="resultOpen = false">
      <p class="text-[0.95rem]">{{ T.endReason[state.status] }}</p>
      <p v-if="!watching" class="t-label pt-[0.4rem] text-ink-2">{{ T.record(record.wins, record.losses, record.draws) }}</p>
      <template #actions>
        <Btn size="sm" icon="exit" @click="emit('exit')">{{ bn ? S.online.leaveRoom : S.common.quit }}</Btn>
        <Btn size="sm" icon="check" @click="resultOpen = false">{{ S.common.viewBoard }}</Btn>
        <Btn v-if="!bn" tone="red" icon="again" @click="restart">{{ S.common.again }}</Btn>
        <RematchBtn v-else tone="red" />
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
  padding: 0.7rem 1.2rem;
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
  width: 4.4rem;
  height: 4.4rem;
  transition: transform 300ms var(--ease-back);
}
.who.active {
  transform: translateY(-0.3rem);
}
.av {
  position: absolute;
  inset: 0;
}
.av :deep(svg) {
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
/* 吃到的子：一排小圓點 */
.taken {
  display: flex;
  max-width: 8rem;
  min-height: 1rem;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.12rem;
  margin: 0.4rem 0;
}
.tk {
  width: 0.85rem;
  height: 0.85rem;
  border: 0.1rem solid var(--color-ink);
  border-radius: 50%;
}
.tk.dark {
  background: var(--color-ink);
}
.tk.red {
  background: var(--color-red);
}
.status-box {
  margin-top: auto;
  text-align: center;
}
.quiet {
  min-height: 1em;
  color: var(--color-ink-3);
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
.end2 :deep(.face) {
  justify-content: center;
  padding: 0 0.25rem;
  font-size: 0.76rem;
}
.end2 :deep(.lb) {
  flex: none;
}
</style>
