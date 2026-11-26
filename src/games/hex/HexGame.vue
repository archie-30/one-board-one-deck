<script setup lang="ts">
// 海克斯對局：你在左、對手在右，中間是菱形的六角格棋盤（規則設定可改 9、11、13 路）。
// 開局猜拳，贏的人拿紅子先下（連通上下兩邊），另一方是藍子（連通左右兩邊）。
// 點一格先出現淡淡的子，再點一次（或按「下這裡」）才下。交換規則有開時，藍方第二手可以按「交換」。
// 悔棋每局一次（連線時要對方同意）。
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
import { asLevel, extraThink } from '@/engine/common/difficulty'
import { seedRng, type RngState } from '@/engine/common/rng'
import { chooseHexAction, distance } from '@/engine/hex/ai'
import { applyHex, canSwap, createHex, sizeOf, type HexAction, type HexState, type Side } from '@/engine/hex/rules'
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
import HexBoard from './HexBoard.vue'

const props = defineProps<{ game: GameDef; options: Record<string, string | boolean>; resume?: unknown }>()
const emit = defineEmits<{ exit: []; save: [data: unknown] }>()
const T = S.hex
const record = stats.hex
/** 連線對局：伺服器當裁判（猜拳、下子、交換、悔棋、認輸都經過伺服器）；沒有就是一般的單人對電腦 */
const bn = props.resume
  ? null
  : useBoardNet('hex', {
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
const level = asLevel(rules.difficulty)
const size = sizeOf(rules.size)
const swapRule = rules.swap === true
/** 棋盤的長寬比（菱形：寬 = 1.5 × (n−1) + 1 格、高 = 1.5 × (n−1) + 2 個半徑） */
const aspect = (() => {
  const w = Math.sqrt(3) * (1.5 * (size - 1) + 1) + 1
  const h = 1.5 * (size - 1) + 2 + 1
  return w / h
})()

interface Saved {
  state: HexState
  human: Side
  opponent: number
  rng: number
  undoUsed?: boolean
}
const saved = (props.resume ?? null) as Saved | null

const state = shallowRef<HexState>(saved ? saved.state : createHex(size, swapRule))
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
/** 選好、還沒下的那一格；滑鼠停的那一格 */
const chosen = ref(-1)
const hovered = ref<number | null>(null)
const hist: { state: HexState; side: number }[] = []
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
const resultTitle = computed(() => (winner.value === human.value ? (watching ? S.online.watchWin(meName) : T.win) : watching ? S.online.watchWin(opponent.value.name) : T.lose(opponent.value.name)))
/** 兩邊各還差幾格才連通 */
const leftOf = (side: Side) => distance(state.value.n, state.value.cells, side)
const swapOk = computed(() => myTurn.value && canSwap(state.value))
const status = computed(() => {
  const t = statusText()
  return watching ? S.online.watchingNow + (t ? '・' + t : '') : t
})
function statusText() {
  if (message.value) return message.value
  if (phase.value === 'over') return resultTitle.value
  if (phase.value === 'rps') return ''
  if (state.value.turn === human.value) {
    if (watching) return T.cpuTurn(meName)
    if (chosen.value >= 0) return T.pickAgain
    return swapOk.value ? T.swapHint : T.yourTurn
  }
  return T.cpuTurn(opponent.value.name)
}
const preview = computed(() => {
  if (!myTurn.value) return null
  const c = chosen.value >= 0 ? chosen.value : hovered.value
  return c !== null && c >= 0 && state.value.cells[c] < 0 ? { cell: c, side: human.value } : null
})

// ── 流程 ──
function startAfterRps(playerWins: boolean) {
  human.value = playerWins ? 0 : 1
  state.value = createHex(size, swapRule)
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
  state.value = createHex(size, swapRule)
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
function commit(a: HexAction, who: 0 | 1): boolean {
  if (who === 0) acted.value = true
  const before = state.value
  const r = applyHex(before, a)
  if (!r.ok) {
    message.value = T.errors[r.reason] ?? ''
    playSound('error')
    return false
  }
  const mover = before.turn
  const foe: Side = mover === 0 ? 1 : 0
  const foeBefore = distance(before.n, before.cells, foe)
  hist.push({ state: before, side: mover })
  state.value = r.state
  message.value = a.type === 'swap' && who === 1 ? T.swapped(opponent.value.name) : ''
  chosen.value = -1
  playSound('stone')
  // 一手讓對方多繞兩格以上：下的人得意、對方嚇一跳
  if (a.type === 'place' && r.state.status === 'playing' && distance(r.state.n, r.state.cells, foe) - foeBefore >= 2) {
    flash(who, 'smug')
    flash(who === 0 ? 1 : 0, 'shock')
  }
  if (state.value.status !== 'playing') finish()
  else if (state.value.turn !== human.value && !bn) scheduleCpu()
  return true
}

function scheduleCpu() {
  thinking.value = true
  moods.value = [moods.value[0], 'think']
  later(
    () => {
      let a: HexAction
      ;[a, rng] = chooseHexAction(state.value, level, rng)
      thinking.value = false
      moods.value = [moods.value[0], 'idle']
      commit(a, 1)
    },
    600 + extraThink(level) * 0.5 + Math.random() * 500,
  )
}

/** 時間到：這一手跳過，換對方 */
function onTimeout() {
  if (bn || !myTurn.value) return
  acted.value = true
  chosen.value = -1
  const r = applyHex(state.value, { type: 'timeout' })
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
  const won = w === human.value
  if (!watching) {
    if (won) record.wins++
    else record.losses++
    // 表現：贏的時候對方還差越多越好；輸的時候自己差越少越接近
    const n = state.value.n
    const perf = won ? 0.4 + Math.min(1, leftOf(opSide.value) / n) * 0.6 : 1 - Math.min(1, leftOf(human.value) / (n * 0.6))
    recordResult('hex', level, won ? 'w' : 'l', perf)
  }
  moods.value = won ? ['happy', 'sad'] : ['sad', 'happy']
  later(() => {
    playSound(won ? 'win' : 'lose')
    resultOpen.value = true
  }, wait)
}

// ── 你的操作 ──
watch(state, () => {
  resignArmed.value = false
})
/** 點格子：第一下預覽，再點同一格才下 */
function pick(c: number) {
  if (!myTurn.value || state.value.cells[c] >= 0) return
  if (chosen.value === c) return confirmCell()
  chosen.value = c
  message.value = ''
  playSound('stonePick')
}
function confirmCell() {
  if (!myTurn.value || chosen.value < 0) return
  const c = chosen.value
  chosen.value = -1
  mine({ type: 'place', cell: c })
}
function swap() {
  if (!swapOk.value) return
  chosen.value = -1
  mine({ type: 'swap' })
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
  const r = applyHex(state.value, { type: 'resign', side: human.value })
  if (r.ok) state.value = r.state
  finish(260)
}
/** 自己下一步：連線時送給伺服器（等它送回來才真的下），單人時直接下 */
function mine(a: HexAction) {
  if (!bn) return void commit(a, 0)
  if (!applyHex(state.value, a).ok) return
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
  playSound('stonePick')
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
function netApply(ev: { type: string; player: number; cell?: unknown }) {
  const who = ev.player === human.value ? 0 : 1
  if (ev.type === 'place') commit({ type: 'place', cell: ev.cell as number }, who)
  else if (ev.type === 'swap') commit({ type: 'swap' }, who)
  else {
    const r = applyHex(state.value, { type: 'timeout' })
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
    const r = applyHex(state.value, { type: 'resign', side: player as Side })
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
  <section class="gm" :style="{ '--ar': aspect }">
    <TurnGlow side="left" me :on="phase === 'playing' && state.turn === human" />
    <TurnGlow side="right" :on="phase === 'playing' && state.turn !== human" />
    <TurnTimer v-if="timed" :side="state.turn === human ? 'left' : 'right'" :active="phase === 'playing' && !(grace && state.turn === human)" :paused="!bn && menuOpen" :seconds="TURN_SECONDS.board" :turn-key="state" @timeout="onTimeout" />
    <div class="corner"><IconBtn icon="menu" :label="S.common.menu" @click="menuOpen = true" /></div>

    <aside class="side left">
      <div class="who rise" :class="{ active: phase === 'playing' && state.turn === human }">
        <span class="av"><Avatar :look="meLook()" :mood="moods[0]" /></span>
      </div>
      <p class="nm t-black"><span class="dotc" :class="`c${human}`" /><span class="hl" :class="{ on: phase === 'playing' && state.turn === human }" />{{ meName }}</p>
      <p v-if="phase !== 'rps'" class="t-label tg">{{ seatName(human) }}</p>
      <p v-if="phase !== 'rps'" class="t-label need">{{ T.left(leftOf(human)) }}</p>
    </aside>

    <div class="board-wrap">
      <HexBoard
        :n="state.n"
        :cells="state.cells"
        :interactive="myTurn"
        :preview="preview"
        :last="state.last && state.last.cell >= 0 ? state.last : null"
        :path="state.path"
        @pick="pick"
        @hover="(c) => (hovered = c)"
      />
    </div>

    <aside class="side right">
      <div class="who rise" style="--i: 1" :class="{ active: phase === 'playing' && state.turn !== human }">
        <span class="av"><Avatar :look="opponent.look" :mood="moods[1]" flip talk /></span>
      </div>
      <p class="nm t-black"><span class="dotc" :class="`c${opSide}`" /><span class="hl" :class="{ on: phase === 'playing' && state.turn !== human }" />{{ opponent.name }}</p>
      <p class="t-label tg">{{ opponent.tag }}<template v-if="phase !== 'rps'"> · {{ seatName(opSide) }}</template></p>
      <p v-if="phase !== 'rps'" class="t-label need">{{ T.left(leftOf(opSide)) }}</p>
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
          <Transition name="swapbtn">
            <Btn v-if="swapOk" class="swap" tone="yellow" size="sm" block @click="swap">{{ T.swap }}</Btn>
          </Transition>
          <Btn tone="red" icon="check" block :disabled="!myTurn || chosen < 0" @click="confirmCell">{{ T.placeHere }}</Btn>
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
      <p class="text-[0.95rem]">{{ T.endReason[state.status] }}</p>
      <p v-if="!watching" class="t-label pt-[0.4rem] text-ink-2">{{ T.record(record.wins, record.losses) }}</p>
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
  gap: 1.2rem;
  padding: 0.7rem 1.2rem;
}
/* 棋盤：菱形比較寬，照長寬比放到最大，但兩邊要留給名字和按鈕 */
.board-wrap {
  width: min(calc(100vw - 20rem - var(--cut-l) - var(--cut-r)), calc((100vh - 1.4rem - var(--cut-t) - var(--cut-b)) * var(--ar)));
  aspect-ratio: var(--ar);
  align-self: center;
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
.side.left {
  justify-content: flex-end;
  padding-bottom: 0.6rem;
}
.side.right {
  min-width: 10.2rem;
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
  text-align: center;
}
.need {
  margin-top: 0.3rem;
  font-size: 0.62rem;
  color: var(--color-ink);
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
.swap {
  margin-bottom: 0.7rem;
}
.swapbtn-enter-active {
  animation: rise 360ms var(--ease-back) both;
}
.swapbtn-leave-active {
  transition:
    opacity 200ms,
    transform 200ms;
}
.swapbtn-leave-to {
  opacity: 0;
  transform: translateY(0.6rem);
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
