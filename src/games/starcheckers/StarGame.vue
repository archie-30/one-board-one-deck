<script setup lang="ts">
// 星形跳棋對局（3 人）：你在下面，左上、右上各一位對手（照順時針輪流）。中間一張六角星棋盤。
// 操作（預設一步一步跳）：點自己的彈珠 → 旁邊的空格和「跳一次」能到的地方出現圓點 → 點那裡跳過去 →
//   跳完再顯示下一跳能到哪 → 右下角按「結束」才算走完；結束前可以按「取消移動」，彈珠沿原路跳回去，可以換一顆走（照樣在計時）。
//   規則設定「一次顯示所有落點」打開時：點彈珠就看到連跳能到的所有地方，點哪裡就一口氣跳過去。
//   也可以按住自己的彈珠拖到能去的地方放開。
// 玩到分出名次：有人到齊就標名次，剩下的人繼續下，直到第二個人也到齊。
// 悔棋每局一次：彈珠沿原路跳回去，別人接著走的也一起退；連線時要另外兩個人都同意（電腦直接同意）。
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'
import { playSound } from '@/core/audio'
import { useGrace } from '@/core/grace'
import { joinLiveMatch, matchPlayers, sendAct, watchSeats } from '@/core/onlineMatch'
import { opponentById, pickOpponents, type Opponent } from '@/core/opponents'
import { myLook } from '@/core/profile'
import { recordResult, stats } from '@/core/settings'
import { S } from '@/data/strings'
import { TURN_SECONDS } from '@/data/timer'
import { asLevel, extraThink, starAt } from '@/engine/common/difficulty'
import { nextInt, seedRng, type RngState } from '@/engine/common/rng'
import { chooseStarMove } from '@/engine/starcheckers/ai'
import { applyStar, createStar, movesFrom, nextHops, remaining, type StarState } from '@/engine/starcheckers/rules'
import type { GameDef } from '@/games/types'
import Avatar from '@/ui/art/Avatar.vue'
import type { Mood } from '@/ui/art/look'
import Btn from '@/ui/Btn.vue'
import Dialog from '@/ui/Dialog.vue'
import GameMenu from '@/ui/GameMenu.vue'
import IconBtn from '@/ui/IconBtn.vue'
import RematchBtn from '@/ui/RematchBtn.vue'
import TurnGlow from '@/ui/TurnGlow.vue'
import TurnTimer from '@/ui/TurnTimer.vue'
import UndoBtn from '@/ui/UndoBtn.vue'
import StarBoard from './StarBoard.vue'

const props = defineProps<{ game: GameDef; options: Record<string, string | boolean>; resume?: unknown }>()
const emit = defineEmits<{ exit: []; save: [data: unknown] }>()
const T = S.starcheckers
const record = stats.starcheckers

interface Saved {
  state: StarState
  opponents: number[]
  rng: number
  undoUsed?: boolean
}
const saved = (props.resume ?? null) as Saved | null
/** 連線對局：伺服器當裁判；沒有就是一般的單人對電腦 */
const net = saved ? null : joinLiveMatch('starcheckers')
const watching = !!net && net.seat < 0
/** 自己是幾號座位（棋盤轉到自己在下面；觀戰時從 0 號看） */
const me = net ? Math.max(0, net.seat) : 0
const rules = net ? { ...props.options, ...net.opts } : props.options
const timed = rules.timer !== false
const level = asLevel(rules.difficulty)
const opts = { longJump: rules.longJump !== false }

let rng: RngState = saved ? saved.rng : seedRng(Date.now())
/** 單人：誰先走隨機 */
function firstSeat() {
  let k: number
  ;[k, rng] = nextInt(rng, 3)
  return k
}
const state = shallowRef<StarState>(net ? (net.start as StarState) : saved ? saved.state : createStar(opts, firstSeat()))
/** 每個座位（自己的視角：0 自己、1 左上、2 右上）是誰 */
const players = ref<Opponent[]>(net ? matchPlayers(net) : [])
const cpu = ref<Opponent[]>(net ? [] : saved ? saved.opponents.map(opponentById) : pickOpponents(2))
if (net) watchSeats(net, (ps) => (players.value = ps))
/** 伺服器座位 → 自己的視角 */
const local = (seat: number) => (seat - me + 3) % 3
const nameOf = (seat: number) => (local(seat) === 0 && !watching ? S.common.you : net ? players.value[local(seat)].name : cpu.value[local(seat) - 1].name)
const lookOf = (seat: number) => (local(seat) === 0 && !watching ? myLook() : net ? players.value[local(seat)].look : cpu.value[local(seat) - 1].look)
const tagOf = (seat: number) => (net ? players.value[local(seat)].tag : local(seat) === 0 ? '' : cpu.value[local(seat) - 1].tag)
const seatAt = (l: number) => (me + l) % 3
const grace = useGrace(props.options, state, () => state.value.turn === me)

