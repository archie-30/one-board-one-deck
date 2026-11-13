<script setup lang="ts">
// 圍棋：你在左、對手在右，中間棋盤。先猜拳決定黑白；棋子從棋罐飛到落點，被提掉的子往上飄走。
// 雙方連續虛手後進入數地：電腦標出死棋與地盤，你可以點棋子修正，再確認結果。
import { computed, onBeforeUnmount, ref } from 'vue'
import { playSound } from '@/core/audio'
import { pickOpponents } from '@/core/opponents'
import { stats } from '@/core/settings'
import { PLAYER_LOOK } from '@/data/names'
import { S } from '@/data/strings'
import { seedRng } from '@/engine/common/rng'
import { chooseGoMove } from '@/engine/go/ai'
import { estimateDead } from '@/engine/go/playout'
import { applyGo, createGo, groupAt, other, scoreGo, toXY, tryPlay, type Color, type GoAction, type GoSize, type GoState } from '@/engine/go/rules'
import type { GameDef } from '@/games/types'
import Avatar from '@/ui/art/Avatar.vue'
import Bowl from '@/ui/art/Bowl.vue'
import type { Mood } from '@/ui/art/look'
import Stone from '@/ui/art/Stone.vue'
import Btn from '@/ui/Btn.vue'
import Dialog from '@/ui/Dialog.vue'
import GameMenu from '@/ui/GameMenu.vue'
import IconBtn from '@/ui/IconBtn.vue'
import RpsDuel from '@/ui/RpsDuel.vue'
import GoBoard from './GoBoard.vue'

const props = defineProps<{ game: GameDef; options: Record<string, string | boolean> }>()
const emit = defineEmits<{ exit: [] }>()
const T = S.go
const size = (Number(props.options.size) || 19) as GoSize

const state = ref<GoState>(createGo({ size }))
const human = ref<Color>(1)
const opponent = ref(pickOpponents(1)[0])
const phase = ref<'rps' | 'playing' | 'counting' | 'scoring' | 'over'>('rps')
const preview = ref(-1)
const message = ref('')
const menuOpen = ref(false)
const resultOpen = ref(false)
const resignOpen = ref(false)
const flying = ref(false)
const dead = ref<number[]>([])
const moods = ref<[Mood, Mood]>(['idle', 'idle'])
const captured = ref<{ key: number; color: 1 | 2; points: number[] } | null>(null)
let rng = seedRng(Date.now())
const timers = new Set<number>()
const later = (fn: () => void, ms: number) => {
  const id = window.setTimeout(() => {
    timers.delete(id)
    fn()
  }, ms)
  timers.add(id)
}
onBeforeUnmount(() => timers.forEach((t) => window.clearTimeout(t)))

