<script setup lang="ts">
// 圍棋：你在左、對手在右，中間棋盤。先猜拳決定黑白；棋子從棋罐飛到落點，被提掉的子往上飄走。
// 雙方連續虛手後進入數地：電腦標出死棋與地盤，你可以點棋子修正，再確認結果。
import { useGrace } from '@/core/grace'
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { playSound } from '@/core/audio'
import { reducedMotion } from '@/core/motion'
import { opponentById, pickOpponents } from '@/core/opponents'
import { useBoardNet } from '@/core/boardNet'
import { recordResult, stats } from '@/core/settings'
import { asLevel, extraThink, goAt } from '@/engine/common/difficulty'
import { myLook } from '@/core/profile'
import { S } from '@/data/strings'
import { seedRng } from '@/engine/common/rng'
import { chooseGoMove } from '@/engine/go/ai'
import { estimateDead } from '@/engine/go/playout'
import { applyGo, createGo, groupAt, other, resumeGo, scoreGo, toXY, tryPlay, type Color, type GoAction, type GoSize, type GoState } from '@/engine/go/rules'
import type { GameDef } from '@/games/types'
import Avatar from '@/ui/art/Avatar.vue'
import Bowl from '@/ui/art/Bowl.vue'
import type { Mood } from '@/ui/art/look'
import Stone from '@/ui/art/Stone.vue'
import Btn from '@/ui/Btn.vue'
import Dialog from '@/ui/Dialog.vue'
import GameMenu from '@/ui/GameMenu.vue'
import TurnGlow from '@/ui/TurnGlow.vue'
import TurnTimer from '@/ui/TurnTimer.vue'
import { TURN_SECONDS } from '@/data/timer'
import IconBtn from '@/ui/IconBtn.vue'
import RpsDuel from '@/ui/RpsDuel.vue'
import UndoBtn from '@/ui/UndoBtn.vue'
import GoBoard from './GoBoard.vue'

const props = defineProps<{ game: GameDef; options: Record<string, string | boolean>; resume?: unknown }>()
const emit = defineEmits<{ exit: []; save: [data: unknown] }>()

/** 「保存進度並退出」存的資料 */
interface Saved {
  state: GoState
  human: Color
  opponent: number
  rng: number
  phase: 'playing' | 'scoring'
  dead: number[]
  aiDead?: number[]
  undoFrom?: GoState | null
  undoUsed?: boolean
}
const T = S.go
/** 規則設定的「倒數計時」 */
/** 連線對局：伺服器當裁判（猜拳、落子、虛手、悔棋、認輸都經過伺服器）；沒有就是一般的單人對電腦 */
const bn = props.resume
  ? null
  : useBoardNet('go', {
      watchStart: (leftFirst) => startAfterRps(leftFirst),
      apply: (ev) => void netApply(ev),
      undo: (by) => void netUndo(by),
      resign: (player) => netResign(player),
      end: (fin) => netEnd(fin as { dead: number[] }),
    })
/** 觀戰：只能看，畫面左邊是 0 號座位那位玩家 */
const watching = !!bn?.watching
const meName = bn?.watching ? bn.left.name : S.common.you
const meLook = () => (bn?.watching ? bn.left.look : myLook())

/** 規則設定：連線時照房主的 */
const rules = bn ? { ...props.options, ...bn.net.opts } : props.options
const timed = rules.timer !== false
/** 難度：只決定電腦多強 */
const level = asLevel(rules.difficulty)
const size = (Number(rules.size) || 19) as GoSize