const phase = ref<'playing' | 'over'>(saved?.state.over ? 'over' : 'playing')
const selected = ref(-1)
const message = ref('')
const menuOpen = ref(false)
const resultOpen = ref(false)
const resignOpen = ref(false)
const thinking = ref(false)
const rewinding = ref(false)
const moods = ref<Mood[]>(['idle', 'idle', 'idle'])
const undoUsed = ref(saved?.undoUsed ?? false)
const last = shallowRef<number[] | null>(null)
/** 規則設定「一次顯示所有落點」（只影響自己的畫面，可以當場改） */
const allAtOnce = computed(() => props.options.allAtOnce === true)
/** 一步一步跳：正在走的那顆的路線（還沒按「結束」） */
const moving = ref<number[] | null>(null)
/** 要播的跳的動畫（電腦、別人走的慢一點） */
const anim = ref<{ key: number; path: number[]; slow?: boolean } | null>(null)
const hopMs = (slow: boolean) => (slow ? 360 : 170)
function play(path: number[], slow: boolean) {
  anim.value = { key: (anim.value?.key ?? 0) + 1, path, slow }
}
/** 畫面上的棋盤：一步一步跳時，走到一半的那顆畫在現在的位置 */
const shown = computed(() => {
  const p = moving.value
  if (!p || p.length < 2) return state.value.board
  const b = state.value.board.slice()
  b[p[p.length - 1]] = b[p[0]]
  b[p[0]] = 0
  return b
})
/** 連線悔棋：在等別人同意、別人在問你、用過了 */
const undoWaiting = ref(false)
const undoAsked = ref(false)
const rewind = ref<{ key: number; paths: number[][] } | null>(null)
/** 每一步之前的局面、誰走的、走了哪裡（悔棋倒帶用） */
const hist: { state: StarState; seat: number; path: number[] | null }[] = []
const timers = new Set<number>()
const later = (fn: () => void, ms: number) => {
  const id = window.setTimeout(() => {
    timers.delete(id)
    if (menuOpen.value && !net) later(fn, 250)
    else fn()
  }, ms)
  timers.add(id)
}
onBeforeUnmount(() => {
  timers.forEach((t) => window.clearTimeout(t))
  if (net) net.onEvent = net.onReject = null
})

const myTurn = computed(() => !watching && phase.value === 'playing' && !thinking.value && !rewinding.value && !sending.value && state.value.turn === me && !state.value.over)
const targets = computed(() => {
  if (!myTurn.value) return []
  if (moving.value) return nextHops(state.value, moving.value)
  if (selected.value < 0) return []
  return allAtOnce.value ? movesFrom(state.value, selected.value).map((m) => m.path[m.path.length - 1]) : nextHops(state.value, [selected.value])
})
/** 能拖的彈珠：還沒動時是自己的每一顆；走到一半時只有那一顆 */
const canDrag = (i: number) => myTurn.value && (moving.value ? i === moving.value[moving.value.length - 1] : state.value.board[i] === me + 1)
const placeOf = (seat: number) => (state.value.out.includes(seat) ? state.value.out.indexOf(seat) + 1 : 0)
const side = (seat: number) => (['bottom', 'left', 'right'] as const)[local(seat)]
const status = computed(() => {
  const t = statusText()
  return watching ? S.online.watchingNow + (t ? '・' + t : '') : t
})
function statusText() {
  if (message.value) return message.value
  if (phase.value === 'over') return resultTitle.value
  if (state.value.turn === me && !watching) return T.yourTurn
  return T.cpuTurn(nameOf(state.value.turn))
}
const resultTitle = computed(() => {
  const first = state.value.out[0]
  if (watching) return T.watchFirst(nameOf(first))
  return first === me ? T.win : T.place(placeOf(me) || 3)
})

