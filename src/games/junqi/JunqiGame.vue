<script setup lang="ts">
// 軍棋對局：你在左、對手在右，中間是橫放的棋盤（自己的陣地在左半邊）。
// 開局猜拳（贏的人拿紅方先走）→ 佈陣（點兩顆子互換位置；隨機擺、上次的陣形；按「佈好了」）→ 對局。
// 對方的子看不到是什麼；碰子時只說結果。司令陣亡就亮出那一方的軍旗。悔棋每局一次（連線時要對方同意）。
// 單人時 state 是完整的局面（畫面用 viewFor 遮住對方的子）；連線時 state 本來就只有自己看得到的（碰子結果由伺服器送來）。
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { playSound } from '@/core/audio'
import { useBoardNet } from '@/core/boardNet'
import { useGrace } from '@/core/grace'
import { watchSeats } from '@/core/onlineMatch'
import { opponentById, pickOpponents } from '@/core/opponents'
import { myLook } from '@/core/profile'
import { recordResult, settings, stats } from '@/core/settings'
import { S } from '@/data/strings'
import { TURN_SECONDS } from '@/data/timer'
import { asCardLevel } from '@/engine/common/difficulty'
import { seedRng, type RngState } from '@/engine/common/rng'
import { chooseJunqiAction } from '@/engine/junqi/ai'
import {
  applyJunqi, createJunqi, homeOf, layoutProblem, PER_SIDE, randomLayout, targetsOf, UNKNOWN, viewFor, type JunqiAction, type JunqiState, type MoveInfo, type Side,
} from '@/engine/junqi/rules'
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
import JunqiBoard, { type JunqiFx } from './JunqiBoard.vue'

const props = defineProps<{ game: GameDef; options: Record<string, string | boolean>; resume?: unknown }>()
const emit = defineEmits<{ exit: []; save: [data: unknown] }>()
const T = S.junqi
const record = stats.junqi
/** 連線對局：伺服器當裁判（猜拳、佈陣、碰子、悔棋、認輸都經過伺服器）；沒有就是一般的單人對電腦 */
const bn = props.resume
  ? null
  : useBoardNet('junqi', {
      watchStart: (leftFirst) => startAfterRps(leftFirst),
      apply: (ev) => netApply(ev),
      undo: (by) => netUndo(by),
      resign: (player) => netResign(player),
      end: (final) => netEnd(final),
    })
const watching = !!bn?.watching
const meName = bn?.watching ? bn.left.name : S.common.you
const meLook = () => (bn?.watching ? bn.left.look : myLook())

/** 規則設定：連線時照房主的 */
const rules = bn ? { ...props.options, ...bn.net.opts } : props.options
const timed = rules.timer !== false
const level = asCardLevel(rules.difficulty)

interface Saved {
  state: JunqiState
  human: Side
  opponent: number
  rng: number
  undoUsed?: boolean
  layout?: number[]
}
const saved = (props.resume ?? null) as Saved | null

/** 上次的陣形（合規則才用） */
const lastLayout = (): number[] | null => {
  const l = settings.junqiLayout
  return l && !layoutProblem(l) ? [...l] : null
}
let rng: RngState = saved ? saved.rng : seedRng(Date.now())
function freshLayout(): number[] {
  const l = lastLayout()
  if (l) return l
  let out: number[]
  ;[out, rng] = randomLayout(rng)
  return out
}

const state = shallowRef<JunqiState>(saved ? saved.state : createJunqi())
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
const undoUsed = ref(saved?.undoUsed ?? false)
/** 佈陣：自己擺的陣（HOME 的順序）、選起來的那一格（-1＝沒選） */
const layout = ref<number[]>(saved?.layout ?? freshLayout())
const deploySel = ref(-1)
/** 連線：按了「佈好了」，等輪到自己就送出 */
const deployReady = ref(false)
/** 走子：選起來的子 */
const selected = ref(-1)
const fx = ref<JunqiFx | null>(null)
let fxKey = 0
/** 佈陣時剛互換的兩顆（動畫） */
const swapFx = ref<{ a: number; b: number; key: number } | null>(null)
/** 近三步的動作（最新的在最上面）：狀態列的字一下就換掉，這裡留著讓人看清楚 */
const log = ref<{ key: number; text: string; warn?: boolean }[]>([])
let logKey = 0
function note(text: string, warn = false) {
  if (!text) return
  log.value = [{ key: ++logKey, text, warn }, ...log.value].slice(0, 3)
}
/** 連線結束攤牌：每顆子是什麼 */
const revealed = ref<number[] | null>(null)
const hist: { state: JunqiState; side: number }[] = []
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