const ai = computed<Color>(() => other(human.value))
const myTurn = computed(() => phase.value === 'playing' && !flying.value && state.value.turn === human.value)
const score = computed(() => scoreGo(state.value, dead.value))
const resultTitle = computed(() => (score.value.winner === human.value ? T.win : T.lose(opponent.value.name)))
const colorName = (c: Color) => (c === 1 ? T.black : T.white)
const status = computed(() => {
  if (message.value) return message.value
  if (phase.value === 'counting') return T.bothPassed
  if (phase.value === 'scoring' || phase.value === 'over') return resultTitle.value
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
  const [x, y] = toXY(index, size)
  const total = (size - 1) * 10 + 14
  return { x: rect.left + (rect.width * (7 + x * 10)) / total, y: rect.top + (rect.height * (7 + y * 10)) / total, d: (rect.width * 9.1) / total }
}

function fly(who: 0 | 1, index: number, black: boolean): Promise<void> {
  const el = flier.value
  const bowl = bowlEls.value[who]
  const host = sectionEl.value
  if (!el || !bowl || !host || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve()
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
  const anim = el.animate(
    [
      { transform: `translate(${x0}px, ${y0}px) translate(-50%, -50%) scale(1.2)` },
      { transform: `translate(${(x0 + x1) / 2}px, ${(y0 + y1) / 2 - lift}px) translate(-50%, -50%) scale(1.6)`, offset: 0.5 },
      { transform: `translate(${x1}px, ${y1}px) translate(-50%, -50%) scale(1)` },
    ],
    { duration: 400, easing: 'cubic-bezier(0.3, 0.6, 0.35, 1)' },
  )
  return anim.finished.then(() => {
    el.style.display = 'none'
    flying.value = false
  })
}

// ── 流程 ──
function startAfterRps(playerWins: boolean) {
  human.value = playerWins ? 1 : 2
  state.value = createGo({ size })
  phase.value = 'playing'
  if (!playerWins) scheduleCpu()
}

function restart() {
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
  phase.value = 'rps'
}

async function act(action: GoAction, who: 0 | 1) {
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
  const r = applyGo(state.value, action)
  if (!r.ok) return
  state.value = r.state
  preview.value = -1
  if (action.type === 'play') {
    playSound('stone')
    message.value = ''
    if (r.state.lastCaptured.length) {
      captured.value = { key: r.state.moves, color: other(mover), points: r.state.lastCaptured }
      flash(who, 'happy')
      flash(who === 0 ? 1 : 0, r.state.lastCaptured.length >= 3 ? 'shock' : 'sad')
    }
  } else if (action.type === 'pass') {
    playSound('pass')
    message.value = T.passed(who === 0 ? S.common.you : opponent.value.name)
  }
  if (r.state.phase === 'over') return endGame()
  if (r.state.turn === ai.value) scheduleCpu()
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
  const st = opponent.value.persona.go
  later(() => {
    let a: GoAction
    ;[a, rng] = chooseGoMove(state.value, st, rng)
    moods.value = [moods.value[0], 'idle']
    void act(a, 1)
  }, 650 + st.skill * 500 + Math.random() * 500)
}

function endGame() {
  if (state.value.resigned) return finish()
  phase.value = 'counting'
  // 先讓畫面顯示「開始算地」，再做比較花時間的死棋判斷
  later(() => {
    ;[dead.value, rng] = estimateDead(state.value, rng)
    phase.value = 'scoring'
  }, 450)
}

function finish() {
  phase.value = 'over'
  const win = score.value.winner === human.value
  if (win) stats.go.wins++
  else stats.go.losses++
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
    playSound('tap')
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
  playSound('tap')
}

function confirmMove() {
  if (myTurn.value && preview.value >= 0) void act({ type: 'play', index: preview.value }, 0)
}
function pass() {
  if (myTurn.value) void act({ type: 'pass' }, 0)
}
function resign() {
  resignOpen.value = false
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
    <div class="corner"><IconBtn icon="menu" :label="S.common.menu" @click="menuOpen = true" /></div>

    <aside class="side left">
      <div class="who rise" :class="{ active: phase === 'playing' && state.turn === human }">
        <span class="av"><Avatar :look="PLAYER_LOOK" :mood="moods[0]" /></span>
        <span :ref="(el) => (bowlEls[0] = el as HTMLElement | null)" class="bowl"><Bowl :black="human === 1" /></span>
      </div>
      <p class="nm t-black"><span class="hl" :class="{ on: phase === 'playing' && state.turn === human }" />{{ S.common.you }}</p>
      <p v-if="phase !== 'rps'" class="t-label tg">{{ colorName(human) }} · {{ T.captured(state.captures[human]) }}</p>
      <div class="small-acts">
        <Btn size="sm" :disabled="!myTurn" @click="pass">{{ T.pass }}</Btn>
        <Btn size="sm" :disabled="phase !== 'playing'" @click="resignOpen = true">{{ T.resign }}</Btn>
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
        :area="phase === 'scoring' || phase === 'over' ? score.area : null"
        :dead="phase === 'scoring' || phase === 'over' ? dead : []"
        @pick="pick"
      />
    </div>

    <aside class="side right">
      <div class="who rise" style="--i: 1" :class="{ active: phase === 'playing' && state.turn === ai }">
        <span class="av"><Avatar :look="opponent.look" :mood="moods[1]" flip /></span>
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
        <Btn v-if="phase === 'scoring'" tone="red" size="lg" arrow block @click="finish">{{ T.confirm }}</Btn>
        <Btn v-else-if="phase === 'over'" tone="ink" size="lg" icon="again" block @click="restart">{{ S.common.again }}</Btn>
        <Btn v-else tone="red" size="lg" arrow block :disabled="!myTurn || preview < 0" @click="confirmMove">{{ T.place }}</Btn>
      </div>
    </aside>

    <div ref="flier" class="flier"><svg viewBox="-12 -12 26 26"><Stone :cx="0" :cy="0" :r="10" :black="flierBlack" /></svg></div>

    <RpsDuel :open="phase === 'rps' && !menuOpen" :opponent="opponent" @done="startAfterRps" />
    <GameMenu :open="menuOpen" :game="game" :options="props.options" @close="menuOpen = false" @restart="restart" @exit="emit('exit')" />
    <Dialog :open="resignOpen" :title="T.resignAsk" :label="game.name" @close="resignOpen = false">
      <template #actions>
        <Btn tone="red" @click="resign">{{ T.resign }}</Btn>
        <Btn @click="resignOpen = false">{{ S.common.cancel }}</Btn>
      </template>
    </Dialog>
    <Dialog :open="resultOpen" :title="resultTitle" :label="T.resultLabel" :tone="score.winner === human ? 'red' : 'ink'" @close="resultOpen = false">
      <p class="text-[0.95rem]">{{ resultLine }}</p>
      <p class="t-label pt-[0.4rem] text-ink-2">{{ T.record(stats.go.wins, stats.go.losses) }}</p>
      <template #actions>
        <Btn tone="red" icon="again" @click="restart">{{ S.common.again }}</Btn>
        <Btn icon="exit" @click="emit('exit')">{{ S.common.quit }}</Btn>
      </template>
    </Dialog>
  </section>
</template>

<style scoped>
.gm {
  position: relative;
  display: flex;
  height: 100%;
  align-items: stretch;
  gap: 1.2rem;
  padding: 0.6rem max(1.2rem, env(safe-area-inset-right)) 0.6rem max(1.2rem, env(safe-area-inset-left));
}
.corner {
  position: absolute;
  left: max(0.9rem, env(safe-area-inset-left));
  top: max(0.7rem, env(safe-area-inset-top));
  z-index: 5;
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
  inset: auto 0.25rem -0.12rem;
  height: 0.16rem;
  border-radius: 999px;
  background: var(--color-red);
  opacity: 0;
  transform: scaleX(0);
  transform-origin: left;
  transition:
    transform 300ms var(--ease-out),
    opacity 150ms ease;
}
.hl.on {
  opacity: 1;
  transform: none;
}
.tg {
  font-size: 0.5rem;
  color: var(--color-ink-2);
  text-align: center;
}
.small-acts {
  display: flex;
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