function flash(seat: number, mood: Mood, ms = 1200) {
  const l = local(seat)
  moods.value[l] = mood
  later(() => {
    if (moods.value[l] === mood && phase.value === 'playing') moods.value[l] = 'idle'
  }, ms)
}

// ── 流程 ──
/** 走一步（seat：伺服器座位） */
function commit(path: number[], seat: number, animate = true): boolean {
  const before = state.value
  const r = applyStar(before, { type: 'move', path })
  if (!r.ok) {
    message.value = T.errors[r.reason] ?? ''
    playSound('error')
    return false
  }
  hist.push({ state: before, seat, path })
  if (seat === me) acted.value = true
  last.value = path
  state.value = r.state
  selected.value = -1
  message.value = ''
  // 自己一步一步跳過來的已經播過了；別人走的跳慢一點，看得清楚怎麼跳
  if (animate) play(path, seat !== me)
  playSound(path.length > 2 ? 'stonePick' : 'stone')
  afterMove(before)
  return true
}
/** 有人到齊、結束 */
function afterMove(before: StarState) {
  const s = state.value
  for (const seat of s.out.slice(before.out.length)) {
    if (s.over && !s.out.slice(0, 2).includes(seat)) continue
    flash(seat, 'happy', 1800)
    message.value = seat === me && !watching ? T.youArrived(s.out.indexOf(seat) + 1) : T.arrived(nameOf(seat), s.out.indexOf(seat) + 1)
  }
  if (s.over) return finish()
  if (!net) later(nextTurn, 500 + ((last.value?.length ?? 2) - 1) * hopMs(s.turn === me))
}
function nextTurn() {
  const s = state.value
  if (s.over || phase.value !== 'playing') return
  if (s.turn === me) return
  thinking.value = true
  const l = local(s.turn)
  moods.value[l] = 'think'
  const opp = cpu.value[l - 1]
  const st = starAt(opp.persona.chess, level)
  // 你到齊之後：電腦下快一點
  const fast = s.out.includes(me) ? 0.45 : 1
  later(
    () => {
      thinking.value = false
      if (moods.value[l] === 'think') moods.value[l] = 'idle'
      const seat = state.value.turn
      let m
      ;[m, rng] = chooseStarMove(state.value, st, rng)
      if (m) commit(m.path, seat)
      else timeoutTurn()
    },
    (1300 + extraThink(level) * 0.6 + Math.random() * 600) * fast,
  )
}
/** 這一步跳過（時間到；電腦沒步可走） */
function timeoutTurn() {
  const before = state.value
  const r = applyStar(before, { type: 'timeout' })
  if (!r.ok) return
  hist.push({ state: before, seat: before.turn, path: null })
  state.value = r.state
  afterMove(before)
}
function onTimeout() {
  if (net || !myTurn.value) return
  // 走到一半時間到：那顆放回原位
  moving.value = null
  acted.value = true
  selected.value = -1
  playSound('error')
  timeoutTurn()
  if (!state.value.over) message.value = S.common.timedOut
}
function finish() {
  if (phase.value === 'over') return
  phase.value = 'over'
  const s = state.value
  const place = s.out.indexOf(me) + 1
  if (!watching) {
    record.games++
    if (place === 1) record.firsts++
    // 表現：第一名看贏多少（第二名還差多遠）；沒拿第一看自己走了多遠
    const left = remaining(s.board, me)
    recordResult('starcheckers', level, place === 1 ? 'w' : 'l', place === 1 ? Math.min(1, (remaining(s.board, s.out[1]) - 20) / 60) : Math.max(0, 1 - (left - 20) / 120) * (place === 2 ? 1 : 0.6))
  }
  s.out.forEach((seat, k) => (moods.value[local(seat)] = k === 0 ? 'happy' : k === 2 ? 'sad' : 'idle'))
  later(() => {
    playSound(place === 1 && !watching ? 'win' : place === 2 ? 'draw' : 'lose')
    resultOpen.value = true
  }, 900)
}
function restart() {
  if (net) return
  timers.forEach((t) => window.clearTimeout(t))
  timers.clear()
  menuOpen.value = false
  resultOpen.value = false
  resignOpen.value = false
  cpu.value = pickOpponents(2)
  state.value = createStar(opts, firstSeat())
  hist.length = 0
  last.value = null
  moving.value = null
  selected.value = -1
  thinking.value = false
  moods.value = ['idle', 'idle', 'idle']
  undoUsed.value = false
  acted.value = false
  phase.value = 'playing'
  message.value = state.value.turn === me ? '' : T.cpuTurn(nameOf(state.value.turn))
  nextTurn()
}

