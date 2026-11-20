<script setup lang="ts">
// 步步為營對局：你在左、對手在右，中間一張 9 × 9 棋盤。開局猜拳，贏的人拿紅子先走；自己永遠在棋盤下面、往上走。
// 操作：「走棋」時能走的格子出現圓點，點一下就走；「放牆」時點格子之間的溝出現牆的預覽，再點一次同一個地方（或按「放這裡」）才放下。
// 悔棋每局一次：棋子滑回去、牆收起來（連線時要對方同意）。
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
import { asLevel, extraThink, quoridorAt } from '@/engine/common/difficulty'
import { seedRng, type RngState } from '@/engine/common/rng'
import { chooseQuoridorAction } from '@/engine/quoridor/ai'
import { applyQuoridor, createQuoridor, distance, pawnMoves, wallProblem, WALLS_EACH, type Orient, type QuoridorAction, type QuoridorState, type Side } from '@/engine/quoridor/rules'
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
import QuoridorBoard from './QuoridorBoard.vue'

const props = defineProps<{ game: GameDef; options: Record<string, string | boolean>; resume?: unknown }>()
const emit = defineEmits<{ exit: []; save: [data: unknown] }>()
const T = S.quoridor
const record = stats.quoridor
/** 連線對局：伺服器當裁判（猜拳、走棋、放牆、悔棋、認輸都經過伺服器）；沒有就是一般的單人對電腦 */
const bn = props.resume
  ? null
  : useBoardNet('quoridor', {
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

interface Saved {
  state: QuoridorState
  human: Side
  opponent: number
  rng: number
  undoUsed?: boolean
}
const saved = (props.resume ?? null) as Saved | null

const state = shallowRef<QuoridorState>(saved ? saved.state : createQuoridor())
const human = ref<Side>(saved ? saved.human : 0)
const grace = useGrace(props.options, state, () => state.value.turn === human.value)
const opponent = ref(bn ? bn.opponent : saved ? opponentById(saved.opponent) : pickOpponents(1)[0])
// 連線：對手離開房間、改由電腦代打時，名字換成「＿（電腦代打）」
if (bn) watchSeats(bn.net, (ps) => (opponent.value = ps[1]))
const phase = ref<'rps' | 'playing' | 'over'>(saved ? 'playing' : 'rps')
const message = ref('')
const menuOpen = ref(false)
const resultOpen = ref(false)
const thinking = ref(false)
const moods = ref<[Mood, Mood]>(['idle', 'idle'])
let rng: RngState = saved ? saved.rng : seedRng(Date.now())
const undoUsed = ref(saved?.undoUsed ?? false)
/** 放牆模式、牆的預覽（點一下預覽、再點同一個地方才放） */
const wallMode = ref(false)
const preview = ref<{ at: number; o: Orient } | null>(null)
const hoverWall = ref<{ at: number; o: Orient } | null>(null)
/** 每一步之前的局面、誰走的（悔棋找「那一方上一手之前」） */
const hist: { state: QuoridorState; side: number }[] = []
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

const myTurn = computed(() => !watching && phase.value === 'playing' && !thinking.value && state.value.turn === human.value)
const targets = computed(() => (myTurn.value && !wallMode.value ? pawnMoves(state.value) : []))
const opSide = computed<Side>(() => (human.value === 0 ? 1 : 0))
const canWall = computed(() => myTurn.value && state.value.wallsLeft[human.value] > 0)
/** 畫面上的預覽：點過的優先，沒有就是滑鼠停的位置 */
const shownPreview = computed(() => {
  const w = preview.value ?? (wallMode.value ? hoverWall.value : null)
  return w ? { ...w, ok: !wallProblem(state.value, w.at, w.o) } : null
})
const seatName = (side: Side) => (side === 0 ? T.red : T.blue)
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
const toGo = (side: Side) => distance(state.value, side)
const lastShown = computed(() => {
  const l = state.value.last
  return l ? (l.type === 'move' ? { type: 'move' as const, from: l.from, to: l.to } : { type: 'wall' as const, at: l.at, o: l.o }) : null
})

// ── 流程 ──
function startAfterRps(playerWins: boolean) {
  human.value = playerWins ? 0 : 1
  state.value = createQuoridor()
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
  state.value = createQuoridor()
  hist.length = 0
  message.value = ''
  thinking.value = false
  wallMode.value = false
  preview.value = null
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
function commit(a: QuoridorAction, who: 0 | 1): boolean {
  if (who === 0) acted.value = true
  const before = state.value
  const r = applyQuoridor(before, a)
  if (!r.ok) {
    message.value = T.errors[r.reason] ?? ''
    playSound('error')
    return false
  }
  hist.push({ state: before, side: before.turn })
  state.value = r.state
  message.value = ''
  preview.value = null
  wallMode.value = false
  if (a.type === 'wall') {
    playSound('xqPiece')
    // 這道牆讓對方多繞好幾步：放的人得意、被擋的人嚇一跳
    const victim: Side = before.turn === 0 ? 1 : 0
    const gain = distance(r.state, victim) - distance(before, victim)
    if (gain >= 3) {
      flash(who, 'smug')
      flash(who === 0 ? 1 : 0, 'shock')
    }
  } else playSound('piece')
  if (state.value.status !== 'playing') finish()
  else if (state.value.turn !== human.value && !bn) scheduleCpu()
  return true
}

function scheduleCpu() {
  thinking.value = true
  moods.value = [moods.value[0], 'think']
  const st = quoridorAt(opponent.value.persona.chess, level)
  later(
    () => {
      let a: QuoridorAction | null
      ;[a, rng] = chooseQuoridorAction(state.value, st, rng)
      thinking.value = false
      moods.value = [moods.value[0], 'idle']
      if (a) commit(a, 1)
    },
    700 + st.depth * 150 + extraThink(level) + Math.random() * 500,
  )
}

/** 時間到：這一步跳過，換對方 */
function onTimeout() {
  if (bn || !myTurn.value) return
  acted.value = true
  preview.value = null
  wallMode.value = false
  const r = applyQuoridor(state.value, { type: 'timeout' })
  if (!r.ok) return
  hist.push({ state: state.value, side: state.value.turn })
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
  // 表現：贏的話對方離終點越遠越好；輸的話自己越接近越好
  const far = Math.min(8, distance(state.value, w === human.value ? opSide.value : human.value))
  if (!watching) recordResult('quoridor', level, w === null ? 'd' : w === human.value ? 'w' : 'l', w === human.value ? 0.3 + far / 12 : 1 - far / 8)
  moods.value = w === null ? ['shock', 'shock'] : w === human.value ? ['happy', 'sad'] : ['sad', 'happy']
  later(() => {
    playSound(w === human.value ? 'win' : w === null ? 'draw' : 'lose')
    resultOpen.value = true
  }, wait)
}

// ── 你的操作 ──
/** 規則設定「按兩下才走」（預設關，可以當場改）：第一下選要走到哪（出現淡淡的棋子），再點同一格或按「走這裡」才走 */
const doubleTap = computed(() => props.options.doubleTap === true)
const moveTo = ref(-1)
watch(state, () => {
  moveTo.value = -1
  resignArmed.value = false
})
function pick(i: number) {
  if (!myTurn.value || wallMode.value) return
  if (!targets.value.includes(i)) {
    moveTo.value = -1
    return
  }
  // 預設點一下就走；規則設定開了「按兩下才走」才要再點一次
  if (!doubleTap.value || moveTo.value === i) {
    moveTo.value = i
    return confirmMove()
  }
  moveTo.value = i
  message.value = ''
  playSound('piecePick')
}
function confirmMove() {
  if (!myTurn.value || moveTo.value < 0) return
  const to = moveTo.value
  moveTo.value = -1
  mine({ type: 'move', to })
}

// 認輸並結算：要按兩次（第一次變成「再按一次認輸」，2.5 秒內再按才算）
const resignArmed = ref(false)
/** 悔棋按了第一下（「再按一次悔棋」）：悔棋變寬、認輸先藏起來 */
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
  const r = applyQuoridor(state.value, { type: 'resign', side: human.value })
  if (r.ok) state.value = r.state
  finish(260)
}
function setMode(wall: boolean) {
  if (wall && !canWall.value) return
  wallMode.value = wall
  moveTo.value = -1
  preview.value = null
  message.value = ''
  playSound('piecePick')
}
/** 點溝：第一下預覽，再點同一道才放 */
function tapWall(at: number, o: Orient) {
  if (!canWall.value) return
  const p = preview.value
  if (p && p.at === at && p.o === o) return placeWall()
  preview.value = { at, o }
  const bad = wallProblem(state.value, at, o)
  message.value = bad ? T.errors[bad] : ''
  if (bad) playSound('error')
}
function placeWall() {
  const p = preview.value
  if (!p) return
  const bad = wallProblem(state.value, p.at, p.o)
  if (bad) {
    message.value = T.errors[bad]
    playSound('error')
    return
  }
  mine({ type: 'wall', at: p.at, o: p.o })
}
/** 自己做一步：連線時送給伺服器（等它送回來才真的做），單人時直接做 */
function mine(a: QuoridorAction) {
  if (!bn) return void commit(a, 0)
  if (!applyQuoridor(state.value, a).ok) return
  acted.value = true
  preview.value = null
  wallMode.value = false
  bn.send(a)
}

// ── 悔棋 ──
const canUndo = computed(() => {
  void state.value // hist 跟著 state 一起變：讀一下讓它重新算
  if (watching || phase.value !== 'playing') return false
  return hist.some((h) => h.side === human.value) && (bn ? true : !undoUsed.value)
})
const usedUndo = computed(() => (bn ? bn.undoUsed.value : undoUsed.value))
/** 倒回到 hist[k] 之前（棋子滑回去、牆收起來） */
function revertTo(k: number) {
  state.value = hist[k].state
  hist.splice(k)
  message.value = ''
  preview.value = null
  wallMode.value = false
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
function netApply(ev: { type: string; player: number; to?: unknown; at?: unknown; o?: unknown }) {
  const who = ev.player === human.value ? 0 : 1
  if (ev.type === 'move') commit({ type: 'move', to: ev.to as number }, who)
  else if (ev.type === 'wall') commit({ type: 'wall', at: ev.at as number, o: ev.o as Orient }, who)
  else {
    const r = applyQuoridor(state.value, { type: 'timeout' })
    if (r.ok) {
      hist.push({ state: state.value, side: state.value.turn })
      state.value = r.state
      if (who === 0) ((message.value = S.common.timedOut), playSound('error'))
      if (state.value.status !== 'playing') finish()
    }
  }
  later(() => bn!.next(), ev.type === 'timeout' ? 50 : 360)
}
function netResign(player: number) {
  if (phase.value === 'playing') {
    const r = applyQuoridor(state.value, { type: 'resign', side: player as Side })
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
      <div class="stock">
        <span v-for="k in WALLS_EACH" :key="k" class="bar" :class="{ used: k > state.wallsLeft[human] }" />
      </div>
      <p class="t-label wl">{{ T.wallsLeft(state.wallsLeft[human]) }}</p>
      <div class="who rise" :class="{ active: phase === 'playing' && state.turn === human }">
        <span class="av"><Avatar :look="meLook()" :mood="moods[0]" /></span>
      </div>
      <p class="nm t-black"><span class="dotc" :class="`c${human}`" /><span class="hl" :class="{ on: phase === 'playing' && state.turn === human }" />{{ meName }}</p>
      <p v-if="phase !== 'rps'" class="t-label tg">{{ seatName(human) }}</p>
      <p v-if="phase !== 'rps'" class="togo"><span class="t-label">{{ T.toGoLabel }}</span><b class="t-slab">{{ toGo(human) }}</b><span class="t-label">{{ T.steps }}</span></p>
    </aside>

    <div class="board-wrap">
      <QuoridorBoard
        :pawns="state.pawns"
        :h="state.h"
        :v="state.v"
        :flip="human === 1"
        :targets="targets"
        :wall-mode="wallMode"
        :preview="shownPreview"
        :ghost="moveTo >= 0 ? { cell: moveTo, side: human } : null"
        :interactive="myTurn"
        :last="lastShown"
        @pick="pick"
        @wall="tapWall"
        @hover="(w) => (hoverWall = w)"
      />
    </div>

    <aside class="side right">
      <div class="who rise" style="--i: 1" :class="{ active: phase === 'playing' && state.turn !== human }">
        <span class="av"><Avatar :look="opponent.look" :mood="moods[1]" flip talk /></span>
      </div>
      <p class="nm t-black"><span class="dotc" :class="`c${opSide}`" /><span class="hl" :class="{ on: phase === 'playing' && state.turn !== human }" />{{ opponent.name }}</p>
      <p class="t-label tg">{{ opponent.tag }}<template v-if="phase !== 'rps'"> · {{ seatName(opSide) }}</template></p>
      <p v-if="phase !== 'rps'" class="togo"><span class="t-label">{{ T.toGoLabel }}</span><b class="t-slab">{{ toGo(opSide) }}</b><span class="t-label">{{ T.steps }}</span></p>
      <div class="stock sm">
        <span v-for="k in WALLS_EACH" :key="k" class="bar" :class="{ used: k > state.wallsLeft[opSide] }" />
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
          <!-- 走棋／放牆：點哪一邊都會切換 -->
          <button type="button" class="modes" :disabled="!myTurn || (!wallMode && !canWall)" @click="setMode(!wallMode)">
            <span class="mode" :class="{ on: !wallMode }">{{ T.modeMove }}</span>
            <span class="mode" :class="{ on: wallMode }">{{ T.modeWall(state.wallsLeft[human]) }}</span>
          </button>
          <Btn v-if="wallMode" class="mt-[0.9rem]" tone="red" icon="check" block :disabled="!preview || !shownPreview?.ok" @click="placeWall">{{ T.placeWall }}</Btn>
          <Btn v-else-if="doubleTap" class="mt-[0.9rem]" tone="red" icon="check" block :disabled="!myTurn || moveTo < 0" @click="confirmMove">{{ T.moveHere }}</Btn>
          <!-- 悔棋、認輸並排。其中一顆按了第一下（「再按一次＿」）時，它變寬佔滿整排、另一顆縮起來藏好；
               恢復時再展開回來。對方要求悔棋時（「同意／不同意」）也是悔棋那顆佔整排 -->
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
  /* 棋盤不能大到把兩邊擠扁：至少留 23rem 給左右兩欄 */
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
/* 手上還有幾道牆：一排小黃條，用掉的變淡 */
.stock {
  display: flex;
  max-width: 8rem;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.18rem;
  margin: 0.4rem 0 0.1rem;
}
.bar {
  width: 0.35rem;
  height: 1.3rem;
  border: 0.1rem solid var(--color-ink);
  background: var(--color-yellow);
  transition:
    opacity 260ms,
    transform 260ms var(--ease-out);
}
.bar.used {
  opacity: 0.18;
  transform: translateY(0.25rem);
}
.stock.sm .bar {
  height: 1rem;
}
.wl {
  margin-bottom: 0.6rem;
  font-size: 0.55rem;
  color: var(--color-ink-2);
}
/* 還差幾步：名字下面（跟撿紅點的分數一樣） */
.togo {
  display: flex;
  align-items: baseline;
  gap: 0.2rem;
  margin-top: 0.15rem;
}
.togo .t-label {
  font-size: 0.55rem;
  color: var(--color-ink-2);
}
.togo b {
  font-size: 1.2rem;
  line-height: 1;
  color: var(--color-red);
}
.status-box {
  margin-top: auto;
  text-align: center;
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
.act {
  width: min(9.6rem, 100%);
  margin-top: 0.4rem;
}
/* 走棋／放牆：兩格切換（點哪一邊都會換） */
.modes {
  display: grid;
  width: 100%;
  grid-template-columns: 1fr 1.6fr;
  padding: 0;
  border: 0.14rem solid var(--color-ink);
  background: var(--color-card);
  cursor: pointer;
}
.modes:disabled {
  cursor: default;
}
.modes:disabled .mode {
  opacity: 0.45;
}
.mode {
  padding: 0.45rem 0.15rem;
  font-size: 0.74rem;
  white-space: nowrap;
  font-weight: 900;
  color: var(--color-ink-2);
  transition:
    background 160ms,
    color 160ms;
}
.mode + .mode {
  border-left: 0.14rem solid var(--color-ink);
}
.mode.on {
  background: var(--color-ink);
  color: var(--color-card);
}

.pair {
  display: flex;
  /* 底下、右邊給按鈕的偏移陰影留位置（格子要裁掉縮起來的那顆，陰影不能一起被裁掉） */
  margin: 0.9rem -0.3rem -0.35rem 0;
}
/* 兩顆各佔一半；某一顆按了第一下時，它展開佔滿整排、另一顆縮到沒有寬度並淡掉（反過來也一樣） */
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
.pair.undoWide .slot.r {
  margin-left: 0;
}
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
