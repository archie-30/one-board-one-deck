<script setup lang="ts" generic="St">
// 西洋棋、象棋共用的對局畫面：你在左、對手在右，中間一張棋盤。
// 開局猜拳決定誰先走（西洋棋贏的人拿白、象棋贏的人拿紅）；玩家那一方永遠在棋盤下方。
// 操作：點自己的棋子 → 能走的位置出現圓點 → 點那個位置走過去。西洋棋兵到底線時跳出升變選擇。
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'
import { playSound } from '@/core/audio'
import { opponentById, pickOpponents } from '@/core/opponents'
import { stats } from '@/core/settings'
import { PLAYER_LOOK } from '@/data/names'
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
import TurnGlow from '@/ui/TurnGlow.vue'
import type { Adapter, ClassicMove, Seat } from './adapters'
import ClassicBoard from './ClassicBoard.vue'

const props = defineProps<{ game: GameDef; options: Record<string, string | boolean>; resume?: unknown; adapter: Adapter<St> }>()
const emit = defineEmits<{ exit: []; save: [data: unknown] }>()
const A = props.adapter
const T = A.kind === 'chess' ? S.chess : S.xiangqi
const record = A.kind === 'chess' ? stats.chess : stats.xiangqi

/** 「保存進度並退出」存的資料 */
interface Saved {
  state: St
  human: Seat
  opponent: number
  rng: number
}
const saved = (props.resume ?? null) as Saved | null

const state = shallowRef<St>(saved ? saved.state : A.create())
const human = ref<Seat>(saved ? saved.human : 0)
const opponent = ref(saved ? opponentById(saved.opponent) : pickOpponents(1)[0])
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
const timers = new Set<number>()
const later = (fn: () => void, ms: number) => {
  const id = window.setTimeout(() => {
    timers.delete(id)
    fn()
  }, ms)
  timers.add(id)
}
onBeforeUnmount(() => timers.forEach((t) => window.clearTimeout(t)))

const board = computed(() => A.board(state.value))
const myTurn = computed(() => phase.value === 'playing' && !thinking.value && A.turn(state.value) === human.value)
const targets = computed(() => (selected.value >= 0 && myTurn.value ? A.targets(state.value, selected.value) : []))
const seatName = (seat: Seat) => (A.kind === 'chess' ? (seat === 0 ? S.chess.white : S.chess.black) : seat === 0 ? S.xiangqi.red : S.xiangqi.black)
const winnerSeat = computed(() => A.winner(state.value))
const resultTitle = computed(() => (winnerSeat.value === null ? T.draw : winnerSeat.value === human.value ? T.win : T.lose(opponent.value.name)))
const reason = computed(() => (T.endReason as Record<string, string>)[A.status(state.value)] ?? '')
const checkSq = computed(() => (phase.value === 'rps' ? -1 : A.checkSq(state.value)))
const status = computed(() => {
  if (message.value) return message.value
  if (phase.value === 'over') return resultTitle.value
  if (phase.value === 'rps') return ''
  if (A.turn(state.value) === human.value) return checkSq.value >= 0 ? T.check : T.yourTurn
  return T.cpuTurn(opponent.value.name)
})
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
  phase.value = 'playing'
  if (!playerWins) scheduleCpu()
}

function restart() {
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
  phase.value = 'rps'
}

function commit(m: ClassicMove, who: 0 | 1) {
  const before = A.captured(state.value).length
  const r = A.apply(state.value, m)
  if (!r.ok) {
    message.value = (T.errors as Record<string, string>)[r.reason] ?? ''
    playSound('error')
    return false
  }
  state.value = r.state
  selected.value = -1
  message.value = ''
  const took = A.captured(state.value).length > before
  playSound(took ? 'capture' : 'piece')
  if (took) flash(who, 'happy')
  if (A.over(state.value)) finish()
  else if (A.checkSq(state.value) >= 0) flash(who === 0 ? 1 : 0, 'shock')
  if (!A.over(state.value) && A.turn(state.value) !== human.value) scheduleCpu()
  return true
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
  const st = opponent.value.persona.chess
  later(() => {
    let m: ClassicMove | null
    ;[m, rng] = A.choose(state.value, st, rng)
    thinking.value = false
    moods.value = [moods.value[0], 'idle']
    if (m) commit(m, 1)
  }, 450 + st.depth * 250 + Math.random() * 400)
}

function finish() {
  phase.value = 'over'
  const w = winnerSeat.value
  if (w === null) record.draws++
  else if (w === human.value) record.wins++
  else record.losses++
  moods.value = w === null ? ['shock', 'shock'] : w === human.value ? ['happy', 'sad'] : ['sad', 'happy']
  later(() => {
    playSound(w === human.value ? 'win' : w === null ? 'slide' : 'lose')
    resultOpen.value = true
  }, 900)
}

