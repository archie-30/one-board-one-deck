<script setup lang="ts">
// 九子棋對局：你在左、對手在右，中間是三個套在一起的正方形（24 個點）。
// 開局猜拳，贏的人拿紅子先放。放子：點一個空點先出現淡淡的子，再點一次（或按「放這裡」）才放。
// 走子：點自己的子、再點亮起來的點。成三之後點一顆亮起來的對方的子拿走（放子／走子跟拿子算同一步送出）。
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
import { chooseMorrisAction } from '@/engine/morris/ai'
import { applyMorris, canFly, countOf, createMorris, MILLS, removable, targetsOf, wouldMill, type MorrisAction, type MorrisState, type Side } from '@/engine/morris/rules'
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
import MorrisBoard from './MorrisBoard.vue'

const props = defineProps<{ game: GameDef; options: Record<string, string | boolean>; resume?: unknown }>()
const emit = defineEmits<{ exit: []; save: [data: unknown] }>()
const T = S.morris
const record = stats.morris
/** 連線對局：伺服器當裁判（猜拳、下子、交換、悔棋、認輸都經過伺服器）；沒有就是一般的單人對電腦 */
const bn = props.resume
  ? null
  : useBoardNet('morris', {
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
const flying = rules.flying !== false

interface Saved {
  state: MorrisState
  human: Side
  opponent: number
  rng: number
  undoUsed?: boolean
}
const saved = (props.resume ?? null) as Saved | null

const state = shallowRef<MorrisState>(saved ? saved.state : createMorris(flying))
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
/** 放子：選好、還沒放的那一點；滑鼠停的那一點 */
const chosen = ref(-1)
const hovered = ref<number | null>(null)
/** 走子：選起來的子 */
const selected = ref(-1)
/** 成三了、還沒選要拿哪一顆：先放（走）好給你看 */
const pending = ref<{ from: number; to: number } | null>(null)
const hist: { state: MorrisState; side: number }[] = []
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
const placing = computed(() => state.value.hand[human.value] > 0)
/** 畫面上的棋盤：成三等選拿哪一顆時，先把放（走）好的樣子給你看 */
const shown = computed(() => {
  const p = pending.value
  if (!p) return state.value.board
  const b = state.value.board.slice()
  if (p.from >= 0) b[p.from] = -1
  b[p.to] = human.value
  return b
})
const targets = computed(() => (myTurn.value && !pending.value && selected.value >= 0 ? targetsOf(state.value, selected.value) : []))
const removables = computed(() => (pending.value ? removable(shown.value, opSide.value) : []))
const lastMark = computed(() => {
  const l = state.value.last
  if (!l || l.to < 0 || pending.value) return null
  return { from: l.from, to: l.to, removed: l.removed, victim: l.side === 0 ? 1 : 0 }
})
/** 結算的說明：誰只剩兩顆、誰被堵死、誰認輸 */
const reasonText = computed(() => {
  const f = T.endReason[state.value.reason ?? '']
  if (!f) return ''
  const w = state.value.winner
  const loser = w === null ? '' : w === human.value ? opponent.value.name : watching ? meName : S.common.you
  return f(loser)
})
/** 剛成三的那條線 */
const millLine = computed(() => {
  const l = state.value.last
  if (!l || l.removed < 0 || l.to < 0) return undefined
  return MILLS.find((m) => m.includes(l.to) && m.every((q) => state.value.board[q] === l.side))
})
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
    if (pending.value) return T.removeTurn
    if (placing.value) return chosen.value >= 0 ? T.pickAgain : T.placeTurn
    if (selected.value >= 0) return T.pickTarget
    return canFly(state.value, human.value) ? T.flyTurn : T.moveTurn
  }
  return T.cpuTurn(opponent.value.name)
}
const preview = computed(() => {
  if (!myTurn.value || pending.value || !placing.value) return null
  const c = chosen.value >= 0 ? chosen.value : hovered.value
  return c !== null && c >= 0 && state.value.board[c] < 0 ? { p: c, side: human.value } : null
})
function clearPick() {
  chosen.value = -1
  selected.value = -1
  pending.value = null
}