// ── 你的操作 ──
function pick(i: number) {
  if (!myTurn.value) return
  // 走到一半：只能接著跳（或按結束、取消移動）
  if (moving.value) {
    if (targets.value.includes(i)) hop(i)
    return
  }
  if (state.value.board[i] === me + 1) {
    if (selected.value !== i) playSound('piecePick')
    selected.value = i
    message.value = ''
    return
  }
  if (selected.value < 0) return
  if (!targets.value.includes(i)) {
    selected.value = -1
    return
  }
  if (allAtOnce.value) {
    // 好幾條路到同一格：選最短的（動畫比較乾脆）
    const m = movesFrom(state.value, selected.value)
      .filter((x) => x.path[x.path.length - 1] === i)
      .sort((a, b) => a.path.length - b.path.length)[0]
    return mine(m.path)
  }
  moving.value = [selected.value]
  hop(i)
}
/** 一步一步跳：跳到下一格 */
function hop(i: number) {
  const p = moving.value!
  const prev = p[p.length - 1]
  moving.value = [...p, i]
  selected.value = i
  play([prev, i], false)
  playSound(p.length > 1 || nextHops(state.value, [p[0]]).includes(i) ? 'stonePick' : 'stone')
}
/** 拖到哪一格放開：能去就走過去 */
function drop(from: number, to: number) {
  if (!myTurn.value) return
  if (moving.value ? from !== moving.value[moving.value.length - 1] : state.value.board[from] !== me + 1) return
  if (!moving.value) selected.value = from
  if (targets.value.includes(to)) pick(to)
}
/** 按「結束」：這一步走完 */
function endMove() {
  const p = moving.value
  if (!p || p.length < 2 || !myTurn.value) return
  if (!net) {
    moving.value = null
    commit(p, me, false)
    return
  }
  mine(p)
}
/** 按「取消移動」：彈珠沿原路跳回去，可以換一顆走 */
function cancelMove() {
  const p = moving.value
  if (!p) return
  moving.value = null
  selected.value = -1
  if (p.length > 1) play(p.slice().reverse(), false)
  playSound('piecePick')
}
/** 自己送出去、還沒等到伺服器送回來的路線（一步一步跳的已經播過動畫，送回來時不再播） */
let sentPath: number[] | null = null
function mine(path: number[]) {
  if (!net) return void commit(path, me)
  if (sending.value || !applyStar(state.value, { type: 'move', path }).ok) return
  acted.value = true
  selected.value = -1
  sending.value = true
  sentPath = moving.value ? path : null
  sendAct({ type: 'move', path, player: me })
}

// ── 悔棋 ──
const canUndo = computed(() => {
  void state.value
  return !watching && phase.value === 'playing' && !rewinding.value && !moving.value && !undoUsed.value && !undoWaiting.value && hist.some((h) => h.seat === me && h.path)
})
function undo() {
  if (!canUndo.value) return
  // 連線：送出申請，等另外兩個人同意
  if (net) return void sendAct({ type: 'undo' })
  timers.forEach((t) => window.clearTimeout(t))
  timers.clear()
  thinking.value = false
  undoUsed.value = true
  revertSeat(me)
}
/** 退回到 seat 上一手之前（中間別人走的一起退；彈珠沿原路跳回去） */
function revertSeat(seat: number) {
  const k = hist.map((h) => h.seat).lastIndexOf(seat)
  if (k < 0) return
  moving.value = null
  const target = hist[k].state
  const paths = hist
    .splice(k)
    .map((h) => h.path)
    .filter((p): p is number[] => !!p)
    .reverse()
  state.value = target
  rewind.value = { key: (rewind.value?.key ?? 0) + 1, paths }
  last.value = null
  selected.value = -1
  message.value = ''
  moods.value = ['idle', 'idle', 'idle']
  playSound('piecePick')
  rewinding.value = true
  window.setTimeout(() => (rewinding.value = false), 260 + Math.max(0, ...paths.map((p) => p.length)) * 150)
}
function answerUndo(ok: boolean) {
  undoAsked.value = false
  sendAct({ type: 'undoReply', ok })
}

