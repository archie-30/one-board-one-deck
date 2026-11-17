<script setup lang="ts">
// 暗棋對局：你在左、對手在右，中間 4 × 8 的棋盤。開局猜拳，贏的人先翻棋；第一顆翻出什麼顏色就是哪一方。
// 操作：點蓋著的棋＝翻開；點自己翻開的棋選起來 → 能去的格子出現圓點（能吃的是紅框）→ 點那格走過去。
// 規則設定開「連吃」時，吃完還能再吃會停在那顆棋上，可以繼續吃或按「不吃了」。
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'
import { playSound } from '@/core/audio'
import { useGrace } from '@/core/grace'
import { opponentById, pickOpponents } from '@/core/opponents'
import { useBoardNet } from '@/core/boardNet'
import { myLook } from '@/core/profile'
import { recordResult, stats } from '@/core/settings'
import { S } from '@/data/strings'
import { TURN_SECONDS } from '@/data/timer'
import { chooseBanqiAction } from '@/engine/banqi/ai'
import { ALL_PIECES, applyBanqi, colorOf, dealBanqi, kindOf, targetsFrom, type BanqiAction, type BanqiState, type Color, type Piece, type Seat } from '@/engine/banqi/rules'
import { asCardLevel, banqiAt } from '@/engine/common/difficulty'
import { nextInt, seedRng, type RngState } from '@/engine/common/rng'
import type { GameDef } from '@/games/types'
import Avatar from '@/ui/art/Avatar.vue'
import type { Mood } from '@/ui/art/look'
import Btn from '@/ui/Btn.vue'
import Dialog from '@/ui/Dialog.vue'
import GameMenu from '@/ui/GameMenu.vue'
import IconBtn from '@/ui/IconBtn.vue'
import RpsDuel from '@/ui/RpsDuel.vue'
import TurnGlow from '@/ui/TurnGlow.vue'
import TurnTimer from '@/ui/TurnTimer.vue'
import BanqiBoard from './BanqiBoard.vue'

const props = defineProps<{ game: GameDef; options: Record<string, string | boolean>; resume?: unknown }>()
const emit = defineEmits<{ exit: []; save: [data: unknown] }>()
const T = S.banqi
const record = stats.banqi
/** 連線對局：伺服器當裁判（猜拳、翻棋、走子、認輸都經過伺服器）；沒有就是一般的單人對電腦 */
const bn = props.resume
  ? null
  : useBoardNet('banqi', {
      apply: (ev) => netApply(ev),
      undo: () => bn!.next(),
      resign: (player) => netResign(player),
    })
/** 規則設定：連線時照房主的 */
const opts = bn ? { ...props.options, ...bn.net.opts } : props.options
const timed = opts.timer !== false
const level = asCardLevel(opts.difficulty)
const rules = { rookSlide: opts.rookSlide === true, chain: opts.chain === true }

interface Saved {
  state: BanqiState
  human: Seat
  opponent: number
  rng: number
}
const saved = (props.resume ?? null) as Saved | null

let rng: RngState = saved ? saved.rng : seedRng(Date.now())
function freshDeal(): BanqiState {
  let seed: number
  ;[seed, rng] = nextInt(rng, 2147483646)
  return dealBanqi(seed + 1, rules)
}
const state = shallowRef<BanqiState>(saved ? saved.state : freshDeal())
const human = ref<Seat>(saved ? saved.human : 0)
const grace = useGrace(props.options, state, () => state.value.turn === human.value)
const opponent = ref(bn ? bn.opponent : saved ? opponentById(saved.opponent) : pickOpponents(1)[0])
const phase = ref<'rps' | 'playing' | 'over'>(saved ? 'playing' : 'rps')
const selected = ref(-1)
const message = ref('')
const menuOpen = ref(false)
const resultOpen = ref(false)
const resignOpen = ref(false)
const thinking = ref(false)
const moods = ref<[Mood, Mood]>(['idle', 'idle'])
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

