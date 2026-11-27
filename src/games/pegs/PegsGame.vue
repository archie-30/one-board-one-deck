<script setup lang="ts">
// 孔明棋（單人）：左邊是你，中間十字形棋盤，右邊剩幾顆、步數、返回上一步。
// 點一顆能跳的子（或按住拖到空孔），再點亮起來的空孔；跳過的子拿掉。剩一顆過關（停在正中間是完美）；沒步可走就結束。
// 返回上一步不限次數（結束了也可以退回去再試）。紀錄：最少剩幾顆。
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { playSound } from '@/core/audio'
import { myLook } from '@/core/profile'
import { recordResult, stats } from '@/core/settings'
import { S } from '@/data/strings'
import { applyPegs, createPegs, isPerfect, jumpsFrom, remaining, type PegsMove, type PegsState } from '@/engine/pegs/rules'
import type { GameDef } from '@/games/types'
import Avatar from '@/ui/art/Avatar.vue'
import type { Mood } from '@/ui/art/look'
import Btn from '@/ui/Btn.vue'
import Dialog from '@/ui/Dialog.vue'
import GameMenu from '@/ui/GameMenu.vue'
import IconBtn from '@/ui/IconBtn.vue'
import PegsBoard, { type PegsFx } from './PegsBoard.vue'

const props = defineProps<{ game: GameDef; options: Record<string, string | boolean>; resume?: unknown }>()
const emit = defineEmits<{ exit: []; save: [data: unknown] }>()
const T = S.pegs
const record = stats.pegs

interface Saved {
  state: PegsState
  hist: PegsState[]
  recorded?: 'w' | 'l' | null
}
const saved = (props.resume ?? null) as Saved | null

const state = shallowRef<PegsState>(saved ? saved.state : createPegs())
/** 走過的每一步之前的局面（返回上一步用，不限次數） */
const hist = ref<PegsState[]>(saved ? saved.hist : [])
const selected = ref(-1)
const message = ref('')
const menuOpen = ref(false)
const resultOpen = ref(false)
const mood = ref<Mood>('idle')
const fx = ref<PegsFx | null>(null)
let fxKey = 0
/** 這一局記過戰績沒（記過「沒過」，之後退回去改成過關，再補記過關） */
const recorded = ref<'w' | 'l' | null>(saved?.recorded ?? null)
const timers = new Set<number>()
const later = (fn: () => void, ms: number) => {
  const id = window.setTimeout(() => {
    timers.delete(id)
    fn()
  }, ms)
  timers.add(id)
}
onBeforeUnmount(() => timers.forEach((t) => window.clearTimeout(t)))

const playing = computed(() => state.value.status === 'playing')
const left = computed(() => remaining(state.value))
const targets = computed(() => (playing.value && selected.value >= 0 ? jumpsFrom(state.value, selected.value) : []))
const resultTitle = computed(() => (state.value.status === 'won' ? (isPerfect(state.value) ? T.perfect : T.won) : T.stuck))
const resultLead = computed(() => (state.value.status === 'won' ? (isPerfect(state.value) ? T.perfectLead : T.wonLead) : T.stuckLead))
const status = computed(() => {
  if (message.value) return message.value
  if (!playing.value) return resultTitle.value
  return selected.value >= 0 ? T.pickTarget : T.pickPeg
})

function restart() {
  timers.forEach((t) => window.clearTimeout(t))
  timers.clear()
  menuOpen.value = false
  resultOpen.value = false
  state.value = createPegs()
  hist.value = []
  selected.value = -1
  message.value = ''
  mood.value = 'idle'
  fx.value = null
  recorded.value = null
  acted.value = false
}

