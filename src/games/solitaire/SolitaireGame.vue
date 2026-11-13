<script setup lang="ts">
// 接龍對局：牌桌＋右下的分數、時間、步數，以及提示、復原、自動收牌。
// 規則都在引擎（applySolitaire），這裡只管流程、計時與存紀錄。
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'
import { playSound } from '@/core/audio'
import { stats } from '@/core/settings'
import { S } from '@/data/strings'
import { seedRng } from '@/engine/common/rng'
import type { Card } from '@/engine/bigtwo/cards'
import {
  applySolitaire,
  canAutoFinish,
  cardsAt,
  dealSolitaire,
  finalScore,
  hint,
  nextFinishMove,
  type SolitaireAction,
  type SolitaireState,
  type Target,
} from '@/engine/solitaire/rules'
import type { GameDef } from '@/games/types'
import Btn from '@/ui/Btn.vue'
import Dialog from '@/ui/Dialog.vue'
import GameMenu from '@/ui/GameMenu.vue'
import IconBtn from '@/ui/IconBtn.vue'
import SolitaireTable from './SolitaireTable.vue'

const props = defineProps<{ game: GameDef; options: Record<string, string | boolean> }>()
const emit = defineEmits<{ exit: [] }>()
const T = S.solitaire

const draw = computed(() => (props.options.difficulty === 'hard' ? 3 : 1))
function fresh(): SolitaireState {
  const seed = (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0
  return dealSolitaire(seedRng(seed), draw.value)[0]
}

const state = shallowRef<SolitaireState>(fresh())
const history: SolitaireState[] = []
const canUndo = ref(false)
const dealKey = ref(0)
const menuOpen = ref(false)
const resultOpen = ref(false)
const message = ref('')
const hintCards = ref<Card[]>([])
const hintSpot = ref<Target | 'stock' | null>(null)
const finishing = ref(false)
let counted = false

// ── 計時：第一步才開始算；暫停選單打開時停住 ──
const seconds = ref(0)
let timer = 0
function startClock() {
  if (timer) return
  timer = window.setInterval(() => {
    if (!menuOpen.value && !state.value.won) seconds.value++
  }, 1000)
}
function stopClock() {
  window.clearInterval(timer)
  timer = 0
}
onBeforeUnmount(() => {
  stopClock()
  window.clearTimeout(msgTimer)
  window.clearTimeout(finishTimer)
})
const clock = computed(() => `${Math.floor(seconds.value / 60)}:${String(seconds.value % 60).padStart(2, '0')}`)
const liveScore = computed(() => finalScore(state.value.score, seconds.value, false))

let msgTimer = 0
function say(text: string) {
  message.value = text
  window.clearTimeout(msgTimer)
  msgTimer = window.setTimeout(() => (message.value = ''), 1600)
}
function clearHint() {
  hintCards.value = []
  hintSpot.value = null
}

function act(action: SolitaireAction) {
  if (finishing.value) return
  const r = applySolitaire(state.value, action)
  if (!r.ok) {
    if (r.reason === 'empty') say(T.noMoves)
    else if (r.reason !== 'won') say(T.cantPlace)
    playSound('error')
    return
  }
  clearHint()
  history.push(state.value)
  canUndo.value = true
  state.value = r.state
  startClock()
  if (!counted) {
    counted = true
    stats.solitaire.played++
  }
  if (action.type === 'draw') playSound('deal')
  if (r.state.won) win()
}

function undo() {
  if (!history.length || finishing.value || state.value.won) return
  playSound('tap')
  clearHint()
  state.value = history.pop()!
  canUndo.value = history.length > 0
}

function showHint() {
  const h = hint(state.value)
  playSound('tap')
  if (!h) {
    say(T.noMoves)
    return
  }
  if (h.type === 'draw') {
    hintCards.value = []
    hintSpot.value = 'stock'
  } else {
    hintCards.value = cardsAt(state.value, h.from)
    hintSpot.value = h.to
  }
}

// ── 自動收牌：一張一張飛上去 ──
let finishTimer = 0
function autoFinish() {
  if (!canAutoFinish(state.value) || finishing.value) return
  finishing.value = true
  clearHint()
  const step = () => {
    const m = nextFinishMove(state.value)
    if (!m) {
      finishing.value = false
      return
    }
    const r = applySolitaire(state.value, m)
    if (!r.ok) {
      finishing.value = false
      return
    }
    history.push(state.value)
    state.value = r.state
    if (r.state.won) {
      finishing.value = false
      win()
      return
    }
    finishTimer = window.setTimeout(step, 110)
  }
  step()
}

const total = ref(0)
function win() {
  stopClock()
  total.value = finalScore(state.value.score, seconds.value, true)
  stats.solitaire.wins++
  stats.solitaire.best = Math.max(stats.solitaire.best, total.value)
  if (!stats.solitaire.fastest || seconds.value < stats.solitaire.fastest) stats.solitaire.fastest = seconds.value
  playSound('win')
  window.setTimeout(() => (resultOpen.value = true), 900)
}

function newGame() {
  stopClock()
  window.clearTimeout(finishTimer)
  finishing.value = false
  menuOpen.value = false
  resultOpen.value = false
  clearHint()
  history.length = 0
  canUndo.value = false
  seconds.value = 0
  counted = false
  state.value = fresh()
  dealKey.value++
}

const timePenalty = computed(() => Math.floor(seconds.value / 10) * 2)
const bonus = computed(() => (seconds.value >= 30 ? Math.floor(700000 / seconds.value) : 0))
</script>

<template>
  <section class="game">
    <SolitaireTable :state="state" :deal-key="dealKey" :interactive="!finishing && !state.won" :hint-cards="hintCards" :hint-spot="hintSpot" @action="act" @invalid="playSound('error')">
      <template #default="{ layout: L }">
        <div class="hud" :style="{ left: `${L.hud.x}px`, top: `${L.hud.y}px`, width: `${L.hud.w}px` }">
          <dl class="nums">
            <div><dt class="t-label">{{ T.score }}</dt><dd class="t-slab red">{{ liveScore }}</dd></div>
            <div><dt class="t-label">{{ T.time }}</dt><dd class="t-slab">{{ clock }}</dd></div>
            <div><dt class="t-label">{{ T.moves }}</dt><dd class="t-slab">{{ state.moves }}</dd></div>
          </dl>
          <Btn v-if="canAutoFinish(state) || finishing" class="pop" tone="yellow" size="sm" block :disabled="finishing" @click="autoFinish">{{ T.autoFinish }}</Btn>
          <div v-else class="tools">
            <Btn size="sm" block :disabled="state.won" @click="showHint">{{ T.hint }}</Btn>
            <Btn size="sm" block :disabled="!canUndo || state.won" @click="undo">{{ T.undo }}</Btn>
          </div>
        </div>
      </template>
    </SolitaireTable>

    <p v-if="message" :key="message" class="toast pop">{{ message }}</p>
    <div class="corner"><IconBtn icon="menu" :label="S.common.menu" @click="menuOpen = true" /></div>

    <GameMenu :open="menuOpen" :game="game" :options="props.options" @close="menuOpen = false" @restart="newGame" @exit="emit('exit')" />

    <Dialog :open="resultOpen" :title="T.win" :label="T.resultLabel" tone="red" @close="resultOpen = false">
      <table class="score">
        <tbody>
          <tr class="rise" style="--i: 2"><td>{{ T.rowBase }}</td><td class="t-slab">{{ state.score }}</td></tr>
          <tr class="rise" style="--i: 3"><td>{{ T.rowTime(clock) }}</td><td class="t-slab">−{{ timePenalty }}</td></tr>
          <tr class="rise" style="--i: 4"><td>{{ T.rowBonus }}</td><td class="t-slab">+{{ bonus }}</td></tr>
          <tr class="rise total" style="--i: 5"><td class="t-black">{{ T.rowTotal }}</td><td class="t-slab red">{{ total }}</td></tr>
        </tbody>
      </table>
      <p class="t-label best rise" style="--i: 6">{{ T.best(stats.solitaire.best) }}</p>
      <template #actions>
        <Btn icon="exit" size="sm" @click="emit('exit')">{{ S.common.quit }}</Btn>
        <Btn tone="red" icon="again" @click="newGame">{{ S.common.again }}</Btn>
      </template>
    </Dialog>
  </section>
</template>

<style scoped>
.game {
  position: relative;
  height: 100%;
}
.corner {
  position: absolute;
  left: max(0.9rem, env(safe-area-inset-left));
  top: max(0.7rem, env(safe-area-inset-top));
  z-index: 700;
}
.hud {
  position: absolute;
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}
.nums {
  display: grid;
  gap: 0.15rem;
  border-top: 0.14rem solid var(--color-ink);
  padding-top: 0.3rem;
}
.nums div {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  border-bottom: 0.07rem solid var(--color-ink);
}
.nums dd {
  font-size: 1rem;
  line-height: 1.35;
}
.red {
  color: var(--color-red);
}
.tools {
  display: flex;
  gap: 0.4rem;
}
.tools > * {
  min-width: 0;
  flex: 1;
}
.tools :deep(.btn .face) {
  justify-content: center;
  padding: 0 0.3rem;
}
.toast {
  position: absolute;
  left: 50%;
  bottom: 0.8rem;
  z-index: 800;
  translate: -50% 0;
  border: 0.13rem solid var(--color-ink);
  background: var(--color-card);
  padding: 0.25rem 0.8rem;
  box-shadow: 0.15rem 0.15rem 0 var(--color-ink);
  font-weight: 900;
  color: var(--color-red);
  pointer-events: none;
}
.score {
  width: 100%;
  border-collapse: collapse;
}
.score td {
  padding: 0.25rem 0.2rem;
  border-bottom: 0.07rem solid var(--color-ink);
}
.score td:last-child {
  text-align: right;
  font-size: 1.1rem;
}
.score .total td {
  border-top: 0.14rem solid var(--color-ink);
  border-bottom: 0;
  font-size: 1.2rem;
}
.score .total td:last-child {
  font-size: 1.6rem;
}
.best {
  margin-top: 0.5rem;
  color: var(--color-ink-3);
}
</style>