const state = ref<GoState>(createGo({ size }))
const human = ref<Color>(1)
const opponent = ref(bn ? bn.opponent : pickOpponents(1)[0])
const phase = ref<'rps' | 'playing' | 'counting' | 'scoring' | 'over'>('rps')
const preview = ref(-1)
const message = ref('')
const menuOpen = ref(false)
const resultOpen = ref(false)
const resignOpen = ref(false)
const flying = ref(false)
const dead = ref<number[]>([])
/** 對方（電腦）判斷的死棋；你標的比這個對你更有利時，對方不同意 */
const aiDead = ref<number[]>([])
const disputed = ref(false)
const moods = ref<[Mood, Mood]>(['idle', 'idle'])
/** 悔棋的動畫：被提掉又回來的子 */
const revived = ref<{ key: number; points: number[] } | null>(null)
const captured = ref<{ key: number; color: 1 | 2; points: number[] } | null>(null)
let rng = seedRng(Date.now())
/** 悔棋：每局一次，退回玩家上一步之前的局面 */
const undoFrom = shallowRef<GoState | null>(null)
const undoUsed = ref(false)
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

const ai = computed<Color>(() => other(human.value))
const myTurn = computed(() => !watching && phase.value === 'playing' && !flying.value && state.value.turn === human.value)
const score = computed(() => scoreGo(state.value, dead.value))
const resultTitle = computed(() => (score.value.winner === human.value ? (watching ? S.online.watchWin(meName) : T.win) : watching ? S.online.watchWin(opponent.value.name) : T.lose(opponent.value.name)))
const colorName = (c: Color) => (c === 1 ? T.black : T.white)
const status = computed(() => {
  const t = statusText()
  return watching ? S.online.watchingNow + (t ? '・' + t : '') : t
})
function statusText() {
  if (message.value) return message.value
  if (phase.value === 'counting') return T.bothPassed
  if (phase.value === 'scoring' || phase.value === 'over') return resultTitle.value
  if (phase.value === 'rps') return ''
  return state.value.turn === human.value ? (watching ? T.cpuTurn(meName) : T.yourTurn) : T.cpuTurn(opponent.value.name)
}

// ── 棋子飛行 ──
const sectionEl = ref<HTMLElement>()
const boardEl = ref<HTMLElement>()
const bowlEls = ref<(HTMLElement | null)[]>([null, null])
const flier = ref<HTMLElement>()
const flierBlack = ref(true)

function pointOnScreen(index: number) {
  const rect = boardEl.value!.getBoundingClientRect()
  const [x, y] = toXY(index, size)
  const total = (size - 1) * 10 + 14
  return { x: rect.left + (rect.width * (7 + x * 10)) / total, y: rect.top + (rect.height * (7 + y * 10)) / total, d: (rect.width * 9.1) / total }
}

/** back = 反過來從 index 飛回棋罐（悔棋） */
function fly(who: 0 | 1, index: number, black: boolean, back = false): Promise<void> {
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
  const lift = Math.min(110, Math.abs(x1 - x0) * 0.3 + 36)
  flierBlack.value = black
  el.style.width = `${to.d}px`
  el.style.height = `${to.d}px`
  el.style.display = 'block'
  flying.value = true
  const frames = [
    { transform: `translate(${x0}px, ${y0}px) translate(-50%, -50%) scale(1.2)` },
    { transform: `translate(${(x0 + x1) / 2}px, ${(y0 + y1) / 2 - lift}px) translate(-50%, -50%) scale(1.6)`, offset: 0.5 },
    { transform: `translate(${x1}px, ${y1}px) translate(-50%, -50%) scale(1)` },
  ]
  const anim = el.animate(back ? frames.reverse().map((f, i) => ({ ...f, offset: i / 2 })) : frames, { duration: back ? 380 : 400, easing: 'cubic-bezier(0.3, 0.6, 0.35, 1)' })
  return anim.finished.then(() => {
    el.style.display = 'none'
    flying.value = false
  })
}

// ── 流程 ──
function startAfterRps(playerWins: boolean) {
  human.value = playerWins ? 1 : 2
  state.value = createGo({ size })
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
  opponent.value = pickOpponents(1)[0]
  state.value = createGo({ size })
  preview.value = -1
  message.value = ''
  dead.value = []
  captured.value = null
  moods.value = ['idle', 'idle']
  undoFrom.value = null
  undoUsed.value = false
  phase.value = 'rps'
}