/** 跳一步 */
function jump(m: PegsMove) {
  const r = applyPegs(state.value, m)
  if (!r.ok) {
    message.value = T.errors[r.reason] ?? ''
    playSound('error')
    return
  }
  acted.value = true
  hist.value = [...hist.value, state.value]
  state.value = r.state
  selected.value = -1
  message.value = ''
  const l = r.state.last!
  fx.value = { key: ++fxKey, from: l.from, over: l.over, to: l.to }
  playSound('stone')
  window.setTimeout(() => playSound('capture'), 180)
  if (r.state.status !== 'playing') finish()
}

/** 結束：記戰績（這一局只記一次；退回去改成過關的話補記過關），跳結算 */
function finish() {
  const s = state.value
  const won = s.status === 'won'
  const n = remaining(s)
  if (!record.fewest || n < record.fewest) record.fewest = n
  if (won && isPerfect(s)) record.perfect++
  if (!recorded.value) {
    record.played++
    if (won) record.wins++
    // 表現：剩越少越好（剩一顆＝1）
    recordResult('pegs', 'all', won ? 'w' : 'l', won ? (isPerfect(s) ? 1 : 0.7) : Math.max(0, 1 - (n - 2) / 12))
    recorded.value = won ? 'w' : 'l'
  } else if (won && recorded.value === 'l') {
    record.wins++
    recorded.value = 'w'
  }
  mood.value = won ? 'happy' : 'sad'
  later(() => {
    playSound(won ? 'win' : 'lose')
    resultOpen.value = true
  }, 700)
}

// ── 你的操作 ──
function pick(at: number) {
  if (!playing.value) return
  const s = state.value
  if (s.pegs[at]) {
    if (selected.value === at) {
      selected.value = -1
      return
    }
    if (!jumpsFrom(s, at).length) {
      selected.value = -1
      message.value = T.cantJump
      playSound('error')
      return
    }
    selected.value = at
    message.value = ''
    playSound('stonePick')
    return
  }
  if (selected.value >= 0 && targets.value.includes(at)) jump({ from: selected.value, to: at })
}
const canDrag = (at: number) => playing.value && state.value.pegs[at] && jumpsFrom(state.value, at).length > 0
function grab(at: number) {
  if (!canDrag(at) || selected.value === at) return
  selected.value = at
  message.value = ''
  playSound('stonePick')
}
function drop(from: number, to: number) {
  if (!canDrag(from)) return
  if (jumpsFrom(state.value, from).includes(to)) jump({ from, to })
}

/** 返回上一步（不限次數；結束了也可以退回去） */
function undo() {
  const prev = hist.value[hist.value.length - 1]
  if (!prev) return
  const l = state.value.last
  hist.value = hist.value.slice(0, -1)
  state.value = prev
  selected.value = -1
  message.value = ''
  resultOpen.value = false
  mood.value = 'idle'
  fx.value = l ? { key: ++fxKey, from: l.from, over: l.over, to: l.to, back: true } : null
  playSound('stonePick')
}
watch(menuOpen, (o) => o && (selected.value = -1))

// ── 保存進度並退出 ──
const acted = ref(!!saved)
const canSave = computed(() => playing.value && acted.value)
function snapshot(): Saved | null {
  if (!canSave.value) return null
  return { state: state.value, hist: hist.value, recorded: recorded.value }
}
function saveAndExit() {
  const data = snapshot()
  if (data) emit('save', data)
}
defineExpose({ pause: () => playing.value && !resultOpen.value && (menuOpen.value = true), snapshot })
</script>

