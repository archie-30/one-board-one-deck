<script setup lang="ts">
// 點格棋對局：你在左、對手在右，中間是點陣棋盤（難度決定大小：低 4 × 4、中 5 × 5、高 6 × 6 格）。
// 開局猜拳，贏的人拿紅線先畫。點兩點之間先出現虛線預覽，再點一次（或按「畫這條」）才畫。
// 圍到格子就再畫一條；電腦連吃時一條一條畫，看得清楚。悔棋每局一次（連線時要對方同意）。
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
import { asCardLevel } from '@/engine/common/difficulty'
import { seedRng, type RngState } from '@/engine/common/rng'
import { chooseDotsAction } from '@/engine/dots/ai'
import { applyDots, createDots, sizeOf, type DotsAction, type DotsState, type Side } from '@/engine/dots/rules'
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
import DotsBoard from './DotsBoard.vue'

const props = defineProps<{ game: GameDef; options: Record<string, string | boolean>; resume?: unknown }>()
const emit = defineEmits<{ exit: []; save: [data: unknown] }>()
const T = S.dots
const record = stats.dots
/** 連線對局：伺服器當裁判（猜拳、畫線、悔棋、認輸都經過伺服器）；沒有就是一般的單人對電腦 */
const bn = props.resume
  ? null
  : useBoardNet('dots', {
      watchStart: (leftFirst) => startAfterRps(leftFirst),
      apply: (ev) => netApply(ev),
      undo: (by) => netUndo(by),
      resign: (player) => netResign(player),
    })
const watching = !!bn?.watching
const meName = bn?.watching ? bn.left.name : S.common.you
const meLook = () => (bn?.watching ? bn.left.look : myLook())

/** 規則設定：連線時照房主的 */
const rules = bn ? { ...props.options, ...bn.net.opts } : props.options
const timed = rules.timer !== false
const level = asCardLevel(rules.difficulty)
const size = sizeOf(level)

interface Saved {
  state: DotsState
  human: Side
  opponent: number
  rng: number
  undoUsed?: boolean
}
const saved = (props.resume ?? null) as Saved | null

const state = shallowRef<DotsState>(saved ? saved.state : createDots(size))
const human = ref<Side>(saved ? saved.human : 0)
const grace = useGrace(props.options, state, () => state.value.turn === human.value)
const opponent = ref(bn ? bn.opponent : saved ? opponentById(saved.opponent) : pickOpponents(1)[0])
if (bn) watchSeats(bn.net, (ps) => (opponent.value = ps[1]))
const phase = ref<'rps' | 'playing' | 'over'>(saved ? 'playing' : 'rps')
const message = ref('')
const menuOpen = ref(false)
const resultOpen = ref(false)
const thinking = ref(false)
const moods = ref<[Mood, Mood]>(['idle', 'idle'])
let rng: RngState = saved ? saved.rng : seedRng(Date.now())
const undoUsed = ref(saved?.undoUsed ?? false)
/** 選好、還沒畫的那條線；滑鼠停的那條 */
const chosen = ref(-1)
const hovered = ref<number | null>(null)
const hist: { state: DotsState; side: number }[] = []
const timers = new Set<number>()
const later = (fn: () => void, ms: number) => {
  const id = window.setTimeout(() => {
    timers.delete(id)
    if (menuOpen.value && !bn) later(fn, 250)
    else fn()
  }, ms)
  timers.add(id)
}
onBeforeUnmount(() => {
  timers.forEach((t) => window.clearTimeout(t))
  bn?.stop()
})

const myTurn = computed(() => !watching && phase.value === 'playing' && !thinking.value && state.value.turn === human.value)
const opSide = computed<Side>(() => (human.value === 0 ? 1 : 0))
const seatName = (side: Side) => (side === 0 ? T.red : T.blue)
const winner = computed(() => state.value.winner)
const resultTitle = computed(() => (winner.value === null ? T.draw : winner.value === human.value ? (watching ? S.online.watchWin(meName) : T.win) : watching ? S.online.watchWin(opponent.value.name) : T.lose(opponent.value.name)))
/** 剛剛圍到格子、要再畫一條 */
const again = computed(() => !!state.value.last?.boxes.length && state.value.turn === state.value.last.side)
const status = computed(() => {
  const t = statusText()
  return watching ? S.online.watchingNow + (t ? '・' + t : '') : t
})
function statusText() {
  if (message.value) return message.value
  if (phase.value === 'over') return resultTitle.value
  if (phase.value === 'rps') return ''
  if (state.value.turn === human.value) {
    if (watching) return again.value ? T.cpuAgain(meName) : T.cpuTurn(meName)
    if (chosen.value >= 0) return T.pickAgain
    return again.value ? T.again : T.yourTurn
  }
  return again.value ? T.cpuAgain(opponent.value.name) : T.cpuTurn(opponent.value.name)
}
const preview = computed(() => {
  if (!myTurn.value) return null
  const l = chosen.value >= 0 ? chosen.value : hovered.value
  return l !== null && l >= 0 && !state.value.lines[l] ? { line: l, side: human.value } : null
})