function resign() {
  resignOpen.value = false
  if (phase.value !== 'playing') return
  if (net) return void sendAct({ type: 'resign', player: me })
  timers.forEach((t) => window.clearTimeout(t))
  timers.clear()
  thinking.value = false
  const r = applyStar(state.value, { type: 'resign', seat: me })
  if (!r.ok) return
  // 單人：你認輸了就直接結算（兩個電腦照還差多遠排名次，你最後）
  const s = r.state
  if (!s.over) {
    const rest = [0, 1, 2].filter((p) => !s.out.includes(p) && !s.gaveUp.includes(p)).sort((a, b) => remaining(s.board, a) - remaining(s.board, b))
    state.value = { ...s, over: true, out: [...s.out, ...rest, ...s.gaveUp.slice().reverse()] }
  } else state.value = s
  finish()
}

// ── 連線對局：伺服器送來的每一步照順序套用（播完動畫再拿下一個） ──
const sending = ref(false)
let waiting = false
if (net) {
  net.onEvent = () => {
    if (!waiting) return
    waiting = false
    pump()
  }
  net.onReject = () => {
    sending.value = false
    sentPath = null
    playSound('error')
  }
}
function pump() {
  const m = net!
  const e = m.queue.shift()
  if (!e) {
    waiting = true
    return
  }
  if (e.end) {
    const fin = e.ev as StarState
    if (!state.value.over) state.value = { ...state.value, ...fin }
    finish()
    return pump()
  }
  const ev = e.ev as { type: string; player: number; path?: number[]; by?: number }
  if (ev.player === me) sending.value = false
  if (ev.type === 'move' && ev.path) {
    // 自己一步一步跳過來的：已經播過了，不再播
    const mineLocal = ev.player === me && !!sentPath && sentPath.join() === ev.path.join()
    sentPath = null
    if (ev.player === me) moving.value = null
    commit(ev.path, ev.player, !mineLocal)
    return void later(pump, mineLocal ? 200 : 300 + (ev.path.length - 1) * hopMs(ev.player !== me))
  }
  // 悔棋：申請、有人同意、有人不同意、悔了
  if (ev.type === 'undoAsk') {
    if (ev.by === me) undoWaiting.value = true
    else if (!watching) undoAsked.value = true
    return pump()
  }
  if (ev.type === 'undoOk') return pump()
  if (ev.type === 'undoNo') {
    undoAsked.value = false
    if (ev.by === me) ((undoWaiting.value = false), (message.value = T.undoNo))
    return pump()
  }
  if (ev.type === 'undo') {
    undoAsked.value = false
    if (ev.by === me) ((undoWaiting.value = false), (undoUsed.value = true))
    revertSeat(ev.by!)
    return void later(pump, 600)
  }
  if (ev.type === 'resign') {
    const r = applyStar(state.value, { type: 'resign', seat: ev.player })
    if (r.ok) {
      const before = state.value
      state.value = r.state
      if (ev.player !== me) flash(ev.player, 'sad')
      afterMove(before)
    }
    return pump()
  }
  // 時間到（走到一半的那顆放回原位）
  if (ev.player === me) ((moving.value = null), (message.value = S.common.timedOut), playSound('error'))
  timeoutTurn()
  pump()
}

// ── 保存進度並退出 ──
const acted = ref(!!saved)
const canSave = computed(() => !net && phase.value === 'playing' && acted.value)
function snapshot(): Saved | null {
  if (!canSave.value) return null
  return { state: state.value, opponents: cpu.value.map((o) => o.id), rng, undoUsed: undoUsed.value }
}
function saveAndExit() {
  const data = snapshot()
  if (data) emit('save', data)
}
defineExpose({ pause: () => phase.value === 'playing' && !resultOpen.value && (menuOpen.value = true), snapshot })