async function act(action: GoAction, who: 0 | 1) {
  if (who === 0) acted.value = true
  if (action.type === 'play') {
    const check = tryPlay(state.value, action.index)
    if (!check.ok) {
      message.value = T.errors[check.reason]
      playSound('error')
      return
    }
    preview.value = -1
    message.value = ''
    await fly(who, action.index, state.value.turn === 1)
  }
  const mover = state.value.turn
  const before = state.value
  const r = applyGo(state.value, action)
  if (!r.ok) return
  revived.value = null
  if (who === 0 && action.type !== 'resign') undoFrom.value = before
  state.value = r.state
  preview.value = -1
  if (action.type === 'play') {
    playSound('stone')
    message.value = ''
    if (r.state.lastCaptured.length) {
      // 被提的子掉進盒蓋
      window.setTimeout(() => playSound('capture'), 160)
      captured.value = { key: r.state.moves, color: other(mover), points: r.state.lastCaptured }
      flash(who, 'happy')
      flash(who === 0 ? 1 : 0, r.state.lastCaptured.length >= 3 ? 'shock' : 'sad')
    }
  } else if (action.type === 'pass') {
    playSound('stonePick')
    message.value = T.passed(who === 0 ? meName : opponent.value.name)
  }
  if (r.state.phase === 'over') return endGame()
  if (r.state.turn === ai.value && !bn) scheduleCpu()
  else moods.value = ['idle', 'idle']
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
  }, 1100)
}

function scheduleCpu() {
  moods.value = [moods.value[0], 'think']
  const st = goAt(opponent.value.persona.go, level, opponent.value.id)
  later(() => {
    let a: GoAction
    ;[a, rng] = chooseGoMove(state.value, st, rng)
    moods.value = [moods.value[0], 'idle']
    void act(a, 1)
  }, 650 + st.skill * 500 + extraThink(level) + Math.random() * 500)
}

function endGame() {
  if (state.value.resigned) return finish()
  phase.value = 'counting'
  // 連線：死活照伺服器（電腦判斷）算的，等它送來再直接結算
  if (bn) return
  // 先讓畫面顯示「開始算地」，再做比較花時間的死棋判斷
  later(() => {
    ;[dead.value, rng] = estimateDead(state.value, rng)
    aiDead.value = dead.value
    disputed.value = false
    phase.value = 'scoring'
  }, 450)
}

/** 從你的角度看領先幾子 */
const lead = (marks: readonly number[]) => {
  const sc = scoreGo(state.value, marks)
  return human.value === 1 ? sc.black - sc.white : sc.white - sc.black
}
/** 確認結果：你標的死活對你比較有利，對方就不同意，要繼續下完來證明 */
function confirmScore() {
  if (lead(dead.value) > lead(aiDead.value) + 0.01) {
    disputed.value = true
    message.value = T.disagree(opponent.value.name)
    moods.value = ['idle', 'shock']
    playSound('error')
    return
  }
  finish()
}
/** 有爭議時改照對方的判斷結算 */
function acceptOpponent() {
  dead.value = aiDead.value
  finish()
}
/** 回到對局繼續下（由對方先下） */
function resumePlay() {
  state.value = resumeGo(state.value, ai.value)
  dead.value = []
  aiDead.value = []
  disputed.value = false
  message.value = T.resumed(opponent.value.name)
  moods.value = ['idle', 'idle']
  phase.value = 'playing'
  scheduleCpu()
}

