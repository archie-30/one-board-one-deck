<script setup lang="ts">
// 五子棋：你在左、對手在右，中間一張棋盤。棋子從各自的棋罐沿弧線飛到落點，落地時壓扁並泛起墨圈。
import { useGrace } from '@/core/grace'
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { playSound } from '@/core/audio'
import { reducedMotion } from '@/core/motion'
import { opponentById, pickOpponents } from '@/core/opponents'
import { useBoardNet } from '@/core/boardNet'
import UndoAskDialog from '@/ui/UndoAskDialog.vue'
import { recordResult, stats } from '@/core/settings'
import { asLevel, extraThink, gomokuAt } from '@/engine/common/difficulty'
import { myLook } from '@/core/profile'
import { S } from '@/data/strings'
import { seedRng } from '@/engine/common/rng'
import { chooseGomokuMove } from '@/engine/gomoku/ai'
import { winPoints } from '@/engine/gomoku/vcf'
import { canPlace, createGomoku, placeStone, skipTurn, toXY, type GomokuOptions, type GomokuState, type Player } from '@/engine/gomoku/rules'
import type { GameDef } from '@/games/types'
import Avatar from '@/ui/art/Avatar.vue'
import Bowl from '@/ui/art/Bowl.vue'
import type { Mood as KidMood } from '@/ui/art/look'
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
import GomokuBoard from './GomokuBoard.vue'

const props = defineProps<{ game: GameDef; options: Record<string, string | boolean>; resume?: unknown }>()
const emit = defineEmits<{ exit: []; save: [data: unknown] }>()

/** 「保存進度並退出」存的資料 */
interface Saved {
  state: GomokuState
  human: Player
  opponent: number
  rng: number
  undoFrom?: GomokuState | null
  undoUsed?: boolean
}

/** 連線對局：伺服器當裁判（猜拳、落子、悔棋都經過伺服器）；沒有就是一般的單人對電腦 */
const bn = props.resume
  ? null
  : useBoardNet('gomoku', {
      apply: (ev) => void netApply(ev),
      undo: (by) => void netUndo(by),
    })
/** 規則設定：連線時照房主的 */
const rules = bn ? { ...props.options, ...bn.net.opts } : props.options
const options = { ...rules } as unknown as GomokuOptions
/** 規則設定的「倒數計時」 */
const timed = rules.timer !== false
/** 難度：只決定電腦多強 */
const level = asLevel(rules.difficulty)
const T = S.gomoku

const state = ref<GomokuState>(createGomoku(options))
const human = ref<Player>(1)
const opponent = ref(bn ? bn.opponent : pickOpponents(1)[0])
const phase = ref<'rps' | 'playing' | 'over'>('rps')
const preview = ref(-1)
const message = ref('')
const menuOpen = ref(false)
const resultOpen = ref(false)
const flying = ref(false)
const moods = ref<[KidMood, KidMood]>(['idle', 'idle'])
let rng = seedRng(Date.now())
/** 悔棋：每局一次，退回玩家上一步之前的局面 */
const undoFrom = shallowRef<GomokuState | null>(null)
const undoUsed = ref(false)
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

const myTurn = computed(() => phase.value === 'playing' && !flying.value && state.value.turn === human.value)
const lastMove = computed(() => state.value.moves[state.value.moves.length - 1] ?? -1)
const resultTitle = computed(() => (state.value.winner === 3 ? T.draw : state.value.winner === human.value ? T.win : T.lose(opponent.value.name)))
const status = computed(() => {
  if (message.value) return message.value
  if (phase.value === 'over') return resultTitle.value
  if (phase.value === 'rps') return ''
  return state.value.turn === human.value ? T.yourTurn : T.cpuTurn(opponent.value.name)
})

// ── 棋子飛行 ──
const sectionEl = ref<HTMLElement>()
const boardEl = ref<HTMLElement>()
const bowlEls = ref<(HTMLElement | null)[]>([null, null])
const flier = ref<HTMLElement>()
const flierBlack = ref(true)