// ── 流程 ──
function startAfterRps(playerWins: boolean) {
  human.value = playerWins ? 0 : 1
  state.value = createMorris(flying)
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
  state.value = createMorris(flying)
  hist.length = 0
  message.value = ''
  thinking.value = false
  clearPick()
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
function commit(a: MorrisAction, who: 0 | 1): boolean {
  if (who === 0) acted.value = true
  const before = state.value
  const r = applyMorris(before, a)
  if (!r.ok) {
    message.value = T.errors[r.reason] ?? ''
    playSound('error')
    return false
  }
  const mover = before.turn
  hist.push({ state: before, side: mover })
  state.value = r.state
  message.value = r.state.last && r.state.last.removed >= 0 && who === 1 ? T.cpuRemove(opponent.value.name) : ''
  clearPick()
  playSound(a.type === 'move' ? 'piece' : 'stone')
  // 成三拿子：拿的人得意、被拿的嚇一跳
  if (r.state.last && r.state.last.removed >= 0) {
    window.setTimeout(() => playSound('capture'), 260)
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
      let a: MorrisAction
      ;[a, rng] = chooseMorrisAction(state.value, level, rng)
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
  clearPick()
  const r = applyMorris(state.value, { type: 'timeout' })
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
    if (w === null) record.draws++
    else if (won) record.wins++
    else record.losses++
    // 表現：子數（盤上＋手上）差多少
    const left = (side: Side) => countOf(state.value.board, side) + state.value.hand[side]
    const diff = (left(human.value) - left(opSide.value)) / 9
    recordResult('morris', level, w === null ? 'd' : won ? 'w' : 'l', won ? 0.3 + diff : 1 + diff * 1.5)
  }
  moods.value = w === null ? ['shock', 'shock'] : won ? ['happy', 'sad'] : ['sad', 'happy']
  later(() => {
    playSound(w === null ? 'draw' : won ? 'win' : 'lose')
    resultOpen.value = true
  }, wait)
}

// ── 你的操作 ──
watch(state, () => {
  resignArmed.value = false
})
/** 點一個點：放子（第一下預覽、再點才放）、走子（選子→選目的地）、成三後選要拿的子 */
function pick(p: number) {
  if (!myTurn.value) return
  const s = state.value
  if (pending.value) {
    if (!removables.value.includes(p)) {
      if (shown.value[p] === opSide.value) message.value = T.errors.badRemove
      return
    }
    const { from, to } = pending.value
    pending.value = null
    mine(from < 0 ? { type: 'place', to, remove: p } : { type: 'move', from, to, remove: p })
    return
  }
  message.value = ''
  if (placing.value) {
    if (s.board[p] >= 0) return
    if (chosen.value === p) return confirmPlace()
    chosen.value = p
    playSound('stonePick')
    return
  }
  if (s.board[p] === human.value) {
    selected.value = targetsOf(s, p).length ? p : -1
    if (selected.value < 0) message.value = T.errors.illegal
    else playSound('piecePick')
    return
  }
  if (selected.value >= 0 && targets.value.includes(p)) return tryMove(selected.value, p)
}
function confirmPlace() {
  if (!myTurn.value || chosen.value < 0) return
  const p = chosen.value
  chosen.value = -1
  if (wouldMill(state.value, -1, p)) {
    pending.value = { from: -1, to: p }
    playSound('stone')
    return
  }
  mine({ type: 'place', to: p })
}
function tryMove(from: number, to: number) {
  selected.value = -1
  if (wouldMill(state.value, from, to)) {
    pending.value = { from, to }
    playSound('piece')
    return
  }
  mine({ type: 'move', from, to })
}
function cancelPending() {
  if (!pending.value) return
  if (pending.value.from >= 0) selected.value = pending.value.from
  pending.value = null
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
  const r = applyMorris(state.value, { type: 'resign', side: human.value })
  if (r.ok) state.value = r.state
  finish(260)
}
/** 自己下一步：連線時送給伺服器（等它送回來才真的下），單人時直接下 */
function mine(a: MorrisAction) {
  if (!bn) return void commit(a, 0)
  if (!applyMorris(state.value, a).ok) return
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
  clearPick()
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
function netApply(ev: { type: string; player: number; from?: unknown; to?: unknown; remove?: unknown }) {
  const who = ev.player === human.value ? 0 : 1
  const remove = typeof ev.remove === 'number' ? { remove: ev.remove } : {}
  if (ev.type === 'place') commit({ type: 'place', to: ev.to as number, ...remove }, who)
  else if (ev.type === 'move') commit({ type: 'move', from: ev.from as number, to: ev.to as number, ...remove }, who)
  else {
    const r = applyMorris(state.value, { type: 'timeout' })
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
    const r = applyMorris(state.value, { type: 'resign', side: player as Side })
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
      <div class="who rise" :class="{ active: phase === 'playing' && state.turn === human }">
        <span class="av"><Avatar :look="meLook()" :mood="moods[0]" /></span>
      </div>
      <p class="nm t-black"><span class="dotc" :class="`c${human}`" /><span class="hl" :class="{ on: phase === 'playing' && state.turn === human }" />{{ meName }}</p>
      <p v-if="phase !== 'rps'" class="t-label tg">{{ seatName(human) }}</p>
      <div v-if="phase !== 'rps'" class="pool">
        <span class="t-label">{{ T.hand }} {{ state.hand[human] }}</span>
        <span class="dots"><i v-for="k in state.hand[human]" :key="k" :class="`c${human}`" /></span>
        <span class="t-label">{{ T.onBoard }} {{ countOf(state.board, human) }}</span>
      </div>
    </aside>

    <div class="board-wrap">
      <MorrisBoard
        :board="shown"
        :interactive="myTurn"
        :selected="selected"
        :targets="targets"
        :removables="removables"
        :preview="preview"
        :last="lastMark"
        :stamp="state.plies"
        :mill="millLine"
        @pick="pick"
        @hover="(p) => (hovered = p)"
      />
    </div>

    <aside class="side right">
      <div class="who rise" style="--i: 1" :class="{ active: phase === 'playing' && state.turn !== human }">
        <span class="av"><Avatar :look="opponent.look" :mood="moods[1]" flip talk /></span>
      </div>
      <p class="nm t-black"><span class="dotc" :class="`c${opSide}`" /><span class="hl" :class="{ on: phase === 'playing' && state.turn !== human }" />{{ opponent.name }}</p>
      <p class="t-label tg">{{ opponent.tag }}<template v-if="phase !== 'rps'"> · {{ seatName(opSide) }}</template></p>
      <div v-if="phase !== 'rps'" class="pool">
        <span class="t-label">{{ T.hand }} {{ state.hand[opSide] }}</span>
        <span class="dots"><i v-for="k in state.hand[opSide]" :key="k" :class="`c${opSide}`" /></span>
        <span class="t-label">{{ T.onBoard }} {{ countOf(state.board, opSide) }}</span>
      </div>
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
            <Btn v-if="pending" class="swap" size="sm" block @click="cancelPending">{{ T.cancel }}</Btn>
          </Transition>
          <Btn v-if="placing" tone="red" icon="check" block :disabled="!myTurn || chosen < 0 || !!pending" @click="confirmPlace">{{ T.placeHere }}</Btn>
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
      <p class="final t-slab"><span class="c0">{{ countOf(state.board, 0) + state.hand[0] }}</span> : <span class="c1">{{ countOf(state.board, 1) + state.hand[1] }}</span></p>
      <p class="text-[0.95rem]">{{ reasonText }}</p>
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
  gap: 1.2rem;
  padding: 0.7rem 1.2rem;
}
.board-wrap {
  height: min(100%, calc(100vw - 23rem - var(--cut-l) - var(--cut-r)));
  aspect-ratio: 1;
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
.pool {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  margin-top: 0.4rem;
}
.pool .t-label {
  font-size: 0.56rem;
  color: var(--color-ink-2);
}
/* 手上還沒放的子：一排小圓 */
.dots {
  display: flex;
  max-width: 6.4rem;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.18rem;
}
.dots i {
  width: 0.62rem;
  height: 0.62rem;
  border: 0.09rem solid var(--color-ink);
  border-radius: 50%;
}
.dots i.c0 {
  background: var(--color-red);
}
.dots i.c1 {
  background: var(--color-blue);
}
.c0 {
  color: var(--color-red);
}
.c1 {
  color: var(--color-blue);
}
.final {
  margin-bottom: 0.3rem;
  font-size: 2rem;
  line-height: 1.1;
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