// ── 你的操作 ──
function pick(i: number) {
  if (!myTurn.value) return
  const p = board.value[i]
  // 點自己的子：選起來（再點一次取消）
  if (p && A.seatOf(p) === human.value) {
    selected.value = selected.value === i ? -1 : i
    message.value = ''
    playSound('cardPick')
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
  commit({ from: selected.value, to: i }, 0)
}
function promote(promo: Promo) {
  const ask = promoAsk.value
  promoAsk.value = null
  if (ask) commit({ ...ask, promo }, 0)
}
function resign() {
  resignOpen.value = false
  if (phase.value !== 'playing') return
  timers.forEach((t) => window.clearTimeout(t))
  timers.clear()
  thinking.value = false
  state.value = A.resign(state.value, human.value)
  finish()
}

// ── 保存進度並退出 ──
const canSave = computed(() => phase.value === 'playing')
function saveAndExit() {
  const data: Saved = { state: state.value, human: human.value, opponent: opponent.value.id, rng }
  emit('save', data)
}
if (saved && A.turn(state.value) !== human.value) scheduleCpu()

const promoChoices: Promo[] = ['Q', 'R', 'B', 'N']
const xqName = (p: string) => S.xiangqi.names[p === p.toUpperCase() ? 'r' : 'b'][p.toUpperCase() as 'K']
const boardAspect = computed(() => (A.kind === 'chess' ? '1 / 1' : '94 / 104'))
</script>

<template>
  <section class="gm">
    <!-- 輪到誰：那個人那一側淡淡亮起 -->
    <TurnGlow side="left" :on="phase === 'playing' && A.turn(state) === human" />
    <TurnGlow side="right" :on="phase === 'playing' && A.turn(state) !== human" />
    <div class="corner"><IconBtn icon="menu" :label="S.common.menu" @click="menuOpen = true" /></div>

    <aside class="side left">
      <div class="taken">
        <svg v-for="(p, k) in takenBy(human)" :key="k" viewBox="0 0 40 40" class="tk pop">
          <PieceIcon v-if="A.kind === 'chess'" :kind="p" :light="p === p.toUpperCase()" />
          <template v-else>
            <circle cx="20" cy="20" r="17" fill="var(--color-card)" stroke="var(--color-ink)" stroke-width="2.4" />
            <text v-if="options.pieceStyle !== 'icon'" x="20" y="27.5" class="tk-t" :fill="p === p.toUpperCase() ? 'var(--color-red)' : 'var(--color-ink)'">{{ xqName(p) }}</text>
            <PieceIcon v-else :kind="p" :color="p === p.toUpperCase() ? 'var(--color-red)' : 'var(--color-ink)'" :size="24" />
          </template>
        </svg>
      </div>
      <div class="who rise" :class="{ active: phase === 'playing' && A.turn(state) === human }">
        <span class="av"><Avatar :look="PLAYER_LOOK" :mood="moods[0]" /></span>
      </div>
      <p class="nm t-black"><span class="hl" :class="{ on: phase === 'playing' && A.turn(state) === human }" />{{ S.common.you }}</p>
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
        @pick="pick"
        @hover="(i) => (hoverAt = i)"
      />
    </div>

    <aside class="side right">
      <div class="who rise" style="--i: 1" :class="{ active: phase === 'playing' && A.turn(state) !== human }">
        <span class="av"><Avatar :look="opponent.look" :mood="moods[1]" flip /></span>
      </div>
      <p class="nm t-black"><span class="hl" :class="{ on: phase === 'playing' && A.turn(state) !== human }" />{{ opponent.name }}</p>
      <p class="t-label tg">{{ opponent.tag }}<template v-if="phase !== 'rps'"> · {{ seatName(human === 0 ? 1 : 0) }}</template></p>
      <div class="taken">
        <svg v-for="(p, k) in takenBy(human === 0 ? 1 : 0)" :key="k" viewBox="0 0 40 40" class="tk pop">
          <PieceIcon v-if="A.kind === 'chess'" :kind="p" :light="p === p.toUpperCase()" />
          <template v-else>
            <circle cx="20" cy="20" r="17" fill="var(--color-card)" stroke="var(--color-ink)" stroke-width="2.4" />
            <text v-if="options.pieceStyle !== 'icon'" x="20" y="27.5" class="tk-t" :fill="p === p.toUpperCase() ? 'var(--color-red)' : 'var(--color-ink)'">{{ xqName(p) }}</text>
            <PieceIcon v-else :kind="p" :color="p === p.toUpperCase() ? 'var(--color-red)' : 'var(--color-ink)'" :size="24" />
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
          <Btn tone="ink" size="lg" icon="again" block @click="restart">{{ S.common.again }}</Btn>
          <Btn class="mt-[0.5rem]" size="sm" icon="book" block @click="resultOpen = true">{{ S.common.showResult }}</Btn>
        </template>
        <Btn v-else size="sm" icon="exit" block :disabled="phase !== 'playing'" @click="resignOpen = true">{{ T.resign }}</Btn>
      </div>
    </aside>

    <RpsDuel :open="phase === 'rps' && !menuOpen" :opponent="opponent" :lead="T.rpsLead" @done="startAfterRps" />
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
        <Btn size="sm" @click="resignOpen = false">{{ S.common.cancel }}</Btn>
        <Btn tone="red" @click="resign">{{ T.resign }}</Btn>
      </template>
    </Dialog>

    <Dialog :open="resultOpen" :title="resultTitle" :label="T.resultLabel" :tone="winnerSeat === human ? 'red' : 'ink'" @close="resultOpen = false">
      <p class="text-[0.95rem]">{{ reason }}</p>
      <p class="t-label pt-[0.4rem] text-ink-2">{{ T.record(record.wins, record.losses, record.draws) }}</p>
      <template #actions>
        <Btn size="sm" icon="exit" @click="emit('exit')">{{ S.common.quit }}</Btn>
        <Btn size="sm" icon="check" @click="resultOpen = false">{{ S.common.viewBoard }}</Btn>
        <Btn tone="red" icon="again" @click="restart">{{ S.common.again }}</Btn>
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
  padding: 0.7rem max(1.2rem, env(safe-area-inset-right)) 0.7rem max(1.2rem, env(safe-area-inset-left));
}
.corner {
  position: absolute;
  left: max(0.9rem, env(safe-area-inset-left));
  top: max(0.7rem, env(safe-area-inset-top));
  z-index: 5;
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
.pc:active {
  transform: translate(0.15rem, 0.15rem);
  box-shadow: none;
}
</style>
