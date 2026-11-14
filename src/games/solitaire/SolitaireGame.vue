<script setup lang="ts">
// 接龍對局：牌桌＋右下的選單、分數、時間、步數，以及提示（扣分）、復原（扣分）、自動收牌、卡關時的選項。
// 規則都在引擎（applySolitaire），這裡只管流程、計時與存紀錄。
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'
import { playSound } from '@/core/audio'
import { stats } from '@/core/settings'
import { S } from '@/data/strings'
import { seedRng } from '@/engine/common/rng'
import type { Card } from '@/engine/bigtwo/cards'
import {
  applySolitaire,
  cardsAt,
  chargeHint,
  finishPlan,
  hint,
  HINT_PENALTY,
  isStuck,
  dealSolitaire,
  finalScore,
  scoreOf,
  undoTo,
  UNDO_PENALTY,
  type SolitaireAction,
  type SolitaireState,
  type Target,
} from '@/engine/solitaire/rules'
import type { GameDef } from '@/games/types'
import Btn from '@/ui/Btn.vue'
import Dialog from '@/ui/Dialog.vue'
import CursorGlow from '@/ui/CursorGlow.vue'
import GameMenu from '@/ui/GameMenu.vue'
import IconBtn from '@/ui/IconBtn.vue'
import SolitaireTable from './SolitaireTable.vue'

const props = defineProps<{ game: GameDef; options: Record<string, string | boolean>; resume?: unknown }>()
const emit = defineEmits<{ exit: []; save: [data: unknown] }>()

/** 「保存進度並退出」存的資料（復原紀錄只留最近 40 步） */
interface Saved {
  state: SolitaireState
  history: SolitaireState[]
  seconds: number
  /** 這一局剛發好牌的樣子（「重玩這一局」用） */
  initial?: SolitaireState
}
const saved = (props.resume ?? null) as Saved | null
const T = S.solitaire

const draw = computed(() => (props.options.difficulty === 'hard' ? 3 : 1))
function fresh(): SolitaireState {
  const seed = (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0
  return dealSolitaire(seedRng(seed), draw.value)[0]
}

const finishing = ref(false)
const state = shallowRef<SolitaireState>(saved ? saved.state : fresh())
/** 這一局剛發好牌的樣子 */
let initial: SolitaireState = saved?.initial ?? state.value
const hintCards = ref<Card[]>([])
const hintSpot = ref<Target | 'stock' | null>(null)
const stuckOpen = ref(false)
const ready = ref(false)
/** 確定只靠收牌與翻牌堆就能收完：顯示「自動收牌」 */
const plan = computed(() => (finishing.value ? null : finishPlan(state.value)))
const history: SolitaireState[] = saved ? saved.history.slice() : []
const canUndo = ref(history.length > 0)
const dealKey = ref(0)
const menuOpen = ref(false)
const resultOpen = ref(false)
const message = ref('')
let counted = !!saved

// ── 計時：第一步才開始算；暫停選單打開時停住 ──
const seconds = ref(saved ? saved.seconds : 0)
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
  window.clearTimeout(stuckTimer)
  window.clearTimeout(msgTimer)
  window.clearTimeout(finishTimer)
})
const clock = computed(() => `${Math.floor(seconds.value / 60)}:${String(seconds.value % 60).padStart(2, '0')}`)
const liveScore = computed(() => finalScore(scoreOf(state.value), seconds.value, false))

let msgTimer = 0
function say(text: string) {
  message.value = text
  window.clearTimeout(msgTimer)
  msgTimer = window.setTimeout(() => (message.value = ''), 1600)
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
  history.push(state.value)
  canUndo.value = true
  state.value = r.state
  clearHint()
  startClock()
  if (!counted) {
    counted = true
    stats.solitaire.played++
  }
  if (action.type === 'draw') playSound('flip')
  else if (action.to.pile === 'foundation') playSound('collect')
  if (r.state.won) win()
  else checkStuck()
}

function clearHint() {
  hintCards.value = []
  hintSpot.value = null
}
/** 提示：標出一步可以走的牌，並扣分 */
function showHint() {
  if (finishing.value || state.value.won) return
  const h = hint(state.value)
  if (!h) return checkStuck(true)
  playSound('tap')
  state.value = chargeHint(state.value)
  say(T.hintCost(HINT_PENALTY[state.value.draw]))
  if (h.type === 'draw') {
    hintCards.value = []
    hintSpot.value = 'stock'
  } else {
    hintCards.value = cardsAt(state.value, h.from)
    hintSpot.value = h.to
  }
}

/** 卡關：已經沒有能讓局面前進的步，跳出選項 */
let stuckTimer = 0
function checkStuck(now = false) {
  window.clearTimeout(stuckTimer)
  if (!isStuck(state.value) || plan.value) return
  stuckTimer = window.setTimeout(() => (stuckOpen.value = true), now ? 0 : 700)
}
function stuckUndo() {
  stuckOpen.value = false
  undo()
}
/** 重玩這一局：回到剛發好牌的樣子 */
function replay() {
  restartWith(structuredClone(initial))
}

function undo() {
  if (!history.length || finishing.value || state.value.won) return
  playSound('tap')
  // 復原要扣分（簡單、困難扣的不一樣）
  state.value = undoTo(history.pop()!, state.value)
  canUndo.value = history.length > 0
  clearHint()
  say(T.undoCost(UNDO_PENALTY[state.value.draw]))
}