const myTurn = computed(() => phase.value === 'playing' && !thinking.value && state.value.turn === human.value)
const myColor = computed<Color | null>(() => state.value.colors[human.value])
/** 連吃中：只能用那顆棋繼續吃 */
const chaining = computed(() => myTurn.value && state.value.chainAt >= 0)
const activeSel = computed(() => (chaining.value ? state.value.chainAt : selected.value))
const targets = computed(() => {
  if (!myTurn.value || activeSel.value < 0) return []
  const t = targetsFrom(state.value, activeSel.value)
  return chaining.value ? t.filter((i) => !!state.value.board[i]) : t
})
const colorName = (c: Color | null) => (c === 'r' ? T.red : c === 'b' ? T.black : T.unknown)
const winner = computed(() => state.value.winner)
const resultTitle = computed(() => (winner.value === null ? T.draw : winner.value === human.value ? T.win : T.lose(opponent.value.name)))
const status = computed(() => {
  if (message.value) return message.value
  if (phase.value === 'over') return resultTitle.value
  if (phase.value === 'rps') return ''
  if (state.value.turn !== human.value) return T.cpuTurn(opponent.value.name)
  return myColor.value ? T.yourTurn : T.yourFirst
})
const hint = computed(() => (!myTurn.value || message.value ? '' : chaining.value ? T.chainHint : T.pickHint))
/** 被吃掉的棋：左邊放你吃到的（對方顏色），右邊放對方吃到的 */
const takenBy = (seat: Seat) => {
  const c = state.value.colors[seat]
  return c ? state.value.captured.filter((p) => colorOf(p) !== c) : []
}
const nameOf = (p: Piece) => S.xiangqi.names[colorOf(p)][kindOf(p) as 'K']