const opSide = computed<Side>(() => (human.value === 0 ? 1 : 0))
const deploying = computed(() => phase.value === 'playing' && state.value.phase === 'deploy')
const myDeployed = computed(() => state.value.deployed[human.value])
const myTurn = computed(() => !watching && phase.value === 'playing' && !thinking.value && state.value.turn === human.value && state.value.phase === 'play')
const seatName = (side: Side) => (side === 0 ? T.red : T.blue)
const winner = computed(() => state.value.winner)
const resultTitle = computed(() => (winner.value === null ? T.draw : winner.value === human.value ? (watching ? S.online.watchWin(meName) : T.win) : watching ? S.online.watchWin(opponent.value.name) : T.lose(opponent.value.name)))

/** 畫面上看到的每顆子是什麼：單人時遮住對方的（結束了就全部翻開）；連線結束時用伺服器攤的牌 */
const shownRank = computed<readonly number[]>(() => {
  const s = state.value
  if (phase.value === 'over') return revealed.value ?? s.rank
  const base = bn ? s.rank : viewFor(s, human.value).rank
  if (!deploying.value || myDeployed.value) return base
  const r = base.slice()
  layout.value.forEach((x, k) => (r[human.value * PER_SIDE + k] = x))
  return r
})
/** 畫面上的棋盤：佈陣時自己的子照正在擺的陣 */
const shownBoard = computed<readonly number[]>(() => {
  const s = state.value
  if (!deploying.value || myDeployed.value) return s.board
  const b = s.board.slice()
  homeOf(human.value).forEach((at, k) => (b[at] = human.value * PER_SIDE + k))
  return b
})
const aliveOf = (side: Side) => state.value.board.filter((id) => id >= 0 && (id < PER_SIDE ? 0 : 1) === side).length
const targets = computed(() => (myTurn.value && selected.value >= 0 ? targetsOf(state.value, selected.value) : []))
/** 佈陣時選起來的那一格（畫面上的點） */
const deployCell = computed(() => (deploySel.value >= 0 ? homeOf(human.value)[deploySel.value] : -1))
const status = computed(() => {
  const t = statusText()
  return watching ? S.online.watchingNow + (t ? '・' + t : '') : t
})
function statusText() {
  if (message.value) return message.value
  if (phase.value === 'over') return resultTitle.value
  if (phase.value === 'rps') return ''
  const s = state.value
  if (s.phase === 'deploy') {
    if (watching) return T.opDeploy(s.turn === human.value ? meName : opponent.value.name)
    if (!myDeployed.value) {
      if (deployReady.value) return T.deployWait
      return deploySel.value >= 0 ? T.deployPicked(T.full[layout.value[deploySel.value]]) : T.deployTurn
    }
    return T.opDeploy(opponent.value.name)
  }
  if (s.turn === human.value) {
    if (watching) return T.cpuTurn(meName)
    return selected.value >= 0 ? T.pickTarget : T.moveTurn
  }
  return T.cpuTurn(opponent.value.name)
}
/** 結算的說明 */
const reasonText = computed(() => {
  const f = T.endReason[state.value.status]
  if (!f) return ''
  const w = state.value.winner
  const loser = w === null ? '' : w === human.value ? opponent.value.name : watching ? meName : S.common.you
  return f(loser)
})