function finish() {
  message.value = ''
  phase.value = 'over'
  const win = score.value.winner === human.value
  if (watching) void 0 // 觀戰不記戰績
  else if (win) stats.go.wins++
  else stats.go.losses++
  // 表現：贏或輸幾目（輸 40 目以上＝0）
  const m = score.value.margin
  if (!watching) recordResult('go', level, win ? 'w' : 'l', win ? m / 40 : 1 - m / 40)
  moods.value = win ? ['happy', 'sad'] : ['sad', 'happy']
  playSound(win ? 'win' : 'lose')
  later(() => (resultOpen.value = true), 500)
}

function pick(index: number) {
  if (phase.value === 'scoring') {
    // 數地時：點一塊棋切換死活
    if (state.value.board[index] === 0) return
    const g = groupAt(state.value.board, size, index).stones
    const set = new Set(dead.value)
    const isDead = set.has(index)
    for (const s of g) isDead ? set.delete(s) : set.add(s)
    dead.value = [...set]
    disputed.value = false
    if (message.value) message.value = ''
    playSound('stonePick')
    return
  }
  if (!myTurn.value) return
  if (index === preview.value) return confirmMove()
  const r = tryPlay(state.value, index)
  if (!r.ok) {
    message.value = T.errors[r.reason]
    return
  }
  message.value = ''
  preview.value = index
  playSound('stonePick')
}

// 連線：自己下過（hist 跟著 state 一起變，所以讀一下 state 讓它重新算）
const canUndo = computed(() => (bn ? (void state.value, phase.value === 'playing' && !flying.value && hist.some((h) => h.side === bn.mySide.value)) : phase.value === 'playing' && !flying.value && !!undoFrom.value && !undoUsed.value))
/** 悔棋：電腦還在想就停下來；剛下的棋子飛回各自的棋罐（電腦的先回去），被提掉的子冒回來，局面退回玩家上一步之前 */
async function undo() {
  // 連線：送出申請，等對方同意
  if (bn) return canUndo.value && bn.askUndo()
  if (!canUndo.value || !undoFrom.value) return
  timers.forEach((t) => window.clearTimeout(t))
  timers.clear()
  const prev = undoFrom.value
  undoFrom.value = null
  undoUsed.value = true
  await revert(prev)
}
/** 退回到 prev：剛下的棋子飛回各自的棋罐（電腦的先回去），被提掉的子冒回來 */
async function revert(prev: GoState) {
  preview.value = -1
  message.value = ''
  captured.value = null
  moods.value = ['idle', 'idle']
  const cur = state.value
  const placed: number[] = []
  const back: number[] = []
  cur.board.forEach((c, i) => {
    if (c !== 0 && prev.board[i] === 0) placed.push(i)
    else if (prev.board[i] !== 0 && c !== prev.board[i]) back.push(i)
  })
  // 電腦的子先飛回去，再輪到你的
  placed.sort((a, b) => (cur.board[a] === ai.value ? 0 : 1) - (cur.board[b] === ai.value ? 0 : 1))
  for (const idx of placed) {
    const color = state.value.board[idx]
    const board = state.value.board.slice()
    board[idx] = 0
    state.value = { ...state.value, board, lastMove: -2 }
    playSound('stonePick')
    await fly(color === human.value ? 0 : 1, idx, color === 1, true)
  }
  revived.value = back.length ? { key: Date.now(), points: back } : null
  state.value = prev
  if (back.length) playSound('stone')
}

function confirmMove() {
  if (!myTurn.value || preview.value < 0) return
  if (bn) {
    // 連線：送給伺服器，等它送回來才真的落子
    if (!tryPlay(state.value, preview.value).ok) return
    acted.value = true
    bn.send({ type: 'play', index: preview.value })
    return
  }
  void act({ type: 'play', index: preview.value }, 0)
}