<template>
  <section class="gm">
    <div class="corner"><IconBtn icon="menu" :label="S.common.menu" @click="menuOpen = true" /></div>

    <aside class="side left">
      <div class="who rise">
        <span class="av"><Avatar :look="myLook()" :mood="mood" /></span>
      </div>
      <p class="nm t-black">{{ S.common.you }}</p>
    </aside>

    <div class="board-wrap">
      <div class="board-box">
        <PegsBoard :pegs="state.pegs" :interactive="playing" :selected="selected" :targets="targets" :fx="fx" :can-drag="canDrag" @pick="pick" @grab="grab" @drop="drop" />
      </div>
    </div>

    <aside class="side right">
      <p class="t-label cap">{{ T.left }}</p>
      <p class="big t-slab">
        <span :key="left" class="num">{{ left }}</span><span class="unit t-black">{{ T.pegsUnit }}</span>
      </p>
      <p class="t-label mv">{{ T.moves(state.moves) }}</p>
      <p class="t-label best">{{ T.fewest(record.fewest) }}</p>
      <div class="status-box">
        <p class="status" :class="{ mine: playing && !message, warn: !!message }">{{ status }}</p>
      </div>
      <div class="act">
        <template v-if="!playing">
          <Btn tone="ink" icon="again" block @click="restart">{{ S.common.again }}</Btn>
          <div class="end2 mt-[0.8rem] grid grid-cols-2 gap-x-[0.4rem] gap-y-[0.7rem]">
            <Btn size="sm" block @click="resultOpen = true">{{ S.common.showResult }}</Btn>
            <Btn size="sm" block @click="emit('exit')">{{ S.common.quit }}</Btn>
          </div>
        </template>
        <Btn class="mt-[0.8rem]" size="sm" icon="back" block :disabled="!hist.length" @click="undo">{{ T.undo }}</Btn>
      </div>
    </aside>

    <GameMenu :open="menuOpen" :game="game" :options="props.options" :can-save="canSave" @close="menuOpen = false" @restart="restart" @exit="emit('exit')" @save-exit="saveAndExit" />

    <Dialog flip :open="resultOpen" :title="resultTitle" :label="T.resultLabel" tone="blue" @close="resultOpen = false">
      <p class="final t-slab">{{ left }}<span class="t-black"> {{ T.pegsUnit }}</span></p>
      <p class="text-[0.95rem]">{{ T.resultLead(left, state.moves) }}</p>
      <p class="text-[0.9rem] text-ink-2">{{ resultLead }}</p>
      <p class="t-label pt-[0.4rem] text-ink-2">{{ T.record(record.wins, record.perfect) }}</p>
      <template #actions>
        <Btn size="sm" icon="exit" @click="emit('exit')">{{ S.common.quit }}</Btn>
        <Btn size="sm" icon="back" @click="undo">{{ T.undo }}</Btn>
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
  gap: 1.2rem;
  padding: 0.7rem 1.2rem;
}
.board-wrap {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  justify-content: center;
  container-type: size;
  animation: rise 520ms var(--ease-out) both;
}
.board-box {
  width: min(100cqw, 100cqh);
  aspect-ratio: 1;
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
  padding-top: 1.2rem;
}
.who {
  position: relative;
  width: 4.4rem;
  height: 4.4rem;
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
  margin-top: 0.4rem;
  font-size: 1.1rem;
}
.cap {
  font-size: 0.62rem;
  color: var(--color-ink-2);
}
.big {
  display: flex;
  align-items: baseline;
  gap: 0.25rem;
  font-size: 3.2rem;
  line-height: 1.05;
  color: var(--color-red);
}
.num {
  display: inline-block;
  animation: tick 320ms var(--ease-back) both;
}
@keyframes tick {
  from {
    transform: translateY(0.4rem);
    opacity: 0;
  }
}
.unit {
  font-size: 1rem;
  color: var(--color-ink);
}
.mv {
  font-size: 0.68rem;
  color: var(--color-ink-2);
}
.best {
  margin-top: 0.5rem;
  font-size: 0.62rem;
  color: var(--color-ink-3);
}
.final {
  margin-bottom: 0.2rem;
  font-size: 2.4rem;
  line-height: 1.1;
  color: var(--color-red);
}
.final .t-black {
  font-size: 1rem;
  color: var(--color-ink);
}
.status-box {
  margin-top: auto;
  text-align: center;
}
.status {
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
.act {
  width: min(9.6rem, 100%);
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
