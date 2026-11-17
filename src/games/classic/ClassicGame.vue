<script setup lang="ts" generic="St">
// 西洋棋、象棋共用的對局畫面：你在左、對手在右，中間一張棋盤。
// 開局猜拳決定誰先走（西洋棋贏的人拿白、象棋贏的人拿紅）；玩家那一方永遠在棋盤下方。
// 操作：點自己的棋子 → 能走的位置出現圓點 → 點那個位置走過去。西洋棋兵到底線時跳出升變選擇。
import { useGrace } from '@/core/grace'
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { playSound } from '@/core/audio'
import { opponentById, pickOpponents } from '@/core/opponents'
import { useBoardNet } from '@/core/boardNet'
import { recordResult, stats } from '@/core/settings'
import { asLevel, chessAt, extraThink } from '@/engine/common/difficulty'
import { myLook } from '@/core/profile'
import { S } from '@/data/strings'
import { seedRng, type RngState } from '@/engine/common/rng'
import type { Promo } from '@/engine/chess/rules'
import type { GameDef } from '@/games/types'
import Avatar from '@/ui/art/Avatar.vue'
import type { Mood } from '@/ui/art/look'
import PieceIcon from '@/ui/art/PieceIcon.vue'
import Btn from '@/ui/Btn.vue'
import Dialog from '@/ui/Dialog.vue'
import GameMenu from '@/ui/GameMenu.vue'
import IconBtn from '@/ui/IconBtn.vue'
import RpsDuel from '@/ui/RpsDuel.vue'
import UndoBtn from '@/ui/UndoBtn.vue'
import TurnGlow from '@/ui/TurnGlow.vue'
import TurnTimer from '@/ui/TurnTimer.vue'
import { TURN_SECONDS } from '@/data/timer'
import { moveSound, type Adapter, type ClassicMove, type Seat } from './adapters'
import ClassicBoard from './ClassicBoard.vue'

const props = defineProps<{ game: GameDef; options: Record<string, string | boolean>; resume?: unknown; adapter: Adapter<St> }>()
const emit = defineEmits<{ exit: []; save: [data: unknown] }>()
const A = props.adapter
const T = A.kind === 'chess' ? S.chess : S.xiangqi
const record = A.kind === 'chess' ? stats.chess : stats.xiangqi
/** 連線對局：伺服器當裁判（猜拳、走子、悔棋、認輸都經過伺服器）；沒有就是一般的單人對電腦 */
const bn = props.resume
  ? null
  : useBoardNet(A.kind, {
      watchStart: (leftFirst) => startAfterRps(leftFirst),
      apply: (ev) => netApply(ev),
      undo: (by) => netUndo(by),
      resign: (player) => netResign(player),
    })
/** 觀戰：只能看，畫面左邊是 0 號座位那位玩家 */
const watching = !!bn?.watching
const meName = bn?.watching ? bn.left.name : S.common.you
const meLook = () => (bn?.watching ? bn.left.look : myLook())

/** 規則設定：連線時照房主的（棋子樣式這種還是用自己的） */
const rules = bn ? { ...props.options, ...bn.net.opts } : props.options
/** 規則設定的「倒數計時」 */
const timed = rules.timer !== false
/** 難度：只決定電腦多強 */
const level = asLevel(rules.difficulty)

/** 「保存進度並退出」存的資料 */
interface Saved {
  state: St
  human: Seat
  opponent: number
  rng: number
  undoFrom?: St | null
  undoUsed?: boolean
}
const saved = (props.resume ?? null) as Saved | null