// ── 連線對局：伺服器送來的每一步 ──
/** 每一步之前的局面與誰下的（悔棋時找「那一方上一手之前」） */
const hist: { state: GoState; side: number }[] = []
const sideOfHuman = () => (human.value === 1 ? 0 : 1)
async function netApply(ev: { type: string; player: number; index?: unknown }) {
  hist.push({ state: state.value, side: ev.player })
  const who = ev.player === sideOfHuman() ? 0 : 1
  await act(ev.type === 'play' ? { type: 'play', index: ev.index as number } : { type: 'pass' }, who)
  bn!.next()
}
async function netUndo(by: number) {
  const k = hist.map((h) => h.side).lastIndexOf(by)
  if (k >= 0) {
    const prev = hist[k].state
    hist.length = k
    if (by === sideOfHuman()) undoUsed.value = true
    await revert(prev)
  }
  bn!.next()
}
/** 有人認輸（不用輪到他） */
function netResign(player: number) {
  if (phase.value === 'playing') {
    state.value = { ...state.value, phase: 'over', resigned: (player + 1) as Color }
    finish()
  }
  bn!.next()
}
/** 雙方都虛手：照伺服器算的死活直接結算 */
function netEnd(fin: { dead: number[] }) {
  if (phase.value === 'over') return
  dead.value = fin.dead ?? []
  aiDead.value = dead.value
  finish()
}
if (bn) watch(bn.undoRefused, () => (message.value = S.common.undoRefused(opponent.value.name)))

// ── 保存進度並退出／讀回存檔 ──
/** 玩家自己有沒有動過（還沒動過就離開：不必按兩次、也不需要存檔） */
const acted = ref(!!props.resume)
const canSave = computed(() => !bn && (phase.value === 'playing' || phase.value === 'scoring') && acted.value)
/** 目前的進度（可以存檔時才有；還沒動過、已經結束就是 null） */
function snapshot(): Saved | null {
  if (!canSave.value) return null
  const data: Saved = { state: state.value, human: human.value, opponent: opponent.value.id, rng, phase: phase.value === 'scoring' ? 'scoring' : 'playing', dead: dead.value, aiDead: aiDead.value, undoFrom: undoFrom.value, undoUsed: undoUsed.value }
  return data
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
  dead.value = d.dead ?? []
  aiDead.value = d.aiDead ?? d.dead ?? []
  undoFrom.value = d.undoFrom ?? null
  undoUsed.value = d.undoUsed ?? false
  phase.value = d.phase
  if (d.phase === 'playing' && state.value.turn === ai.value) scheduleCpu()
}
const grace = useGrace(props.options, state, () => state.value.turn === human.value)
// 虛手要按兩次：第一次按下變成「再按一次虛手」，2.5 秒內再按才真的虛手
const passArmed = ref(false)
let passTimer = 0
function pass() {
  if (!myTurn.value) return
  if (!passArmed.value) {
    passArmed.value = true
    playSound('tap')
    window.clearTimeout(passTimer)
    passTimer = window.setTimeout(() => (passArmed.value = false), 2500)
    return
  }
  passArmed.value = false
  window.clearTimeout(passTimer)
  if (bn) {
    acted.value = true
    bn.send({ type: 'pass' })
    return
  }
  void act({ type: 'pass' }, 0)
}
watch(
  () => myTurn.value,
  (v) => {
    if (!v) {
      passArmed.value = false
      window.clearTimeout(passTimer)
    }
  },
)
onBeforeUnmount(() => window.clearTimeout(passTimer))
/** 時間到：這一手跳過（等於虛手），換對方 */
function onTimeout() {
  // 連線：時間到由伺服器判（等於虛手）
  if (bn) return
  if (!myTurn.value) return
  preview.value = -1
  passArmed.value = false
  void act({ type: 'pass' }, 0).then(() => (message.value = S.common.timedOut))
}

function resign() {
  resignOpen.value = false
  if (bn) return phase.value === 'playing' && bn.resign()
  if (phase.value === 'playing' && state.value.turn === human.value) void act({ type: 'resign' }, 0)
  else {
    // 不在自己回合也能認輸
    state.value = { ...state.value, phase: 'over', resigned: human.value }
    finish()
  }
}