// ── 流程 ──
function startAfterRps(playerWins: boolean) {
  human.value = playerWins ? 0 : 1
  state.value = createDots(size)
  hist.length = 0
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
  opponent.value = pickOpponents(1)[0]
  state.value = createDots(size)
  hist.length = 0
  message.value = ''
  thinking.value = false
  chosen.value = -1
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

/** 做一步（who：0 = 左邊的你、1 = 右邊的對手） */
function commit(a: DotsAction, who: 0 | 1): boolean {
  if (who === 0) acted.value = true
  const before = state.value
  const r = applyDots(before, a)
  if (!r.ok) {
    message.value = T.errors[r.reason] ?? ''
    playSound('error')
    return false
  }
  hist.push({ state: before, side: before.turn })
  state.value = r.state
  message.value = ''
  chosen.value = -1
  const got = r.state.last?.boxes.length ?? 0
  playSound(got ? 'capture' : 'piece')
  // 一次圍到兩格：得意；圍到一格：開心
  if (got >= 2) flash(who, 'smug')
  else if (got) flash(who, 'happy')
  if (state.value.status !== 'playing') finish()
  else if (state.value.turn !== human.value && !bn) scheduleCpu(got > 0)
  return true
}

function scheduleCpu(chain = false) {
  thinking.value = true
  moods.value = [moods.value[0], 'think']
  later(
    () => {
      let a: DotsAction
      ;[a, rng] = chooseDotsAction(state.value, level, rng)
      thinking.value = false
      moods.value = [moods.value[0], 'idle']
      commit(a, 1)
    },
    // 連吃時一條一條畫，快一點但看得清楚
    chain ? 380 + Math.random() * 220 : 700 + (level === 'high' ? 300 : 0) + Math.random() * 500,
  )
}

/** 時間到：這一手跳過，換對方 */
function onTimeout() {
  if (bn || !myTurn.value) return
  acted.value = true
  chosen.value = -1
  const r = applyDots(state.value, { type: 'timeout' })
  if (!r.ok) return
  hist.push({ state: state.value, side: state.value.turn })
  state.value = r.state
  playSound('error')
  message.value = S.common.timedOut
  scheduleCpu()
}

function finish(wait = 900) {
  phase.value = 'over'
  const w = winner.value
  if (watching) void 0
  else if (w === null) record.draws++
  else if (w === human.value) record.wins++
  else record.losses++
  // 表現：贏多少格／輸的話差多少格（佔全部格子的比例）
  const total = size * size
  const diff = (state.value.score[human.value] - state.value.score[opSide.value]) / total
  if (!watching) recordResult('dots', level, w === null ? 'd' : w === human.value ? 'w' : 'l', w === human.value ? 0.3 + diff * 1.4 : 1 + diff * 2)
  moods.value = w === null ? ['shock', 'shock'] : w === human.value ? ['happy', 'sad'] : ['sad', 'happy']
  later(() => {
    playSound(w === human.value ? 'win' : w === null ? 'draw' : 'lose')
    resultOpen.value = true
  }, wait)
}

// ── 你的操作 ──
watch(state, () => {
  resignArmed.value = false
})
/** 點線：第一下預覽，再點同一條才畫 */
function pick(l: number) {
  if (!myTurn.value || state.value.lines[l]) return
  if (chosen.value === l) return confirmLine()
  chosen.value = l
  message.value = ''
  playSound('piecePick')
}
function confirmLine() {
  if (!myTurn.value || chosen.value < 0) return
  const l = chosen.value
  chosen.value = -1
  mine({ type: 'line', line: l })
}

// 認輸並結算：要按兩次
const resignArmed = ref(false)
const undoArmed = ref(false)
let resignTimer = 0
function resign() {
  if (phase.value !== 'playing' || watching) return
  if (!resignArmed.value) {
    resignArmed.value = true
    window.clearTimeout(resignTimer)
    resignTimer = window.setTimeout(() => (resignArmed.value = false), 2500)
    return
  }
  resignArmed.value = false
  window.clearTimeout(resignTimer)
  if (bn) return bn.resign()
  timers.forEach((t) => window.clearTimeout(t))
  timers.clear()
  thinking.value = false
  acted.value = true
  const r = applyDots(state.value, { type: 'resign', side: human.value })
  if (r.ok) state.value = r.state
  finish(260)
}
/** 自己畫一條：連線時送給伺服器（等它送回來才真的畫），單人時直接畫 */
function mine(a: DotsAction) {
  if (!bn) return void commit(a, 0)
  if (!applyDots(state.value, a).ok) return
  acted.value = true
  bn.send(a)
}

// ── 悔棋 ──
const canUndo = computed(() => {
  void state.value
  if (watching || phase.value !== 'playing') return false
  return hist.some((h) => h.side === human.value) && (bn ? true : !undoUsed.value)
})
const usedUndo = computed(() => (bn ? bn.undoUsed.value : undoUsed.value))
function revertTo(k: number) {
  state.value = hist[k].state
  hist.splice(k)
  message.value = ''
  chosen.value = -1
  moods.value = ['idle', 'idle']
  playSound('piecePick')
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
  later(() => bn!.next(), 420)
}
if (bn) watch(bn.undoRefused, () => (message.value = S.common.undoRefused(opponent.value.name)))

// ── 連線對局：伺服器送來的每一步 ──
function netApply(ev: { type: string; player: number; line?: unknown }) {
  const who = ev.player === human.value ? 0 : 1
  if (ev.type === 'line') commit({ type: 'line', line: ev.line as number }, who)
  else {
    const r = applyDots(state.value, { type: 'timeout' })
    if (r.ok) {
      hist.push({ state: state.value, side: state.value.turn })
      state.value = r.state
      if (who === 0) ((message.value = S.common.timedOut), playSound('error'))
    }
  }
  later(() => bn!.next(), ev.type === 'timeout' ? 50 : 380)
}
function netResign(player: number) {
  if (phase.value === 'playing') {
    const r = applyDots(state.value, { type: 'resign', side: player as Side })
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
    <TurnGlow side="left" me :on="phase === 'playing' && state.turn === human" />
    <TurnGlow side="right" :on="phase === 'playing' && state.turn !== human" />
    <TurnTimer v-if="timed" :side="state.turn === human ? 'left' : 'right'" :active="phase === 'playing' && !(grace && state.turn === human)" :paused="!bn && menuOpen" :seconds="TURN_SECONDS.board" :turn-key="state" @timeout="onTimeout" />
    <div class="corner"><IconBtn icon="menu" :label="S.common.menu" @click="menuOpen = true" /></div>

    <aside class="side left">
      <p v-if="phase !== 'rps'" class="score"><b class="t-slab" :class="`c${human}`">{{ state.score[human] }}</b><span class="t-label">{{ T.boxes }}</span></p>
      <div class="who rise" :class="{ active: phase === 'playing' && state.turn === human }">
        <span class="av"><Avatar :look="meLook()" :mood="moods[0]" /></span>
      </div>
      <p class="nm t-black"><span class="dotc" :class="`c${human}`" /><span class="hl" :class="{ on: phase === 'playing' && state.turn === human }" />{{ meName }}</p>
      <p v-if="phase !== 'rps'" class="t-label tg">{{ seatName(human) }}</p>
    </aside>

    <div class="board-wrap">
      <DotsBoard
        :n="state.n"
        :lines="state.lines"
        :boxes="state.boxes"
        :interactive="myTurn"
        :preview="preview"
        :last="state.last?.line"
        :got="state.last?.boxes"
        @pick="pick"
        @hover="(l) => (hovered = l)"
      />
    </div>

    <aside class="side right">
      <div class="who rise" style="--i: 1" :class="{ active: phase === 'playing' && state.turn !== human }">
        <span class="av"><Avatar :look="opponent.look" :mood="moods[1]" flip talk /></span>
      </div>
      <p class="nm t-black"><span class="dotc" :class="`c${opSide}`" /><span class="hl" :class="{ on: phase === 'playing' && state.turn !== human }" />{{ opponent.name }}</p>
      <p class="t-label tg">{{ opponent.tag }}<template v-if="phase !== 'rps'"> · {{ seatName(opSide) }}</template></p>
      <p v-if="phase !== 'rps'" class="score sm"><b class="t-slab" :class="`c${opSide}`">{{ state.score[opSide] }}</b><span class="t-label">{{ T.boxes }}</span></p>
      <div class="status-box">
        <p class="status" :class="{ mine: myTurn && !message, warn: !!message }">{{ status }}</p>
      </div>
      <div class="act">
        <template v-if="phase === 'over'">
          <Btn v-if="!bn" tone="ink" icon="again" block @click="restart">{{ S.common.again }}</Btn>
          <RematchBtn v-else tone="ink" block />
          <div class="end2 mt-[0.8rem] grid grid-cols-2 gap-x-[0.4rem] gap-y-[0.7rem]">
            <Btn size="sm" block @click="resultOpen = true">{{ S.common.showResult }}</Btn>
            <Btn size="sm" block @click="emit('exit')">{{ bn ? S.online.backRoom : S.common.quit }}</Btn>
          </div>
        </template>
        <template v-else-if="!watching">
          <Btn tone="red" icon="check" block :disabled="!myTurn || chosen < 0" @click="confirmLine">{{ T.drawHere }}</Btn>
          <div class="pair" :class="{ undoWide: undoArmed || !!bn?.undoAsked.value, resignWide: resignArmed }">
            <div class="slot u">
              <UndoBtn block :disabled="!canUndo" :used="usedUndo" :waiting="!!bn?.undoWaiting.value" :asked="!!bn?.undoAsked.value" @answer="(ok) => bn?.answerUndo(ok)" @undo="undo" @armed="(on) => (undoArmed = on)" />
            </div>
            <div class="slot r">
              <Btn size="sm" block :tone="resignArmed ? 'yellow' : 'plain'" :disabled="phase !== 'playing'" @click="resign">{{ resignArmed ? T.resignAgain : T.resign }}</Btn>
            </div>
          </div>
        </template>
      </div>
    </aside>

    <RpsDuel :open="phase === 'rps' && !watching && (!menuOpen || !!bn)" :opponent="opponent" :lead="T.rpsLead" :seconds="timed ? TURN_SECONDS.rps : 0" :remote="bn?.rps" @pick="(h) => bn?.pickRps(h)" @done="startAfterRps" @back="emit('exit')" />
    <GameMenu :open="menuOpen" :game="game" :options="props.options" :can-save="canSave" @close="menuOpen = false" @restart="restart" @exit="emit('exit')" @save-exit="saveAndExit" />

    <Dialog flip :open="resultOpen" :title="resultTitle" :label="T.resultLabel" tone="blue" @close="resultOpen = false">
      <p class="final t-slab"><span :class="`c${human}`">{{ state.score[human] }}</span> : <span :class="`c${opSide}`">{{ state.score[opSide] }}</span></p>
      <p class="text-[0.95rem]">{{ T.endReason[state.status] }}</p>
      <p v-if="!watching" class="t-label pt-[0.4rem] text-ink-2">{{ T.record(record.wins, record.losses, record.draws) }}</p>
      <template #actions>
        <Btn size="sm" icon="exit" @click="emit('exit')">{{ bn ? S.online.backRoom : S.common.quit }}</Btn>
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
  height: min(100%, calc(100vw - 23rem - var(--cut-l) - var(--cut-r)));
  align-self: center;
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
  flex-shrink: 0;
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
  display: flex;
  align-items: center;
  gap: 0.3rem;
  margin-top: 0.4rem;
  padding: 0 0.3rem;
  font-size: 1.1rem;
  line-height: 1.3;
}
.dotc {
  width: 0.7rem;
  height: 0.7rem;
  flex-shrink: 0;
  border: 0.1rem solid var(--color-ink);
  border-radius: 50%;
}
.dotc.c0 {
  background: var(--color-red);
}
.dotc.c1 {
  background: var(--color-blue);
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
/* 圍到幾格：大大的數字 */
.score {
  display: flex;
  align-items: baseline;
  gap: 0.25rem;
  margin: 0.2rem 0 0.6rem;
}
.score.sm {
  margin: 0.3rem 0 0;
}
.score b {
  font-size: 2.2rem;
  line-height: 1;
}
.score .t-label {
  font-size: 0.6rem;
  color: var(--color-ink-2);
}
.c0 {
  color: var(--color-red);
}
.c1 {
  color: var(--color-blue);
}
.status-box {
  margin-top: auto;
  text-align: center;
}
.status {
  margin-top: 0.2rem;
  font-size: 1rem;
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
.act {
  width: min(9.6rem, 100%);
  margin-top: 0.4rem;
}
.final {
  margin-bottom: 0.3rem;
  font-size: 2rem;
  line-height: 1.1;
}
.pair {
  display: flex;
  margin: 0.9rem -0.3rem -0.35rem 0;
}
.pair .slot {
  min-width: 0;
  flex: 1 1 0;
  overflow: hidden;
  padding: 0 0.3rem 0.35rem 0;
  transition:
    flex-grow 320ms var(--ease-out),
    opacity 220ms,
    margin 320ms var(--ease-out);
}
.pair .slot.r {
  margin-left: 0.05rem;
}
.pair.undoWide .slot.r,
.pair.resignWide .slot.u {
  flex-grow: 0.0001;
  opacity: 0;
  pointer-events: none;
}
.pair.undoWide .slot.r,
.pair.resignWide .slot.r {
  margin-left: 0;
}
.pair :deep(.face) {
  justify-content: center;
  padding: 0 0.2rem;
  font-size: 0.74rem;
  white-space: nowrap;
}
.pair :deep(.lb) {
  flex: none;
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