function pointOnScreen(index: number) {
  const rect = boardEl.value!.getBoundingClientRect()
  const [x, y] = toXY(index, state.value.size)
  const total = (state.value.size - 1) * 10 + 14
  return { x: rect.left + (rect.width * (7 + x * 10)) / total, y: rect.top + (rect.height * (7 + y * 10)) / total, d: (rect.width * 8.6) / total }
}

/** 棋子從 who 的棋罐飛到 index，飛完才真的落子；back = 反過來從 index 飛回棋罐（悔棋） */
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
  const lift = Math.min(120, Math.abs(x1 - x0) * 0.35 + 40)
  flierBlack.value = black
  el.style.width = `${to.d}px`
  el.style.height = `${to.d}px`
  el.style.display = 'block'
  flying.value = true
  const frames = [
    { transform: `translate(${x0}px, ${y0}px) translate(-50%, -50%) scale(0.9)` },
    { transform: `translate(${(x0 + x1) / 2}px, ${(y0 + y1) / 2 - lift}px) translate(-50%, -50%) scale(1.45)`, offset: 0.5 },
    { transform: `translate(${x1}px, ${y1}px) translate(-50%, -50%) scale(1)` },
  ]
  const anim = el.animate(back ? frames.reverse().map((f, i) => ({ ...f, offset: i / 2 })) : frames, { duration: back ? 380 : 420, easing: 'cubic-bezier(0.3, 0.6, 0.35, 1)' })
  return anim.finished.then(() => {
    el.style.display = 'none'
    flying.value = false
  })
}

// ── 流程 ──
function startAfterRps(playerWins: boolean) {
  human.value = playerWins ? 1 : 2
  state.value = createGomoku(options)
  preview.value = -1
  message.value = ''
  moods.value = ['idle', 'idle']
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
  opponent.value = pickOpponents(1)[0]
  state.value = createGomoku(options)
  preview.value = -1
  message.value = ''
  moods.value = ['idle', 'idle']
  undoFrom.value = null
  undoUsed.value = false
  phase.value = 'rps'
}

async function commit(index: number, who: 0 | 1) {
  if (who === 0) acted.value = true
  const error = canPlace(state.value, index)
  if (error) {
    message.value = T.errors[error]
    playSound('error')
    return
  }
  preview.value = -1
  message.value = ''
  const before = state.value
  await fly(who, index, state.value.turn === 1)
  const result = placeStone(state.value, index)
  if (!result.ok) return
  if (who === 0) undoFrom.value = before
  state.value = result.state
  playSound('stone')
  if (result.state.winner !== 0) finish()
  else if (result.state.turn !== human.value && !bn) scheduleCpu()
  else moods.value = ['idle', 'idle']
  // 做出「四」（下一手就能連成五）：下的人得意、對方嚇一跳，過一下再回到原本的表情
  if (result.state.winner === 0 && winPoints(result.state.board, result.state.size, result.state.board[index] as Player, options.overlineWins).length) {
    const back = moods.value
    moods.value = who === 1 ? ['shock', 'smug'] : [back[0], 'shock']
    later(() => phase.value === 'playing' && (moods.value = [back[0], state.value.turn !== human.value ? 'think' : 'idle']), 1300)
  }
}

function finish() {
  phase.value = 'over'
  const w = state.value.winner
  if (w === 3) stats.gomoku.draws++
  else if (w === human.value) stats.gomoku.wins++
  else stats.gomoku.losses++
  // 表現：贏得越快越高；輸的話撐越久越高
  const n = state.value.moves.length
  recordResult('gomoku', level, w === 3 ? 'd' : w === human.value ? 'w' : 'l', w === human.value ? 1 - n / 120 : n / 80)
  moods.value = w === 3 ? ['shock', 'shock'] : w === human.value ? ['happy', 'sad'] : ['sad', 'happy']
  later(() => {
    playSound(w === human.value ? 'win' : w === 3 ? 'draw' : 'lose')
    resultOpen.value = true
  }, 1100)
}