// ── 流程 ──
function startAfterRps(playerWins: boolean) {
  human.value = playerWins ? 0 : 1
  state.value = createJunqi()
  hist.length = 0
  undoUsed.value = false
  deploySel.value = -1
  deployReady.value = false
  revealed.value = null
  fx.value = null
  log.value = []
  phase.value = 'playing'
  if (bn) return bn.next()
  // 電腦先手：電腦先佈好陣
  if (!playerWins) cpuDeploy()
}
function restart() {
  if (bn) return
  timers.forEach((t) => window.clearTimeout(t))
  timers.clear()
  menuOpen.value = false
  resultOpen.value = false
  opponent.value = pickOpponents(1)[0]
  state.value = createJunqi()
  hist.length = 0
  message.value = ''
  thinking.value = false
  selected.value = -1
  deploySel.value = -1
  fx.value = null
  swapFx.value = null
  log.value = []
  layout.value = freshLayout()
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

/** 電腦佈陣（單人） */
function cpuDeploy() {
  let a: JunqiAction
  ;[a, rng] = chooseJunqiAction(viewFor(state.value, opSide.value), level, rng)
  const r = applyJunqi(state.value, a)
  if (r.ok) state.value = r.state
  playSound('deal')
  if (state.value.phase === 'play' && state.value.turn !== human.value) scheduleCpu()
}

// ── 佈陣 ──
function deployPick(at: number) {
  if (myDeployed.value || deployReady.value || watching) return
  const k = homeOf(human.value).indexOf(at)
  if (k < 0) return
  message.value = ''
  if (deploySel.value < 0) {
    deploySel.value = k
    playSound('piecePick')
    return
  }
  if (deploySel.value === k) {
    deploySel.value = -1
    return
  }
  const next = layout.value.slice()
  ;[next[k], next[deploySel.value]] = [next[deploySel.value], next[k]]
  const bad = layoutProblem(next)
  if (bad) {
    message.value = T.layoutErrors[bad] ?? ''
    playSound('error')
    deploySel.value = -1
    return
  }
  layout.value = next
  const home = homeOf(human.value)
  swapFx.value = { a: home[k], b: home[deploySel.value], key: ++fxKey }
  deploySel.value = -1
  playSound('xqPiece')
}
function shuffleLayout() {
  if (myDeployed.value || deployReady.value) return
  ;[layout.value, rng] = randomLayout(rng)
  deploySel.value = -1
  message.value = ''
  playSound('shuffle')
}
function useLastLayout() {
  const l = lastLayout()
  if (!l || myDeployed.value || deployReady.value) return
  layout.value = l
  deploySel.value = -1
  message.value = ''
  playSound('xqPiece')
}
const hasLast = computed(() => {
  const l = lastLayout()
  return !!l && l.join() !== layout.value.join()
})
/** 佈好了：記成「上次的陣形」；單人直接佈好（電腦接著佈），連線等輪到自己才送 */
function confirmDeploy() {
  if (myDeployed.value || deployReady.value || watching || layoutProblem(layout.value)) return
  settings.junqiLayout = [...layout.value]
  deploySel.value = -1
  acted.value = true
  if (bn) {
    deployReady.value = true
    return trySendDeploy()
  }
  const r = applyJunqi(state.value, { type: 'deploy', side: human.value, layout: [...layout.value] })
  if (!r.ok) return
  state.value = r.state
  playSound('deal')
  if (state.value.phase === 'deploy') later(cpuDeploy, 500)
}
function trySendDeploy() {
  if (!bn || !deployReady.value || myDeployed.value) return
  const s = state.value
  if (s.phase !== 'deploy' || s.turn !== human.value) return
  bn.send({ type: 'deploy', layout: [...layout.value] })
}
if (bn) watch(state, trySendDeploy)

// ── 走子 ──
/** 畫面上看到的某一顆子（動畫用） */
const looks = (id: number) => ({ side: id < PER_SIDE ? 0 : 1, rank: id >= 0 ? shownRank.value[id] : UNKNOWN })

/** 一步：做動畫、說碰子結果（who：0 = 左邊的你、1 = 右邊的對手） */
function commit(a: JunqiAction, who: 0 | 1, info?: MoveInfo): boolean {
  if (who === 0) acted.value = true
  const before = state.value
  const att = a.type === 'move' ? before.board[a.from] : -1
  const def = a.type === 'move' ? before.board[a.to] : -1
  const attLook = att >= 0 ? looks(att) : null
  const defLook = def >= 0 ? looks(def) : null
  const r = applyJunqi(before, a, info)
  if (!r.ok) {
    message.value = T.errors[r.reason] ?? ''
    playSound('error')
    return false
  }
  const mover = before.turn
  if (before.phase === 'play') hist.push({ state: before, side: mover })
  state.value = r.state
  selected.value = -1
  const last = r.state.last
  if (a.type === 'move' && last && attLook) {
    fx.value = { key: ++fxKey, from: a.from, to: a.to, out: last.out, att: attLook, def: defLook }
    message.value = ''
    note(last.out === 'move' ? moveText(attLook, who) : clashText(last.out, attLook, defLook, who), last.out !== 'move')
    if (r.state.flagShown.join() !== before.flagShown.join()) note(T.flagShown, true)
    if (last.out === 'move') playSound('xqPiece')
    else {
      playSound('xqPiece')
      window.setTimeout(() => playSound('xqCapture'), 300)
      // 攻方贏：攻的人得意、守的嚇一跳；攻方輸：反過來
      const winnerWho = last.out === 'win' ? who : last.out === 'lose' ? (who === 0 ? 1 : 0) : -1
      if (winnerWho >= 0) {
        flash(winnerWho as 0 | 1, 'smug')
        flash(winnerWho === 0 ? 1 : 0, 'shock')
      }
    }
  }
  if (state.value.status !== 'playing') finish()
  else if (!bn && state.value.turn !== human.value && state.value.phase === 'play') scheduleCpu()
  return true
}
/** 走到空點（紀錄用） */
function moveText(att: { rank: number }, who: 0 | 1): string {
  if (watching) return T.logMove(who === 0 ? meName : opponent.value.name, '')
  return who === 0 ? T.logMove(S.common.you, T.full[att.rank] ?? '') : T.logMove(opponent.value.name, '')
}
/** 碰子的結果（自己的角度）；走到空點就不說 */
function clashText(out: string, att: { side: number; rank: number }, def: { side: number; rank: number } | null, who: 0 | 1): string {
  if (out === 'move' || !def) return ''
  if (watching) return T.watchClash[out] ?? ''
  const C = T.clash
  if (who === 0) {
    const mine = T.full[att.rank] ?? ''
    return out === 'win' ? C.attWin(mine) : out === 'lose' ? C.attLose(mine) : C.attTie(mine)
  }
  const mine = T.full[def.rank] ?? ''
  return out === 'win' ? C.defWin(mine, opponent.value.name) : out === 'lose' ? C.defLose(mine, opponent.value.name) : C.defTie(mine)
}

function scheduleCpu() {
  thinking.value = true
  moods.value = [moods.value[0], 'think']
  later(
    () => {
      let a: JunqiAction
      ;[a, rng] = chooseJunqiAction(viewFor(state.value, opSide.value), level, rng)
      thinking.value = false
      moods.value = [moods.value[0], 'idle']
      if (!commit(a, 1)) commit({ type: 'timeout' }, 1)
    },
    1500 + (level === 'high' ? 400 : level === 'mid' ? 200 : 0) + Math.random() * 900,
  )
}

/** 時間到：佈陣中（連線）就送出現在擺的陣；對局中這一步跳過 */
function onTimeout() {
  if (deploying.value) {
    if (bn && !myDeployed.value && state.value.turn === human.value) {
      deployReady.value = true
      trySendDeploy()
    }
    return
  }
  if (bn || !myTurn.value) return
  acted.value = true
  selected.value = -1
  const r = applyJunqi(state.value, { type: 'timeout' })
  if (!r.ok) return
  hist.push({ state: state.value, side: state.value.turn })
  state.value = r.state
  playSound('error')
  message.value = S.common.timedOut
  note(T.logTimeout(S.common.you))
  if (state.value.status !== 'playing') finish()
  else scheduleCpu()
}

function finish(wait = 1100) {
  phase.value = 'over'
  selected.value = -1
  const w = winner.value
  const won = w === human.value
  if (!watching) {
    if (w === null) record.draws++
    else if (won) record.wins++
    else record.losses++
    // 表現：剩下的子差多少
    const diff = (aliveOf(human.value) - aliveOf(opSide.value)) / PER_SIDE
    recordResult('junqi', level, w === null ? 'd' : won ? 'w' : 'l', won ? 0.4 + diff : 1 + diff * 1.5)
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
function pick(at: number) {
  if (deploying.value) return deployPick(at)
  if (!myTurn.value) return
  const s = state.value
  message.value = ''
  const id = s.board[at]
  if (id >= 0 && (id < PER_SIDE ? 0 : 1) === human.value) {
    if (selected.value === at) {
      selected.value = -1
      return
    }
    if (!targetsOf(s, at).length) {
      selected.value = -1
      message.value = T.errors.cantMove
      playSound('error')
      return
    }
    selected.value = at
    playSound('piecePick')
    return
  }
  if (selected.value >= 0 && targets.value.includes(at)) return mine({ type: 'move', from: selected.value, to: at })
}

/** 拖曳：佈陣時拖自己的子到另一顆上＝互換；對局中拖自己能動的子到要去的地方 */
function canDrag(at: number): boolean {
  if (deploying.value) return !myDeployed.value && !deployReady.value && homeOf(human.value).includes(at)
  const id = state.value.board[at]
  return myTurn.value && id >= 0 && (id < PER_SIDE ? 0 : 1) === human.value && targetsOf(state.value, at).length > 0
}
function grab(at: number) {
  if (!canDrag(at)) return
  if (deploying.value) {
    deploySel.value = homeOf(human.value).indexOf(at)
    return
  }
  if (selected.value !== at) {
    selected.value = at
    message.value = ''
    playSound('piecePick')
  }
}
function drop(from: number, to: number) {
  if (!canDrag(from)) return
  if (deploying.value) {
    deploySel.value = homeOf(human.value).indexOf(from)
    if (homeOf(human.value).includes(to)) deployPick(to)
    else deploySel.value = -1
    return
  }
  if (targetsOf(state.value, from).includes(to)) mine({ type: 'move', from, to })
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
  const r = applyJunqi(state.value, { type: 'resign', side: human.value })
  if (r.ok) state.value = r.state
  finish(260)
}
/** 自己走一步：連線時送給伺服器（等它送回來才真的走），單人時直接走 */
function mine(a: JunqiAction) {
  if (!bn) return void commit(a, 0)
  if (a.type !== 'move' || !targetsOf(state.value, a.from).includes(a.to)) return
  acted.value = true
  selected.value = -1
  bn.send({ type: 'move', from: a.from, to: a.to })
}

// ── 悔棋 ──
const canUndo = computed(() => {
  void state.value
  if (watching || phase.value !== 'playing' || state.value.phase !== 'play') return false
  return hist.some((h) => h.side === human.value) && (bn ? true : !undoUsed.value)
})
const usedUndo = computed(() => (bn ? bn.undoUsed.value : undoUsed.value))
function revertTo(k: number) {
  state.value = hist[k].state
  hist.splice(k)
  message.value = ''
  selected.value = -1
  fx.value = null
  log.value = []
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
function netApply(ev: { type: string; player: number } & Record<string, unknown>) {
  const who = ev.player === human.value ? 0 : 1
  const side = ev.player as Side
  if (ev.type === 'deploy') {
    const l = Array.isArray(ev.layout) ? (ev.layout as number[]) : undefined
    const r = applyJunqi(state.value, { type: 'deploy', side, ...(l ? { layout: l } : {}) })
    if (r.ok) state.value = r.state
    if (who === 0) deployReady.value = false
    playSound('deal')
    return later(() => bn!.next(), 380)
  }
  const info = (ev.info ?? undefined) as MoveInfo | undefined
  if (ev.type === 'move') commit({ type: 'move', from: ev.from as number, to: ev.to as number }, who, info)
  else {
    const r = applyJunqi(state.value, { type: 'timeout' }, info)
    if (r.ok) {
      if (state.value.phase === 'play') hist.push({ state: state.value, side: state.value.turn })
      state.value = r.state
      if (who === 0) ((message.value = S.common.timedOut), playSound('error'))
      note(T.logTimeout(who === 0 ? meName : opponent.value.name))
      if (state.value.status !== 'playing') finish()
    }
  }
  later(() => bn!.next(), ev.type === 'timeout' ? 50 : 520)
}
function netResign(player: number) {
  if (phase.value === 'playing') {
    const r = applyJunqi(state.value, { type: 'resign', side: player as Side })
    if (r.ok) state.value = r.state
    finish(260)
  }
  bn!.next()
}
/** 結束攤牌：全部的子是什麼 */
function netEnd(final: unknown) {
  const f = final as Partial<JunqiState> | null
  if (f && Array.isArray(f.rank)) revealed.value = f.rank
}

// ── 保存進度並退出 ──
const acted = ref(!!saved)
const canSave = computed(() => !bn && phase.value === 'playing' && acted.value)
function snapshot(): Saved | null {
  if (!canSave.value) return null
  return { state: state.value, human: human.value, opponent: opponent.value.id, rng, undoUsed: undoUsed.value, layout: layout.value }
}
function saveAndExit() {
  const data = snapshot()
  if (data) emit('save', data)
}
defineExpose({ pause: () => phase.value === 'playing' && !resultOpen.value && (menuOpen.value = true), snapshot })
if (saved) {
  if (state.value.phase === 'deploy' && state.value.turn !== human.value) cpuDeploy()
  else if (state.value.phase === 'play' && state.value.turn !== human.value) scheduleCpu()
}
</script>

<template>
  <section class="gm">
    <TurnGlow side="left" me :on="phase === 'playing' && state.turn === human && (!deploying || !myDeployed)" />
    <TurnGlow side="right" :on="phase === 'playing' && state.turn !== human && !(deploying && !bn)" />
    <TurnTimer
      v-if="timed"
      :side="state.turn === human ? 'left' : 'right'"
      :active="phase === 'playing' && (!deploying || !!bn) && !(grace && state.turn === human)"
      :paused="!bn && menuOpen"
      :seconds="TURN_SECONDS.board"
      :turn-key="state"
      @timeout="onTimeout"
    />
    <div class="corner"><IconBtn icon="menu" :label="S.common.menu" @click="menuOpen = true" /></div>

    <aside class="side left">
      <div class="who rise" :class="{ active: phase === 'playing' && state.turn === human }">
        <span class="av"><Avatar :look="meLook()" :mood="moods[0]" /></span>
      </div>
      <p class="nm t-black"><span class="dotc" :class="`c${human}`" /><span class="hl" :class="{ on: phase === 'playing' && state.turn === human }" />{{ meName }}</p>
      <p v-if="phase !== 'rps'" class="t-label tg">{{ seatName(human) }}</p>
      <p v-if="phase !== 'rps' && !deploying" class="t-label cnt">{{ T.left(aliveOf(human)) }}</p>
    </aside>

    <div class="board-wrap">
      <div class="board-box">
        <JunqiBoard
          :board="shownBoard"
          :rank="shownRank"
          :flip="human === 1"
          :interactive="(deploying && !myDeployed && !deployReady && !watching) || myTurn"
          :selected="deploying ? deployCell : selected"
          :targets="targets"
          :fx="deploying ? null : fx"
          :deploying="deploying && !myDeployed"
          :swap="deploying ? swapFx : null"
          :can-drag="watching ? null : canDrag"
          @pick="pick"
          @grab="grab"
          @drop="drop"
        />
      </div>
      <!-- 近三步（最新的在最上面） -->
      <ol class="log">
        <TransitionGroup name="logline">
          <li v-for="(l, i) in deploying ? [] : log" :key="l.key" :class="[`k${i}`, { warn: l.warn }]">{{ l.text }}</li>
        </TransitionGroup>
      </ol>
    </div>

    <aside class="side right">
      <div class="who rise" style="--i: 1" :class="{ active: phase === 'playing' && state.turn !== human }">
        <span class="av"><Avatar :look="opponent.look" :mood="moods[1]" flip talk /></span>
      </div>
      <p class="nm t-black"><span class="dotc" :class="`c${opSide}`" /><span class="hl" :class="{ on: phase === 'playing' && state.turn !== human }" />{{ opponent.name }}</p>
      <p class="t-label tg">{{ opponent.tag }}<template v-if="phase !== 'rps'"> · {{ seatName(opSide) }}</template></p>
      <p v-if="phase !== 'rps' && !deploying" class="t-label cnt">{{ T.left(aliveOf(opSide)) }}</p>
      <div class="status-box">
        <p class="status" :class="{ mine: (myTurn || (deploying && !myDeployed)) && !message, warn: !!message }">{{ status }}</p>
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
        <template v-else-if="deploying && !watching">
          <div class="dep grid grid-cols-2 gap-x-[0.4rem]">
            <Btn size="sm" block :disabled="myDeployed || deployReady" @click="shuffleLayout">{{ T.random }}</Btn>
            <Btn size="sm" block :disabled="myDeployed || deployReady || !hasLast" @click="useLastLayout">{{ T.lastLayout }}</Btn>
          </div>
          <Btn class="mt-[0.9rem]" tone="red" icon="check" block :disabled="myDeployed || deployReady" @click="confirmDeploy">{{ T.startDeploy }}</Btn>
        </template>
        <template v-else-if="!watching">
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
      <p class="final t-slab"><span :class="`c${human}`">{{ aliveOf(human) }}</span> : <span :class="`c${opSide}`">{{ aliveOf(opSide) }}</span></p>
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
  gap: 0.9rem;
  padding: 0.7rem 1rem;
}
.board-wrap {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  container-type: size;
  animation: rise 520ms var(--ease-out) both;
}
/* 棋盤寬高比 = viewBox（130 × 54） */
.board-box {
  /* 下面留三行給「近三步」 */
  width: min(100cqw, (100cqh - 3.6rem) * 130 / 54);
  aspect-ratio: 130 / 54;
}
.side {
  display: flex;
  min-width: 0;
  flex-shrink: 0;
  flex-direction: column;
  align-items: center;
}
.side.left {
  width: 6.4rem;
  justify-content: flex-end;
  padding-bottom: 0.6rem;
}
.side.right {
  width: 10.2rem;
  padding-top: 0.4rem;
}
.who {
  position: relative;
  width: 4.2rem;
  height: 4.2rem;
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
  font-size: 1.05rem;
  line-height: 1.3;
}
.dotc {
  width: 0.7rem;
  height: 0.7rem;
  flex-shrink: 0;
  border: 0.1rem solid var(--color-ink);
  border-radius: 0.15rem;
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
.cnt {
  margin-top: 0.3rem;
  font-size: 0.62rem;
  color: var(--color-ink-2);
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
  font-size: 0.95rem;
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
/* 近三步（棋盤下面）：最新的大字、越舊越淡 */
.log {
  display: flex;
  height: 3.6rem;
  flex-direction: column;
  gap: 0.1rem;
  padding-top: 0.45rem;
  text-align: center;
}
.log li {
  font-size: 0.8rem;
  font-weight: 900;
  line-height: 1.3;
  color: var(--color-ink);
}
.log li.warn {
  color: var(--color-red);
}
.log li.k1 {
  font-size: 0.7rem;
  opacity: 0.65;
}
.log li.k2 {
  font-size: 0.66rem;
  opacity: 0.45;
}
.logline-enter-active {
  transition:
    opacity 320ms,
    transform 320ms var(--ease-out);
}
.logline-enter-from {
  opacity: 0;
  transform: translateY(-0.4rem);
}
.logline-leave-active {
  display: none;
}
.logline-move {
  transition: all 320ms var(--ease-out);
}
.act {
  width: min(9.6rem, 100%);
  margin-top: 0.4rem;
}
.dep :deep(.face),
.end2 :deep(.face) {
  justify-content: center;
  padding: 0 0.2rem;
  font-size: 0.74rem;
  white-space: nowrap;
}
.dep :deep(.lb),
.end2 :deep(.lb) {
  flex: none;
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
</style>