const state = shallowRef<St>(saved ? saved.state : A.create())
const human = ref<Seat>(saved ? saved.human : 0)
const grace = useGrace(props.options, state, () => A.turn(state.value) === human.value)
const opponent = ref(bn ? bn.opponent : saved ? opponentById(saved.opponent) : pickOpponents(1)[0])
const phase = ref<'rps' | 'playing' | 'over'>(saved ? 'playing' : 'rps')
const selected = ref(-1)
const hoverAt = ref(-1)
const message = ref('')
const menuOpen = ref(false)
const resultOpen = ref(false)
const resignOpen = ref(false)
const promoAsk = ref<{ from: number; to: number } | null>(null)
const thinking = ref(false)
const moods = ref<[Mood, Mood]>(['idle', 'idle'])
let rng: RngState = saved ? saved.rng : seedRng(Date.now())
/** 悔棋：每局一次，退回玩家上一步之前的局面 */
const undoFrom = shallowRef<St | null>(saved?.undoFrom ?? null)
const undoUsed = ref(saved?.undoUsed ?? false)
/** 你上一步走了哪裡（悔棋時倒著播）；逾時跳過就是 null */
let myMove: { from: number; to: number } | null = null
/** 悔棋的倒帶動畫 */
const rewind = ref<{ moves: { from: number; to: number }[]; plies: number; key: number } | null>(null)
const timers = new Set<number>()
const later = (fn: () => void, ms: number) => {
  const id = window.setTimeout(() => {
    timers.delete(id)
    // 暫停中（選單打開）：電腦也停下來，等繼續再走
    if (menuOpen.value && !bn) later(fn, 250)
    else fn()
  }, ms)
  timers.add(id)
}
onBeforeUnmount(() => {
  timers.forEach((t) => window.clearTimeout(t))
  bn?.stop()
})

const board = computed(() => A.board(state.value))
const myTurn = computed(() => !watching && phase.value === 'playing' && !thinking.value && A.turn(state.value) === human.value)
const targets = computed(() => (selected.value >= 0 && myTurn.value ? A.targets(state.value, selected.value) : []))
const seatName = (seat: Seat) => (A.kind === 'chess' ? (seat === 0 ? S.chess.white : S.chess.black) : seat === 0 ? S.xiangqi.red : S.xiangqi.black)
const winnerSeat = computed(() => A.winner(state.value))
const resultTitle = computed(() => (winnerSeat.value === null ? T.draw : winnerSeat.value === human.value ? (watching ? S.online.watchWin(meName) : T.win) : watching ? S.online.watchWin(opponent.value.name) : T.lose(opponent.value.name)))
const reason = computed(() => (T.endReason as Record<string, string>)[A.status(state.value)] ?? '')
const checkSq = computed(() => (phase.value === 'rps' ? -1 : A.checkSq(state.value)))
const status = computed(() => {
  const t = statusText()
  return watching ? S.online.watchingNow + (t ? '・' + t : '') : t
})
function statusText() {
  if (message.value) return message.value
  if (phase.value === 'over') return resultTitle.value
  if (phase.value === 'rps') return ''
  if (A.turn(state.value) === human.value) return checkSq.value >= 0 ? T.check : (watching ? T.cpuTurn(meName) : T.yourTurn)
  return T.cpuTurn(opponent.value.name)
}
/** 被吃掉的子：左邊放你吃到的（對方的子），右邊放對方吃到的 */
const takenBy = (seat: Seat) => A.captured(state.value).filter((p) => A.seatOf(p) !== seat)

// 滑鼠預覽：選了棋子時，移到能走的位置上先出現半透明的那顆棋子
const ghost = computed(() => {
  const i = hoverAt.value
  if (selected.value < 0 || i < 0 || !targets.value.includes(i)) return null
  return { index: i, piece: board.value[selected.value] }
})

// ── 流程 ──
function startAfterRps(playerWins: boolean) {
  human.value = playerWins ? 0 : 1
  state.value = A.create()
  undoFrom.value = null
  undoUsed.value = false
  phase.value = 'playing'
  if (bn) return bn.next()
  if (!playerWins) scheduleCpu()
}

function restart() {
  // 連線對局：再來一局要回房間大家重新準備
  if (bn) return
  timers.forEach((t) => window.clearTimeout(t))
  timers.clear()
  menuOpen.value = false
  resultOpen.value = false
  resignOpen.value = false
  promoAsk.value = null
  opponent.value = pickOpponents(1)[0]
  state.value = A.create()
  selected.value = -1
  message.value = ''
  thinking.value = false
  moods.value = ['idle', 'idle']
  undoFrom.value = null
  undoUsed.value = false
  phase.value = 'rps'
}

function commit(m: ClassicMove, who: 0 | 1) {
  if (who === 0) acted.value = true
  const before = A.captured(state.value).length
  const r = A.apply(state.value, m)
  if (!r.ok) {
    message.value = (T.errors as Record<string, string>)[r.reason] ?? ''
    playSound('error')
    return false
  }
  if (who === 0) {
    undoFrom.value = state.value
    myMove = { from: m.from, to: m.to }
  }
  state.value = r.state
  selected.value = -1
  message.value = ''
  const took = A.captured(state.value).length > before
  playSound(moveSound(A.kind, took))
  if (took) flash(who, 'happy')
  if (A.over(state.value)) finish()
  else if (A.checkSq(state.value) >= 0) flash(who === 0 ? 1 : 0, 'shock')
  if (!A.over(state.value) && A.turn(state.value) !== human.value && !bn) scheduleCpu()
  return true
}