// 開局
if (net) later(pump, 600)
else later(nextTurn, saved ? 500 : 700)
const leftOf = (seat: number) => remaining(state.value.board, seat) - 20
</script>

<template>
  <section class="gm">
    <TurnGlow v-for="l in [0, 1, 2]" :key="`g${l}`" :side="(['bottom', 'left', 'right'] as const)[l]" :on="phase === 'playing' && local(state.turn) === l" />
    <TurnTimer v-if="timed" :side="side(state.turn)" :active="phase === 'playing' && !(grace && state.turn === me)" :paused="!net && menuOpen" :seconds="TURN_SECONDS.board" :turn-key="state" @timeout="onTimeout" />
    <div class="corner"><IconBtn icon="menu" :label="S.common.menu" @click="menuOpen = true" /></div>

    <aside class="side left">
      <!-- 左上那位 -->
      <div class="pl" :class="{ active: phase === 'playing' && state.turn === seatAt(1) }">
        <span class="av rise"><Avatar :look="lookOf(seatAt(1))" :mood="moods[1]" talk /></span>
        <p class="nm t-black"><span class="dotc" :class="`c${seatAt(1)}`" /><span class="hl" :class="{ on: phase === 'playing' && state.turn === seatAt(1) }" />{{ nameOf(seatAt(1)) }}</p>
        <p class="t-label tg">{{ tagOf(seatAt(1)) }}</p>
        <p class="t-label rk">{{ placeOf(seatAt(1)) ? T.rank(placeOf(seatAt(1))) : T.left(leftOf(seatAt(1))) }}</p>
      </div>
      <!-- 自己 -->
      <div class="pl me" :class="{ active: phase === 'playing' && state.turn === me }">
        <span class="av rise"><Avatar :look="lookOf(me)" :mood="moods[0]" /></span>
        <p class="nm t-black"><span class="dotc" :class="`c${me}`" /><span class="hl" :class="{ on: phase === 'playing' && state.turn === me }" />{{ nameOf(me) }}</p>
        <p class="t-label rk">{{ placeOf(me) ? T.rank(placeOf(me)) : T.left(leftOf(me)) }}</p>
      </div>
    </aside>

    <div class="board-wrap">
      <StarBoard :board="shown" :view="me" :selected="selected" :targets="targets" :last="moving ?? last" :anim="anim" :rewind="rewind" :interactive="myTurn" :can-drag="canDrag" @pick="pick" @drop="drop" />
    </div>

    <aside class="side right">
      <div class="pl" :class="{ active: phase === 'playing' && state.turn === seatAt(2) }">
        <span class="av rise" style="--i: 1"><Avatar :look="lookOf(seatAt(2))" :mood="moods[2]" flip talk /></span>
        <p class="nm t-black"><span class="dotc" :class="`c${seatAt(2)}`" /><span class="hl" :class="{ on: phase === 'playing' && state.turn === seatAt(2) }" />{{ nameOf(seatAt(2)) }}</p>
        <p class="t-label tg">{{ tagOf(seatAt(2)) }}</p>
        <p class="t-label rk">{{ placeOf(seatAt(2)) ? T.rank(placeOf(seatAt(2))) : T.left(leftOf(seatAt(2))) }}</p>
      </div>
      <div class="status-box">
        <p class="t-slab moves">{{ String(state.plies).padStart(3, '0') }}</p>
        <p class="status" :class="{ mine: myTurn && !message, warn: !!message }">{{ status }}</p>
        <p class="hint">{{ myTurn && !message ? (moving ? (targets.length ? T.stepHint : T.endHint) : T.pickHint) : '' }}</p>
      </div>
      <div class="act">
        <template v-if="phase === 'over'">
          <Btn v-if="!net" tone="ink" icon="again" block @click="restart">{{ S.common.again }}</Btn>
          <RematchBtn v-else tone="ink" block />
          <div class="end2 mt-[0.5rem] grid grid-cols-2 gap-[0.4rem]">
            <Btn size="sm" block @click="resultOpen = true">{{ S.common.showResult }}</Btn>
            <Btn size="sm" block @click="emit('exit')">{{ net ? S.online.leaveRoom : S.common.quit }}</Btn>
          </div>
        </template>
        <!-- 一步一步跳：走到一半時右下角是「結束」＋「取消移動」 -->
        <template v-else-if="moving && !watching">
          <Btn class="pop" tone="red" size="lg" icon="check" block :disabled="moving.length < 2 || sending" @click="endMove">{{ T.endMove }}</Btn>
          <Btn class="mt-[0.5rem] pop" size="sm" icon="back" block :disabled="sending" @click="cancelMove">{{ T.cancelMove }}</Btn>
        </template>
        <template v-else-if="!watching">
          <UndoBtn block :disabled="!canUndo" :used="undoUsed" :waiting="undoWaiting" :asked="undoAsked" @answer="answerUndo" @undo="undo" />
          <Btn class="mt-[0.5rem]" size="sm" icon="exit" block :disabled="phase !== 'playing' || state.gaveUp.includes(me) || state.out.includes(me)" @click="resignOpen = true">{{ T.resign }}</Btn>
        </template>
      </div>
    </aside>

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
      <ol class="ranks">
        <li v-for="(seat, k) in state.out" :key="seat" class="rise" :class="{ mine: seat === me && !watching }" :style="{ '--i': k + 1 }">
          <b class="t-slab n">{{ k + 1 }}</b>
          <span class="mini"><Avatar :look="lookOf(seat)" :mood="k === 0 ? 'happy' : k === 2 ? 'sad' : 'idle'" /></span>
          <span class="t-black">{{ nameOf(seat) }}</span>
          <span class="t-label gap">{{ state.gaveUp.includes(seat) ? T.resign : k < 2 || leftOf(seat) === 0 ? '' : T.left(leftOf(seat)) }}</span>
        </li>
      </ol>
      <p v-if="!watching" class="t-label pt-[0.4rem] text-ink-2">{{ T.record(record.firsts, record.games) }}</p>
      <template #actions>
        <Btn size="sm" icon="exit" @click="emit('exit')">{{ net ? S.online.leaveRoom : S.common.quit }}</Btn>
        <Btn size="sm" icon="check" @click="resultOpen = false">{{ S.common.viewBoard }}</Btn>
        <Btn v-if="!net" tone="red" icon="again" @click="restart">{{ S.common.again }}</Btn>
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
  gap: 1rem;
  padding: 0.6rem 1.2rem;
}
.board-wrap {
  height: 100%;
  aspect-ratio: 236 / 264;
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
  justify-content: space-between;
  padding: 2.6rem 0 0.6rem;
}
.right {
  padding-top: 0.4rem;
}
.pl {
  display: flex;
  flex-direction: column;
  align-items: center;
  transition: transform 300ms var(--ease-back);
}
.pl.active {
  transform: translateY(-0.25rem);
}
.av {
  width: 3.6rem;
  height: 3.6rem;
}
.me .av {
  width: 4.2rem;
  height: 4.2rem;
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
  margin-top: 0.3rem;
  padding: 0 0.3rem;
  font-size: 1rem;
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
/* 名字前面的小彈珠：自己的顏色 */
.dotc {
  width: 0.7rem;
  height: 0.7rem;
  flex: none;
  border: 0.1rem solid var(--color-ink);
  border-radius: 50%;
}
.c0 {
  background: var(--color-blue);
}
.c1 {
  background: var(--color-red);
}
.c2 {
  background: var(--color-yellow);
}
.tg {
  font-size: 0.5rem;
  color: var(--color-ink-2);
}
.rk {
  margin-top: 0.15rem;
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
.ranks {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.ranks li {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  border-bottom: 0.06rem dashed var(--color-ink-3);
  padding: 0.2rem 0;
}
.ranks li.mine {
  color: var(--color-red);
}
.ranks .n {
  width: 1.4rem;
  font-size: 1.3rem;
}
.mini {
  width: 1.9rem;
  height: 1.9rem;
}
.mini :deep(svg) {
  width: 100%;
  height: 100%;
}
.gap {
  margin-left: auto;
  color: var(--color-ink-2);
}
</style>