function scheduleCpu() {
  moods.value = ['idle', 'think']
  const st = gomokuAt(opponent.value.persona.gomoku, level, opponent.value.id)
  // 挑戰：多想一會兒（要找「連續衝四」）
  const think = 900 + (1 - st.noise) * 700 + extraThink(level) + (level === 'master' ? 500 : 0) + Math.random() * 600
  later(() => {
    let move: number
    ;[move, rng] = chooseGomokuMove(state.value, st, rng)
    if (move >= 0) void commit(move, 1)
  }, think)
}

function pick(index: number) {
  if (!myTurn.value) return
  if (index === preview.value) return confirmMove()
  const error = canPlace(state.value, index)
  if (error) {
    message.value = T.errors[error]
    if (error === 'forbidden') playSound('error')
    return
  }
  message.value = ''
  preview.value = index
  playSound('stonePick')
}

/** 時間到：這一手跳過，換對方 */
function onTimeout() {
  // 連線：時間到由伺服器判
  if (bn) return
  if (!myTurn.value) return
  acted.value = true
  preview.value = -1
  undoFrom.value = state.value
  state.value = skipTurn(state.value)
  message.value = S.common.timedOut
  playSound('error')
  scheduleCpu()
}

// 連線：自己下過（hist 跟著 state 一起變，所以讀一下 state 讓它重新算）
const canUndo = computed(() => (bn ? (void state.value, phase.value === 'playing' && !flying.value && hist.some((h) => h.side === bn.mySide.value)) : phase.value === 'playing' && !flying.value && !!undoFrom.value && !undoUsed.value))
/** 悔棋：電腦還在想就停下來；剛下的棋子一顆顆飛回各自的棋罐（後下的先回去），局面退回玩家上一步之前 */
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
/** 退回到 prev：剛下的棋子一顆顆飛回各自的棋罐（後下的先回去） */
async function revert(prev: GomokuState) {
  preview.value = -1
  message.value = ''
  moods.value = ['idle', 'idle']
  const taken = state.value.moves.slice(prev.moves.length).reverse()
  for (const idx of taken) {
    const color = state.value.board[idx]
    const board = state.value.board.slice()
    board[idx] = 0
    state.value = { ...state.value, board, moves: state.value.moves.filter((m) => m !== idx) }
    playSound('stonePick')
    await fly(color === human.value ? 0 : 1, idx, color === 1, true)
  }
  state.value = prev
}

function confirmMove() {
  if (!myTurn.value || preview.value < 0) return
  if (bn) {
    // 連線：先檢查能不能下，再送給伺服器（等它送回來才真的落子）
    if (canPlace(state.value, preview.value)) return
    acted.value = true
    bn.send({ type: 'place', index: preview.value })
    return
  }
  void commit(preview.value, 0)
}