/** 時間到：這一步跳過，換對方（被將軍時逾時直接算輸） */
function onTimeout() {
  // 連線：時間到由伺服器判
  if (bn) return
  if (!myTurn.value) return
  acted.value = true
  selected.value = -1
  promoAsk.value = null
  undoFrom.value = state.value
  myMove = null
  state.value = A.skip(state.value)
  playSound('error')
  if (A.over(state.value)) return finish()
  message.value = S.common.timedOut
  scheduleCpu()
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

function scheduleCpu() {
  thinking.value = true
  moods.value = [moods.value[0], 'think']
  const st = chessAt(opponent.value.persona.chess, level, opponent.value.id)
  later(() => {
    let m: ClassicMove | null
    ;[m, rng] = A.choose(state.value, st, rng)
    thinking.value = false
    moods.value = [moods.value[0], 'idle']
    if (m) commit(m, 1)
  }, 450 + st.depth * 250 + extraThink(level) + Math.random() * 400)
}

/** 結束：wait 毫秒後翻出結算（認輸時確認視窗剛關，不要再停太久，看起來才不會卡住） */
function finish(wait = 900) {
  phase.value = 'over'
  const w = winnerSeat.value
  if (watching) void 0 // 觀戰不記戰績
  else if (w === null) record.draws++
  else if (w === human.value) record.wins++
  else record.losses++
  // 表現：贏得越快越高；輸的話撐越久越高
  const plies = (state.value as { history?: unknown[] }).history?.length ?? 60
  if (!watching) recordResult(A.kind, level, w === null ? 'd' : w === human.value ? 'w' : 'l', w === human.value ? 1 - plies / 200 : plies / 120)
  moods.value = w === null ? ['shock', 'shock'] : w === human.value ? ['happy', 'sad'] : ['sad', 'happy']
  later(() => {
    playSound(w === human.value ? 'win' : w === null ? 'draw' : 'lose')
    resultOpen.value = true
  }, wait)
}

// ── 你的操作 ──
function pick(i: number) {
  if (!myTurn.value) return
  const p = board.value[i]
  // 點自己的子：選起來（再點一次取消）
  if (p && A.seatOf(p) === human.value) {
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
  if (A.needsPromotion(state.value, selected.value, i)) {
    promoAsk.value = { from: selected.value, to: i }
    return
  }
  mine({ from: selected.value, to: i })
}
/** 拖曳：只能拖自己的棋子 */
const canDrag = (i: number) => myTurn.value && !!board.value[i] && A.seatOf(board.value[i]) === human.value
function grab(i: number) {
  if (!canDrag(i)) return
  if (selected.value !== i) playSound('piecePick')
  selected.value = i
  message.value = ''
}
/** 拖到能走的格子放開就走；放在不能走的地方，棋子回原位、保持選起 */
function drop(from: number, to: number) {
  if (!myTurn.value || selected.value !== from) return
  if (targets.value.includes(to)) pick(to)
}
function promote(promo: Promo) {
  const ask = promoAsk.value
  promoAsk.value = null
  if (ask) mine({ ...ask, promo })
}
/** 自己走一步：連線時送給伺服器（等它送回來才真的走），單人時直接走 */
function mine(m: ClassicMove) {
  if (!bn) return void commit(m, 0)
  if (!A.apply(state.value, m).ok) return
  acted.value = true
  selected.value = -1
  bn.send({ type: 'move', move: m })
}
// 連線：自己走過（hist 跟著 state 一起變，所以讀一下 state 讓它重新算）
const canUndo = computed(() => (bn ? (void state.value, phase.value === 'playing' && hist.some((h) => h.side === bn.mySide.value)) : phase.value === 'playing' && !!undoFrom.value && !undoUsed.value))
/** 悔棋：電腦還在想就停下來，局面退回玩家上一步之前 */
function undo() {
  // 連線：送出申請，等對方同意
  if (bn) return canUndo.value && bn.askUndo()
  if (!canUndo.value || !undoFrom.value) return
  timers.forEach((t) => window.clearTimeout(t))
  timers.clear()
  thinking.value = false
  // 倒帶：電腦已經走了就先把它那步、再把你那步倒回去（同時滑回原位，被吃的子冒回來）
  const moves: { from: number; to: number }[] = []
  const last = A.lastMove(state.value)
  if (A.turn(state.value) === human.value && last) moves.push(last)
  if (myMove && !moves.some((x) => x.from === myMove!.from && x.to === myMove!.to)) moves.push(myMove)
  myMove = null
  state.value = undoFrom.value
  rewind.value = { moves, plies: A.plies(state.value), key: (rewind.value?.key ?? 0) + 1 }
  undoFrom.value = null
  undoUsed.value = true
  selected.value = -1
  promoAsk.value = null
  message.value = ''
  moods.value = ['idle', 'idle']
  playSound('piecePick')
}
function resign() {
  resignOpen.value = false
  if (phase.value !== 'playing') return
  if (bn) return bn.resign()
  timers.forEach((t) => window.clearTimeout(t))
  timers.clear()
  thinking.value = false
  state.value = A.resign(state.value, human.value)
  finish(260)
}

// ── 保存進度並退出 ──
/** 玩家自己有沒有動過（還沒動過就離開：不必按兩次、也不需要存檔） */
const acted = ref(!!saved)
const canSave = computed(() => !bn && phase.value === 'playing' && acted.value)
/** 目前的進度（可以存檔時才有；還沒動過、已經結束就是 null） */
function snapshot(): Saved | null {
  if (!canSave.value) return null
  const data: Saved = { state: state.value, human: human.value, opponent: opponent.value.id, rng, undoFrom: undoFrom.value, undoUsed: undoUsed.value }
  return data
}
function saveAndExit() {
  const data = snapshot()
  if (data) emit('save', data)
}
// 給外框用：切走分頁、離開視窗時自動暫停並存下進度
defineExpose({ pause: () => phase.value === 'playing' && !resultOpen.value && (menuOpen.value = true), snapshot })
if (saved && A.turn(state.value) !== human.value) scheduleCpu()

// ── 連線對局：伺服器送來的每一步 ──
/** 每一步之前的局面、誰走的、走了哪裡（悔棋時找「那一方上一手之前」，倒帶動畫用） */
const hist: { state: St; side: number; move: { from: number; to: number } | null }[] = []
function netApply(ev: { type: string; player: number; move?: unknown }) {
  const who = ev.player === human.value ? 0 : 1
  const before = state.value
  if (ev.type === 'move') {
    const m = ev.move as ClassicMove
    if (commit(m, who)) hist.push({ state: before, side: ev.player, move: { from: m.from, to: m.to } })
  } else {
    hist.push({ state: before, side: ev.player, move: null })
    state.value = A.skip(state.value)
    if (who === 0) playSound('error')
    if (A.over(state.value)) finish()
    else if (who === 0) message.value = S.common.timedOut
  }
  bn!.next()
}
function netUndo(by: number) {
  const k = hist.map((h) => h.side).lastIndexOf(by)
  if (k >= 0) {
    // 倒帶：從最後一步往回滑，被吃的子冒回來
    const moves = hist
      .slice(k)
      .map((h) => h.move)
      .filter((x): x is { from: number; to: number } => !!x)
      .reverse()
    state.value = hist[k].state
    hist.length = k
    rewind.value = { moves, plies: A.plies(state.value), key: (rewind.value?.key ?? 0) + 1 }
    if (by === human.value) undoUsed.value = true
    selected.value = -1
    promoAsk.value = null
    message.value = ''
    playSound('piecePick')
  }
  later(() => bn!.next(), 450)
}
function netResign(player: number) {
  if (phase.value === 'playing') {
    state.value = A.resign(state.value, player as Seat)
    finish(260)
  }
  bn!.next()
}
if (bn) watch(bn.undoRefused, () => (message.value = S.common.undoRefused(opponent.value.name)))

const promoChoices: Promo[] = ['Q', 'R', 'B', 'N']
const xqName = (p: string) => S.xiangqi.names[p === p.toUpperCase() ? 'r' : 'b'][p.toUpperCase() as 'K']
const boardAspect = computed(() => (A.kind === 'chess' ? '1 / 1' : '94 / 104'))
</script>

<template>
  <section class="gm">
    <!-- 輪到誰：那個人那一側淡淡亮起 -->
    <TurnGlow side="left" :on="phase === 'playing' && A.turn(state) === human" />
    <TurnGlow side="right" :on="phase === 'playing' && A.turn(state) !== human" />
    <TurnTimer v-if="timed" :side="A.turn(state) === human ? 'left' : 'right'" :active="phase === 'playing' && !(grace && A.turn(state) === human)" :paused="!bn && menuOpen" :seconds="TURN_SECONDS.board" :turn-key="state" @timeout="onTimeout" />
    <div class="corner"><IconBtn icon="menu" :label="S.common.menu" @click="menuOpen = true" /></div>

    <aside class="side left">
      <div class="taken">
        <svg v-for="(p, k) in takenBy(human)" :key="k" viewBox="0 0 40 40" class="tk pop">
          <PieceIcon v-if="A.kind === 'chess'" :kind="p" :light="p === p.toUpperCase()" />
          <template v-else>
            <circle cx="20" cy="20" r="17" fill="var(--color-card)" stroke="var(--color-ink)" stroke-width="2.4" />
            <text v-if="options.pieceStyle !== 'icon'" x="20" y="27.5" class="tk-t" :fill="p === p.toUpperCase() ? 'var(--color-red)' : 'var(--color-ink)'">{{ xqName(p) }}</text>
            <PieceIcon v-else set="xiangqi" :kind="p" :color="p === p.toUpperCase() ? 'var(--color-red)' : 'var(--color-ink)'" :size="26" />
          </template>
        </svg>
      </div>
      <div class="who rise" :class="{ active: phase === 'playing' && A.turn(state) === human }">
        <span class="av"><Avatar :look="meLook()" :mood="moods[0]" /></span>
      </div>
      <p class="nm t-black"><span class="hl" :class="{ on: phase === 'playing' && A.turn(state) === human }" />{{ meName }}</p>
      <p v-if="phase !== 'rps'" class="t-label tg">{{ seatName(human) }}</p>
    </aside>

    <div class="board-wrap" :style="{ aspectRatio: boardAspect }">
      <ClassicBoard
        :kind="A.kind"
        :board="board"
        :flip="human === 1"
        :selected="selected"
        :targets="targets"
        :last-move="A.lastMove(state)"
        :check-sq="checkSq"
        :ghost="ghost"
        :piece-style="options.pieceStyle === 'icon' ? 'icon' : 'text'"
        :interactive="myTurn"
        :move-key="A.plies(state)"
        :can-drag="canDrag"
        :rewind="rewind"
        @pick="pick"
        @grab="grab"
        @drop="drop"
        @hover="(i) => (hoverAt = i)"
      />
    </div>

    <aside class="side right">
      <div class="who rise" style="--i: 1" :class="{ active: phase === 'playing' && A.turn(state) !== human }">
        <span class="av"><Avatar :look="opponent.look" :mood="moods[1]" flip talk /></span>
      </div>
      <p class="nm t-black"><span class="hl" :class="{ on: phase === 'playing' && A.turn(state) !== human }" />{{ opponent.name }}</p>
      <p class="t-label tg">{{ opponent.tag }}<template v-if="phase !== 'rps'"> · {{ seatName(human === 0 ? 1 : 0) }}</template></p>
      <div class="taken">
        <svg v-for="(p, k) in takenBy(human === 0 ? 1 : 0)" :key="k" viewBox="0 0 40 40" class="tk pop">
          <PieceIcon v-if="A.kind === 'chess'" :kind="p" :light="p === p.toUpperCase()" />
          <template v-else>
            <circle cx="20" cy="20" r="17" fill="var(--color-card)" stroke="var(--color-ink)" stroke-width="2.4" />
            <text v-if="options.pieceStyle !== 'icon'" x="20" y="27.5" class="tk-t" :fill="p === p.toUpperCase() ? 'var(--color-red)' : 'var(--color-ink)'">{{ xqName(p) }}</text>
            <PieceIcon v-else set="xiangqi" :kind="p" :color="p === p.toUpperCase() ? 'var(--color-red)' : 'var(--color-ink)'" :size="26" />
          </template>
        </svg>
      </div>
      <div class="status-box">
        <p class="t-slab moves">{{ phase !== 'rps' ? String(Math.ceil(A.plies(state) / 2)).padStart(3, '0') : '' }}</p>
        <p class="status" :class="{ mine: myTurn && !message, warn: !!message || (myTurn && checkSq >= 0) }">{{ status }}</p>
        <p class="hint">{{ myTurn && !message ? T.pickHint : '' }}</p>
      </div>
      <div class="act">
        <template v-if="phase === 'over'">
          <Btn v-if="!bn" tone="ink" icon="again" block @click="restart">{{ S.common.again }}</Btn>
          <div class="end2 mt-[0.5rem] grid grid-cols-2 gap-[0.4rem]">
            <Btn size="sm" block @click="resultOpen = true">{{ S.common.showResult }}</Btn>
            <Btn size="sm" block @click="emit('exit')">{{ S.common.quit }}</Btn>
          </div>
        </template>
        <template v-else>
          <UndoBtn v-if="!watching" block :disabled="!canUndo" :used="undoUsed" :waiting="!!bn?.undoWaiting.value" :asked="!!bn?.undoAsked.value" @answer="(ok) => bn?.answerUndo(ok)" @undo="undo" />
          <Btn v-if="!watching" class="mt-[0.5rem]" size="sm" icon="exit" block :disabled="phase !== 'playing'" @click="resignOpen = true">{{ T.resign }}</Btn>
        </template>
      </div>
    </aside>

    <RpsDuel :open="phase === 'rps' && !watching && (!menuOpen || !!bn)" :opponent="opponent" :lead="T.rpsLead" :seconds="timed ? TURN_SECONDS.rps : 0" :remote="bn?.rps" @pick="(h) => bn?.pickRps(h)" @done="startAfterRps" @back="emit('exit')" />
    <GameMenu :open="menuOpen" :game="game" :options="props.options" :can-save="canSave" @close="menuOpen = false" @restart="restart" @exit="emit('exit')" @save-exit="saveAndExit" />

    <!-- 兵升變 -->
    <Dialog :open="!!promoAsk" :title="S.chess.promoTitle" :label="game.name" tone="yellow" @close="promoAsk = null">
      <p class="text-[0.9rem] text-ink-2">{{ S.chess.promoLead }}</p>
      <div class="promo">
        <button v-for="k in promoChoices" :key="k" class="pc" @click="promote(k)">
          <svg viewBox="0 0 40 40"><PieceIcon :kind="k" :light="human === 0" /></svg>
          <span class="t-black">{{ S.chess.pieces[k] }}</span>
        </button>
      </div>
    </Dialog>

    <Dialog :open="resignOpen" :title="T.resignAsk" :label="game.name" @close="resignOpen = false">
      <template #actions>
        <div class="grid w-full grid-cols-2 gap-[0.8rem]">
          <Btn block @click="resignOpen = false">{{ S.common.cancel }}</Btn>
          <Btn tone="red" block @click="resign">{{ T.resign }}</Btn>
        </div>
      </template>
    </Dialog>

    <Dialog flip :open="resultOpen" :title="resultTitle" :label="T.resultLabel" tone="blue" @close="resultOpen = false">
      <p class="text-[0.95rem]">{{ reason }}</p>
      <p v-if="!watching" class="t-label pt-[0.4rem] text-ink-2">{{ T.record(record.wins, record.losses, record.draws) }}</p>
      <template #actions>
        <Btn size="sm" icon="exit" @click="emit('exit')">{{ S.common.quit }}</Btn>
        <Btn size="sm" icon="check" @click="resultOpen = false">{{ S.common.viewBoard }}</Btn>
        <Btn v-if="!bn" tone="red" icon="again" @click="restart">{{ S.common.again }}</Btn>
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
  padding: 0.7rem 1.2rem 0.7rem 1.2rem;
}
.board-wrap {
  height: 100%;
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
/* 吃到的子：一排小棋子 */
.taken {
  display: flex;
  max-width: 9rem;
  min-height: 1.3rem;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.05rem;
  margin: 0.4rem 0;
}
.tk {
  width: 1.15rem;
  height: 1.15rem;
}
.tk-t {
  font-size: 20px;
  font-weight: 900;
  text-anchor: middle;
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
/* 結束後看棋盤：看結果、離開對局兩顆小按鈕並排，字置中、內距縮小才放得下 */
.end2 :deep(.face) {
  justify-content: center;
  padding: 0 0.25rem;
  font-size: 0.76rem;
}
.end2 :deep(.lb) {
  flex: none;
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
/* 按下時整顆往右下移；多一圈看不見的點擊範圍，放開的位置才不會落在按鈕外面（不然要按兩次） */
.pc {
  position: relative;
}
.pc::after {
  content: '';
  position: absolute;
  inset: -0.3rem;
}
.pc:active {
  transform: translate(0.15rem, 0.15rem);
  box-shadow: none;
}
</style>