// ── 自動收牌：照著算好的步驟，一張一張收上去（需要時自動翻牌堆），收完就結算 ──
let finishTimer = 0
function autoFinish() {
  const steps = plan.value
  if (!steps || finishing.value) return
  finishing.value = true
  clearHint()
  let i = 0
  const step = () => {
    const a = steps[i++]
    if (!a) {
      finishing.value = false
      return
    }
    const r = applySolitaire(state.value, a)
    if (!r.ok) {
      finishing.value = false
      return
    }
    history.push(state.value)
    state.value = r.state
    playSound(a.type === 'draw' ? 'flip' : 'collect')
    if (r.state.won) {
      finishing.value = false
      win()
      return
    }
    finishTimer = window.setTimeout(step, a.type === 'draw' ? 70 : 120)
  }
  step()
}

const total = ref(0)
function win() {
  stopClock()
  total.value = finalScore(scoreOf(state.value), seconds.value, true)
  stats.solitaire.wins++
  stats.solitaire.best = Math.max(stats.solitaire.best, total.value)
  if (!stats.solitaire.fastest || seconds.value < stats.solitaire.fastest) stats.solitaire.fastest = seconds.value
  playSound('win')
  window.setTimeout(() => (resultOpen.value = true), 900)
}

function restartWith(next: SolitaireState) {
  stopClock()
  window.clearTimeout(finishTimer)
  window.clearTimeout(stuckTimer)
  finishing.value = false
  menuOpen.value = false
  resultOpen.value = false
  stuckOpen.value = false
  history.length = 0
  canUndo.value = false
  seconds.value = 0
  counted = false
  clearHint()
  ready.value = false
  state.value = next
  initial = next
  dealKey.value++
}
function newGame() {
  restartWith(fresh())
}

// ── 保存進度並退出 ──
const canSave = computed(() => !state.value.won && !finishing.value && state.value.moves > 0)
function saveAndExit() {
  const data: Saved = { state: state.value, history: history.slice(-40), seconds: seconds.value, initial }
  emit('save', data)
}
if (saved && saved.state.moves > 0) startClock()

const timePenalty = computed(() => Math.floor(seconds.value / 10) * 2)
const bonus = computed(() => (seconds.value >= 30 ? Math.floor(700000 / seconds.value) : 0))
</script>

<template>
  <section class="game">
    <SolitaireTable
      :state="state"
      :deal-key="dealKey"
      :interactive="!finishing && !state.won"
      :hint-cards="hintCards"
      :hint-spot="hintSpot"
      @action="act"
      @invalid="playSound('error')"
      @ready="ready = true"
    >
      <template #default="{ layout: L }">
        <div class="hud" :style="{ left: `${L.hud.x}px`, top: `${L.hud.y}px`, width: `${L.hud.w}px` }">
          <div class="head">
            <IconBtn icon="menu" size="2.1rem" :label="S.common.menu" @click="menuOpen = true" />
            <div class="score-box">
              <span class="t-label">{{ T.score }}</span>
              <b class="t-slab red">{{ liveScore }}</b>
            </div>
          </div>
          <dl class="nums">
            <div><dt class="t-label">{{ T.time }}</dt><dd class="t-slab">{{ clock }}</dd></div>
            <div><dt class="t-label">{{ T.moves }}</dt><dd class="t-slab">{{ state.moves }}</dd></div>
          </dl>
          <Btn v-if="plan || finishing" class="pop" tone="yellow" size="sm" block :disabled="finishing || !ready" @click="autoFinish">{{ T.autoFinish }}</Btn>
          <div v-else class="tools">
            <Btn size="sm" block :disabled="!ready || state.won" @click="showHint">{{ T.hintBtn(HINT_PENALTY[state.draw]) }}</Btn>
            <Btn size="sm" block :disabled="!ready || !canUndo || state.won" @click="undo">{{ T.undoBtn(UNDO_PENALTY[state.draw]) }}</Btn>
          </div>
        </div>
      </template>
    </SolitaireTable>

    <p v-if="message" :key="message" class="toast pop">{{ message }}</p>

    <Dialog :open="stuckOpen" :title="T.stuckTitle" :label="game.name" tone="yellow" @close="stuckOpen = false">
      <p class="text-[0.95rem]">{{ T.stuckLead }}</p>
      <template #actions>
        <Btn v-if="canUndo" size="sm" icon="back" @click="stuckUndo">{{ T.undoBtn(UNDO_PENALTY[state.draw]) }}</Btn>
        <Btn size="sm" icon="again" @click="replay">{{ T.replay }}</Btn>
        <Btn tone="red" icon="play" @click="newGame">{{ T.newGame }}</Btn>
      </template>
    </Dialog>

    <CursorGlow />
    <GameMenu :open="menuOpen" :game="game" :options="props.options" @close="menuOpen = false" @restart="newGame" @exit="emit('exit')" :can-save="canSave" @save-exit="saveAndExit" />

    <Dialog :open="resultOpen" :title="T.win" :label="T.resultLabel" tone="red" @close="resultOpen = false">
      <table class="score">
        <tbody>
          <tr class="rise" style="--i: 2"><td>{{ T.rowBase }}</td><td class="t-slab">{{ state.score }}</td></tr>
          <tr v-if="state.penalty" class="rise" style="--i: 2"><td>{{ T.rowPenalty }}</td><td class="t-slab">−{{ state.penalty }}</td></tr>
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
.hud {
  position: absolute;
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}
.head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.score-box {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: baseline;
  justify-content: space-between;
  border-bottom: 0.14rem solid var(--color-ink);
}
.score-box b {
  font-size: 1.35rem;
  line-height: 1.2;
}
.nums {
  display: grid;
  gap: 0.15rem;
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