// ── 連線對局：伺服器送來的每一步 ──
/** 每一步之前的局面與誰下的（悔棋時找「那一方上一手之前」） */
const hist: { state: GomokuState; side: number }[] = []
const sideOfHuman = () => (human.value === 1 ? 0 : 1)
async function netApply(ev: { type: string; player: number; index?: unknown }) {
  hist.push({ state: state.value, side: ev.player })
  const who = ev.player === sideOfHuman() ? 0 : 1
  if (ev.type === 'place') await commit(ev.index as number, who)
  else {
    state.value = skipTurn(state.value)
    if (who === 0) ((message.value = S.common.timedOut), playSound('error'))
  }
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
if (bn) watch(bn.undoRefused, () => (message.value = S.common.undoRefused(opponent.value.name)))

// ── 保存進度並退出／讀回存檔 ──
/** 玩家自己有沒有動過（還沒動過就離開：不必按兩次、也不需要存檔） */
const acted = ref(!!props.resume)
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
if (props.resume) {
  const d = props.resume as Saved
  state.value = d.state
  human.value = d.human
  opponent.value = opponentById(d.opponent)
  rng = d.rng
  undoFrom.value = d.undoFrom ?? null
  undoUsed.value = d.undoUsed ?? false
  phase.value = 'playing'
  if (state.value.turn !== human.value) scheduleCpu()
}
const grace = useGrace(props.options, state, () => state.value.turn === human.value)
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
        <span class="av"><Avatar :look="myLook()" :mood="moods[0]" /></span>
        <span :ref="(el) => (bowlEls[0] = el as HTMLElement | null)" class="bowl"><Bowl :black="human === 1" /></span>
      </div>
      <p class="nm t-black"><span class="hl" :class="{ on: phase === 'playing' && state.turn === human }" />{{ S.common.you }}</p>
      <p v-if="phase !== 'rps'" class="t-label tg">{{ human === 1 ? T.black : T.white }}</p>
    </aside>

    <div ref="boardEl" class="board-wrap">
      <GomokuBoard :board="state.board" :last-move="lastMove" :win-line="state.winLine" :preview="preview" :preview-color="human" :interactive="myTurn" @pick="pick" />
    </div>

    <aside class="side right">
      <div class="who rise" style="--i: 1" :class="{ active: phase === 'playing' && state.turn !== human }">
        <span class="av"><Avatar :look="opponent.look" :mood="moods[1]" flip talk /></span>
        <span :ref="(el) => (bowlEls[1] = el as HTMLElement | null)" class="bowl"><Bowl :black="human === 2" /></span>
      </div>
      <p class="nm t-black"><span class="hl" :class="{ on: phase === 'playing' && state.turn !== human }" />{{ opponent.name }}</p>
      <p class="t-label tg">{{ opponent.tag }}<template v-if="phase !== 'rps'"> · {{ human === 2 ? T.black : T.white }}</template></p>
      <div class="status-box">
        <p class="t-slab moves">{{ phase !== 'rps' ? String(state.moves.length).padStart(3, '0') : '' }}</p>
        <p class="status" :class="{ mine: myTurn && !message, warn: !!message }">{{ status }}</p>
        <p class="hint">{{ myTurn && !message ? T.previewHint : '' }}</p>
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
          <Btn tone="red" size="lg" arrow block :disabled="!myTurn || preview < 0 || !!bn?.sending.value" @click="confirmMove">{{ T.place }}</Btn>
          <UndoBtn class="mt-[0.5rem]" block :disabled="!canUndo" :used="undoUsed" :waiting="!!bn?.undoWaiting.value" @undo="void undo()" />
        </template>
      </div>
    </aside>

    <div ref="flier" class="flier"><svg viewBox="-12 -12 26 26"><Stone :cx="0" :cy="0" :r="10" :black="flierBlack" /></svg></div>

    <RpsDuel :open="phase === 'rps' && (!menuOpen || !!bn)" :opponent="opponent" :seconds="timed ? TURN_SECONDS.rps : 0" :remote="bn?.rps" @pick="(h) => bn?.pickRps(h)" @done="startAfterRps" @back="emit('exit')" />
    <UndoAskDialog v-if="bn" :open="bn.undoAsked.value" :name="opponent.name" @answer="(ok) => bn!.answerUndo(ok)" />
    <GameMenu :open="menuOpen" :game="game" :options="props.options" @close="menuOpen = false" @restart="restart" @exit="emit('exit')" :can-save="canSave" @save-exit="saveAndExit" />
    <Dialog flip :open="resultOpen" :title="resultTitle" :label="T.resultLabel" tone="blue" @close="resultOpen = false">
      <p class="text-[0.95rem]">{{ state.winner === 3 ? T.drawLead : T.winLead(state.moves.length) }}</p>
      <p class="t-label pt-[0.4rem] text-ink-2">{{ T.record(stats.gomoku.wins, stats.gomoku.losses, stats.gomoku.draws) }}</p>
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
  width: 6.4rem;
  height: 5.2rem;
  transition: transform 300ms var(--ease-back);
}
.who.active {
  transform: translateY(-0.3rem);
}
.av {
  position: absolute;
  left: 0;
  top: 0;
  width: 4.2rem;
  height: 4.2rem;
}
.right .av {
  left: auto;
  right: 0;
}
.bowl {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 2.8rem;
  height: 2.8rem;
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