const lastMove = computed(() => state.value.lastMove)
const resultLine = computed(() => {
  if (state.value.resigned) return state.value.resigned === human.value ? T.resignedYou : T.resignedThem(opponent.value.name)
  return `${T.scoreLine(score.value.black, score.value.white, state.value.komi)}　${T.margin(score.value.margin)}`
})
</script>

<template>
  <section ref="sectionEl" class="gm">
    <!-- 輪到誰：那個人那一側淡淡亮起 -->
    <TurnGlow side="left" :on="phase === 'playing' && state.turn === human" />
    <TurnGlow side="right" :on="phase === 'playing' && state.turn !== human" />
    <TurnTimer v-if="timed" :side="state.turn === human ? 'left' : 'right'" :active="phase === 'playing' && !flying && !(grace && state.turn === human)" :paused="!bn && menuOpen" :seconds="TURN_SECONDS.board" :turn-key="state" @timeout="onTimeout" />
    <div class="corner"><IconBtn icon="menu" :label="S.common.menu" @click="menuOpen = true" /></div>

    <aside class="side left">
      <div class="who rise" :class="{ active: phase === 'playing' && state.turn === human }">
        <span class="av"><Avatar :look="meLook()" :mood="moods[0]" /></span>
        <span :ref="(el) => (bowlEls[0] = el as HTMLElement | null)" class="bowl"><Bowl :black="human === 1" /></span>
      </div>
      <p class="nm t-black"><span class="hl" :class="{ on: phase === 'playing' && state.turn === human }" />{{ meName }}</p>
      <p v-if="phase !== 'rps'" class="t-label tg">{{ colorName(human) }} · {{ T.captured(state.captures[human]) }}</p>
      <div class="small-acts">
        <Btn v-if="!watching" size="sm" :tone="passArmed ? 'yellow' : 'plain'" :disabled="!myTurn || !!bn?.sending.value" @click="pass">{{ passArmed ? T.passConfirm : T.pass }}</Btn>
        <Btn v-if="!watching" size="sm" :disabled="phase !== 'playing'" @click="resignOpen = true">{{ T.resign }}</Btn>
        <UndoBtn v-if="!watching" :disabled="!canUndo" :used="undoUsed" :waiting="!!bn?.undoWaiting.value" :asked="!!bn?.undoAsked.value" @answer="(ok) => bn?.answerUndo(ok)" @undo="void undo()" />
      </div>
    </aside>

    <div ref="boardEl" class="board-wrap">
      <GoBoard
        :board="state.board"
        :size="size"
        :last-move="lastMove"
        :preview="preview"
        :preview-color="human"
        :interactive="myTurn || phase === 'scoring'"
        :captured="captured"
        :revived="revived"
        :area="phase === 'scoring' || phase === 'over' ? score.area : null"
        :dead="phase === 'scoring' || phase === 'over' ? dead : []"
        @pick="pick"
      />
    </div>

    <aside class="side right">
      <div class="who rise" style="--i: 1" :class="{ active: phase === 'playing' && state.turn === ai }">
        <span class="av"><Avatar :look="opponent.look" :mood="moods[1]" flip talk /></span>
        <span :ref="(el) => (bowlEls[1] = el as HTMLElement | null)" class="bowl"><Bowl :black="ai === 1" /></span>
      </div>
      <p class="nm t-black"><span class="hl" :class="{ on: phase === 'playing' && state.turn === ai }" />{{ opponent.name }}</p>
      <p class="t-label tg">{{ opponent.tag }}<template v-if="phase !== 'rps'"> · {{ colorName(ai) }} · {{ T.captured(state.captures[ai]) }}</template></p>
      <div class="status-box">
        <p class="t-slab moves">{{ phase !== 'rps' ? String(state.moves).padStart(3, '0') : '' }}</p>
        <p class="status" :class="{ mine: myTurn && !message, warn: !!message && phase === 'playing' }">{{ status }}</p>
        <p class="hint">{{ phase === 'scoring' ? T.scoringLead : myTurn && !message ? T.previewHint : '' }}</p>
      </div>
      <div class="act">
        <template v-if="phase === 'scoring'">
          <Btn v-if="disputed" tone="red" block @click="resumePlay">{{ T.resume }}</Btn>
          <Btn v-else tone="red" size="lg" arrow block @click="confirmScore">{{ T.confirm }}</Btn>
          <Btn class="mt-[0.5rem]" size="sm" block @click="disputed ? acceptOpponent() : resumePlay()">{{ disputed ? T.byOpponent : T.resume }}</Btn>
        </template>
        <Btn v-else-if="phase === 'over' && !bn" tone="ink" icon="again" block @click="restart">{{ S.common.again }}</Btn>
        <Btn v-else-if="phase !== 'over' && !watching" tone="red" size="lg" arrow block :disabled="!myTurn || preview < 0 || !!bn?.sending.value" @click="confirmMove">{{ T.place }}</Btn>
      </div>
    </aside>

    <div ref="flier" class="flier"><svg viewBox="-12 -12 26 26"><Stone :cx="0" :cy="0" :r="10" :black="flierBlack" /></svg></div>

    <RpsDuel :open="phase === 'rps' && !watching && (!menuOpen || !!bn)" :opponent="opponent" :seconds="timed ? TURN_SECONDS.rps : 0" :remote="bn?.rps" @pick="(h) => bn?.pickRps(h)" @done="startAfterRps" @back="emit('exit')" />
    <GameMenu :open="menuOpen" :game="game" :options="props.options" @close="menuOpen = false" @restart="restart" @exit="emit('exit')" :can-save="canSave" @save-exit="saveAndExit" />
    <Dialog :open="resignOpen" :title="T.resignAsk" :label="game.name" @close="resignOpen = false">
      <template #actions>
        <div class="grid w-full grid-cols-2 gap-[0.8rem]">
          <Btn block @click="resignOpen = false">{{ S.common.cancel }}</Btn>
          <Btn tone="red" block @click="resign">{{ T.resign }}</Btn>
        </div>
      </template>
    </Dialog>
    <Dialog flip :open="resultOpen" :title="resultTitle" :label="T.resultLabel" tone="blue" @close="resultOpen = false">
      <p class="text-[0.95rem]">{{ resultLine }}</p>
      <p v-if="!watching" class="t-label pt-[0.4rem] text-ink-2">{{ T.record(stats.go.wins, stats.go.losses) }}</p>
      <template #actions>
        <Btn v-if="!bn" tone="red" icon="again" @click="restart">{{ S.common.again }}</Btn>
        <Btn icon="exit" @click="emit('exit')">{{ S.common.quit }}</Btn>
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
  padding: 0.6rem 1.2rem 0.6rem 1.2rem;
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
  padding-bottom: 0.4rem;
}
.right {
  padding-top: 0.4rem;
}
.who {
  position: relative;
  width: 6.2rem;
  height: 5rem;
  transition: transform 300ms var(--ease-back);
}
.who.active {
  transform: translateY(-0.3rem);
}
.av {
  position: absolute;
  left: 0;
  top: 0;
  width: 4rem;
  height: 4rem;
}
.right .av {
  left: auto;
  right: 0;
}
.bowl {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 2.7rem;
  height: 2.7rem;
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
  font-size: 1.05rem;
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
  text-align: center;
}
.small-acts {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.4rem;
  margin-top: 0.6rem;
}
.status-box {
  margin-top: auto;
  text-align: center;
}
.moves {
  font-size: 1.4rem;
  line-height: 1;
  color: var(--color-red);
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
.hint {
  min-height: 2.4em;
  font-size: 0.7rem;
  line-height: 1.35;
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