// ── 流程 ──
function startAfterRps(playerWins: boolean) {
  human.value = playerWins ? 0 : 1
  state.value = bn ? netStart() : freshDeal()
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
  state.value = freshDeal()
  selected.value = -1
  message.value = ''
  thinking.value = false
  moods.value = ['idle', 'idle']
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

/** who：0 = 你、1 = 電腦（畫面上的左右） */
function commit(a: BanqiAction, who: 0 | 1) {
  if (who === 0) acted.value = true
  const before = state.value.captured.length
  const r = applyBanqi(state.value, a)
  if (!r.ok) {
    message.value = T.errors[r.reason] ?? ''
    playSound('error')
    return false
  }
  state.value = r.state
  selected.value = -1
  message.value = ''
  const took = state.value.captured.length > before
  if (a.type === 'flip') playSound('xqPiece')
  else if (a.type === 'move') playSound(took ? 'xqCapture' : 'xqPiece')
  if (took) {
    flash(who, 'happy')
    // 被吃的是大子（帥、仕）：被吃的一方嚇一跳
    const lost = state.value.captured[state.value.captured.length - 1]
    if ('KA'.includes(kindOf(lost))) flash(who === 0 ? 1 : 0, 'shock')
  }
  if (state.value.status !== 'playing') finish()
  else if (state.value.turn !== human.value && !bn) scheduleCpu()
  return true
}

function scheduleCpu() {
  thinking.value = true
  moods.value = [moods.value[0], 'think']
  const st = banqiAt(opponent.value.persona.chess, level)
  later(
    () => {
      let a: BanqiAction | null
      ;[a, rng] = chooseBanqiAction(state.value, st, rng)
      thinking.value = false
      moods.value = [moods.value[0], 'idle']
      if (!a) return
      commit(a, 1)
      // 電腦連吃：接著再想下一口
      if (phase.value === 'playing' && state.value.turn !== human.value && state.value.chainAt >= 0) scheduleCpu()
    },
    // 電腦每一步想一下：低快一點、高慢一點
    700 + (level === 'high' ? 600 : level === 'mid' ? 300 : 0) + Math.random() * 500,
  )
}

/** 時間到：這一步跳過，換對方 */
function onTimeout() {
  // 連線：時間到由伺服器判
  if (bn) return
  if (!myTurn.value) return
  acted.value = true
  selected.value = -1
  const r = applyBanqi(state.value, { type: 'timeout' })
  if (!r.ok) return
  state.value = r.state
  playSound('error')
  if (state.value.status !== 'playing') return finish()
  message.value = S.common.timedOut
  scheduleCpu()
}

function finish(wait = 900) {
  phase.value = 'over'
  const w = winner.value
  if (w === null) record.draws++
  else if (w === human.value) record.wins++
  else record.losses++
  // 表現：吃掉對方幾成的棋（輸的話：差多少）
  const mine = takenBy(human.value).length
  const theirs = takenBy(human.value === 0 ? 1 : 0).length
  recordResult('banqi', level, w === null ? 'd' : w === human.value ? 'w' : 'l', w === human.value ? 0.4 + (mine - theirs) / 26 : mine / 16)
  moods.value = w === null ? ['shock', 'shock'] : w === human.value ? ['happy', 'sad'] : ['sad', 'happy']
  later(() => {
    playSound(w === human.value ? 'win' : w === null ? 'draw' : 'lose')
    resultOpen.value = true
  }, wait)
}

// ── 你的操作 ──
function pick(i: number) {
  if (!myTurn.value) return
  const s = state.value
  const p = s.board[i]
  // 連吃中：只能點能吃的格子
  if (chaining.value) {
    if (targets.value.includes(i)) mine({ type: 'move', from: s.chainAt, to: i })
    return
  }
  // 蓋著的棋：翻開
  if (p && !s.up[i]) {
    mine({ type: 'flip', at: i })
    return
  }
  // 自己翻開的棋：選起來（再點一次取消）
  if (p && myColor.value && colorOf(p) === myColor.value) {
    selected.value = selected.value === i ? -1 : i
    message.value = ''
    playSound('piecePick')
    return
  }
  if (selected.value >= 0 && targets.value.includes(i)) {
    mine({ type: 'move', from: selected.value, to: i })
    return
  }
  selected.value = -1
}
function endChain() {
  if (chaining.value) mine({ type: 'end' })
}
function resign() {
  resignOpen.value = false
  if (phase.value !== 'playing') return
  if (bn) return bn.resign()
  timers.forEach((t) => window.clearTimeout(t))
  timers.clear()
  thinking.value = false
  const r = applyBanqi(state.value, { type: 'resign', seat: human.value })
  if (r.ok) state.value = r.state
  finish(260)
}

/** 自己的一步：連線時送給伺服器（等它送回來才真的走），單人時直接走 */
function mine(a: BanqiAction) {
  if (!bn) return void commit(a, 0)
  // 先在自己這邊檢查（蓋著的棋是什麼不影響能不能這樣走）
  if (!applyBanqi(state.value, a).ok) return
  acted.value = true
  selected.value = -1
  bn.send(a as unknown as Record<string, unknown>)
}

// ── 連線對局 ──
// 蓋著的棋在這裡只是「還沒出現的棋」隨便放（數量跟真的一樣）；翻開時伺服器告訴大家是哪顆，換到那一格再翻。
function netStart(): BanqiState {
  const s0 = bn!.net.start as BanqiState
  // 還沒出現的棋：整副減掉已經翻開的
  const pool = ALL_PIECES.slice()
  s0.board.forEach((p, i) => {
    if (p && s0.up[i]) pool.splice(pool.indexOf(p), 1)
  })
  const board = s0.board.map((p) => (p === '?' ? pool.pop()! : p))
  return { ...s0, board }
}
function netApply(ev: { type: string; player: number; at?: unknown; piece?: unknown; from?: unknown; to?: unknown }) {
  const who = ev.player === human.value ? 0 : 1
  if (ev.type === 'flip') {
    // 翻出來的那顆換到這一格（跟別的蓋著的棋交換，數量不變）
    const at = ev.at as number
    const piece = ev.piece as string
    const board = state.value.board.slice()
    if (board[at] !== piece) {
      const j = board.findIndex((p, i) => p === piece && !state.value.up[i] && i !== at)
      if (j >= 0) board[j] = board[at]
      board[at] = piece
      state.value = { ...state.value, board }
    }
    commit({ type: 'flip', at }, who)
  } else if (ev.type === 'move') commit({ type: 'move', from: ev.from as number, to: ev.to as number }, who)
  else if (ev.type === 'end') commit({ type: 'end' }, who)
  else {
    const r = applyBanqi(state.value, { type: 'timeout' })
    if (r.ok) {
      state.value = r.state
      if (who === 0) ((message.value = S.common.timedOut), playSound('error'))
      if (state.value.status !== 'playing') finish()
    }
  }
  bn!.next()
}
function netResign(player: number) {
  if (phase.value === 'playing') {
    const r = applyBanqi(state.value, { type: 'resign', seat: player as Seat })
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
  return { state: state.value, human: human.value, opponent: opponent.value.id, rng }
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
        <svg v-for="(p, k) in takenBy(human)" :key="k" viewBox="0 0 40 40" class="tk pop">
          <circle cx="20" cy="20" r="17" fill="var(--color-card)" stroke="var(--color-ink)" stroke-width="2.4" />
          <text x="20" y="27.5" class="tk-t" :fill="colorOf(p) === 'r' ? 'var(--color-red)' : 'var(--color-ink)'">{{ nameOf(p) }}</text>
        </svg>
      </div>
      <div class="who rise" :class="{ active: phase === 'playing' && state.turn === human }">
        <span class="av"><Avatar :look="myLook()" :mood="moods[0]" /></span>
      </div>
      <p class="nm t-black"><span class="hl" :class="{ on: phase === 'playing' && state.turn === human }" />{{ S.common.you }}</p>
      <p v-if="phase !== 'rps'" class="t-label tg" :class="myColor ? `c-${myColor}` : ''">{{ colorName(myColor) }}</p>
    </aside>

    <div class="board-wrap">
      <div class="board-box">
        <BanqiBoard :board="state.board" :up="state.up" :selected="activeSel" :targets="targets" :last-move="state.lastMove" :move-key="state.plies * 100 + state.captured.length" :interactive="myTurn" @pick="pick" />
      </div>
    </div>

    <aside class="side right">
      <div class="who rise" style="--i: 1" :class="{ active: phase === 'playing' && state.turn !== human }">
        <span class="av"><Avatar :look="opponent.look" :mood="moods[1]" flip talk /></span>
      </div>
      <p class="nm t-black"><span class="hl" :class="{ on: phase === 'playing' && state.turn !== human }" />{{ opponent.name }}</p>
      <p class="t-label tg">{{ opponent.tag }}<template v-if="phase !== 'rps'"> · {{ colorName(state.colors[human === 0 ? 1 : 0]) }}</template></p>
      <div class="taken">
        <svg v-for="(p, k) in takenBy(human === 0 ? 1 : 0)" :key="k" viewBox="0 0 40 40" class="tk pop">
          <circle cx="20" cy="20" r="17" fill="var(--color-card)" stroke="var(--color-ink)" stroke-width="2.4" />
          <text x="20" y="27.5" class="tk-t" :fill="colorOf(p) === 'r' ? 'var(--color-red)' : 'var(--color-ink)'">{{ nameOf(p) }}</text>
        </svg>
      </div>
      <div class="status-box">
        <p class="t-label quiet">{{ phase === 'playing' && state.quiet >= 30 ? T.quietCount(state.quiet) : '' }}</p>
        <p class="status" :class="{ mine: myTurn && !message, warn: !!message }">{{ status }}</p>
        <p class="hint">{{ hint }}</p>
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
          <Btn v-if="chaining" tone="red" block @click="endChain">{{ T.endChain }}</Btn>
          <Btn :class="{ 'mt-[0.5rem]': chaining }" size="sm" icon="exit" block :disabled="phase !== 'playing'" @click="resignOpen = true">{{ T.resign }}</Btn>
        </template>
      </div>
    </aside>

    <RpsDuel :open="phase === 'rps' && (!menuOpen || !!bn)" :opponent="opponent" :lead="T.rpsLead" :seconds="timed ? TURN_SECONDS.rps : 0" :remote="bn?.rps" @pick="(h) => bn?.pickRps(h)" @done="startAfterRps" @back="emit('exit')" />
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
      <p class="t-label pt-[0.4rem] text-ink-2">{{ T.record(record.wins, record.losses, record.draws) }}</p>
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
  gap: 1.2rem;
  padding: 0.7rem 1.2rem;
}
/* 棋盤 2:1：寬度優先，太高時改用高度算 */
.board-wrap {
  display: flex;
  min-width: 0;
  flex: 3;
  align-items: center;
  justify-content: center;
  container-type: size;
  animation: rise 520ms var(--ease-out) both;
}
.board-box {
  width: min(100cqw, 200cqh);
  aspect-ratio: 2;
}
.side {
  display: flex;
  min-width: 7.5rem;
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
  width: 4.2rem;
  height: 4.2rem;
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
.tg.c-r {
  color: var(--color-red);
}
.taken {
  display: flex;
  max-width: 8rem;
  min-height: 1.3rem;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.05rem;
  margin: 0.4rem 0;
}
.tk {
  width: 1.1rem;
  height: 1.1rem;
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
.quiet {
  min-height: 1em;
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
