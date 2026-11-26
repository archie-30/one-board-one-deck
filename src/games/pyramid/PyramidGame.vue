<script setup lang="ts">
// 金字塔接龍對局：牌桌＋右邊的分數、時間、步數，以及返回（扣 5 分）、卡關時的選項。
// 規則都在引擎（applyPyramid），這裡只管流程、計時與存紀錄。發的牌一定解得開（engine/pyramid/solver.ts）。
import { checkDeadEnd } from '@/core/deadEnd'
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'
import { playSound } from '@/core/audio'
import { bestAt, recordBest, recordResult, stats } from '@/core/settings'
import { S } from '@/data/strings'
import { seedRng } from '@/engine/common/rng'
import { RANK_LABELS, rankOf } from '@/engine/bigtwo/cards'
import { applyPyramid, CARD_SCORE, clearedRows, isStuck, PYRAMID, ROW_SCORE, scoreOf, timeBonus, UNDO_PENALTY, undoTo, type PyramidAction, type PyramidLevel, type PyramidState } from '@/engine/pyramid/rules'
import { dealWinnable } from '@/engine/pyramid/solver'
import type { GameDef } from '@/games/types'
import Btn from '@/ui/Btn.vue'
import Dialog from '@/ui/Dialog.vue'
import CursorGlow from '@/ui/CursorGlow.vue'
import GameMenu from '@/ui/GameMenu.vue'
import IconBtn from '@/ui/IconBtn.vue'
import PyramidTable, { type Invalid } from './PyramidTable.vue'

const props = defineProps<{ game: GameDef; options: Record<string, string | boolean>; resume?: unknown }>()
const emit = defineEmits<{ exit: []; save: [data: unknown] }>()

interface Saved {
  state: PyramidState
  history: PyramidState[]
  seconds: number
}
const saved = (props.resume ?? null) as Saved | null
const T = S.pyramid
const level = computed<PyramidLevel>(() => (props.options.difficulty === 'hard' ? 'hard' : 'easy'))

function fresh(): PyramidState {
  const seed = (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0
  // 洗一副就讓電腦試，解不開就重洗（使用者要的「確定有解」）
  return dealWinnable(seedRng(seed), level.value)[0]
}

const state = shallowRef<PyramidState>(saved ? saved.state : fresh())
const stuck = ref(false)
const ended = ref(false)
const ready = ref(false)
const history: PyramidState[] = saved ? saved.history.slice() : []
const canUndo = ref(history.length > 0)
const dealKey = ref(0)
const menuOpen = ref(false)
const resultOpen = ref(false)
/** 結算視窗關掉後在看牌桌：右邊換成「看結果／再來一局／離開對局」 */
const reviewing = ref(false)
function closeResult() {
  resultOpen.value = false
  reviewing.value = true
}
const message = ref('')
let counted = !!saved

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
})
const clock = computed(() => `${Math.floor(seconds.value / 60)}:${String(seconds.value % 60).padStart(2, '0')}`)

let msgTimer = 0
function say(text: string) {
  message.value = text
  window.clearTimeout(msgTimer)
  msgTimer = window.setTimeout(() => (message.value = ''), 1600)
}

const label = (c: number) => RANK_LABELS[rankOf(c)]
function invalid(why: Invalid) {
  say(why.kind === 'blocked' ? T.blocked : T.notThirteen(label(why.a), label(why.b)))
  playSound('error')
}
function act(action: PyramidAction) {
  const r = applyPyramid(state.value, action)
  if (!r.ok) {
    if (r.reason === 'blocked') say(T.blocked)
    playSound('error')
    return
  }
  const before = clearedRows(state.value)
  history.push(state.value)
  if (history.length > 60) history.shift()
  canUndo.value = true
  state.value = r.state
  startClock()
  if (!counted) {
    counted = true
    stats.pyramid.played++
  }
  if (action.type === 'remove') playSound('collect')
  if (clearedRows(r.state) > before) say(T.rowClear)
  if (r.state.won) win()
  else checkStuck()
}

let stuckTimer = 0
function checkStuck() {
  window.clearTimeout(stuckTimer)
  stuck.value = false
  const s = state.value
  if (s.won) return
  if (isStuck(s)) {
    stuckTimer = window.setTimeout(() => (stuck.value = true), 700)
    return
  }
  // 還有步可走，但電腦算過確定怎麼走都過不了關（背景算，core/deadEnd.ts）
  void checkDeadEnd('pyramid', s).then((dead) => {
    if (dead && state.value === s && !ended.value) stuckTimer = window.setTimeout(() => (stuck.value = true), 500)
  })
}
function onReady() {
  ready.value = true
  checkStuck()
}
function settleStuck() {
  if (!stuck.value || ended.value) return
  ended.value = true
  stuck.value = false
  stopClock()
  recordBest('pyramid', level.value, scoreOf(state.value))
  recordResult('pyramid', level.value, 'l', taken.value / PYRAMID)
  playSound('lose')
  window.setTimeout(() => (resultOpen.value = true), 500)
}

function undo() {
  if (!history.length || state.value.won || ended.value) return
  playSound('tap')
  state.value = undoTo(history.pop()!, state.value)
  canUndo.value = history.length > 0
  say(S.solitaire.undoCost(UNDO_PENALTY))
  checkStuck()
}

function win() {
  stopClock()
  stats.pyramid.wins++
  bonus.value = timeBonus(seconds.value)
  recordBest('pyramid', level.value, total.value)
  // 表現：分數越高越好（拿走的牌越多、扣分越少、越快；約 800 分滿分）
  recordResult('pyramid', level.value, 'w', (total.value - 300) / 500)
  playSound('win')
  window.setTimeout(() => (resultOpen.value = true), 1100)
}

function newGame() {
  stopClock()
  window.clearTimeout(stuckTimer)
  menuOpen.value = false
  resultOpen.value = false
  reviewing.value = false
  stuck.value = false
  ended.value = false
  bonus.value = 0
  history.length = 0
  canUndo.value = false
  seconds.value = 0
  counted = false
  ready.value = false
  state.value = fresh()
  dealKey.value++
}

const canSave = computed(() => !state.value.won && !ended.value && state.value.moves > 0)
function snapshot(): Saved | null {
  if (!canSave.value) return null
  return { state: state.value, history: history.slice(-40), seconds: seconds.value }
}
function saveAndExit() {
  const data = snapshot()
  if (data) emit('save', data)
}
defineExpose({ pause: () => !state.value.won && !ended.value && !resultOpen.value && (menuOpen.value = true), snapshot })
if (saved && saved.state.moves > 0) startClock()

/** 金字塔拿走了幾張、清空幾排 */
const taken = computed(() => state.value.pyramid.filter((c) => c === null).length)
const rows = computed(() => clearedRows(state.value))
/** 快速過關獎勵（過關那一刻算好）與總分 */
const bonus = ref(0)
const total = computed(() => scoreOf(state.value) + bonus.value)
</script>

<template>
  <section class="game">
    <PyramidTable :state="state" :deal-key="dealKey" :interactive="!state.won && !ended" @action="act" @invalid="invalid" @ready="onReady">
      <template #default="{ layout: L }">
        <div class="hud" :style="{ left: `${L.hud.x}px`, top: `${L.hud.y}px`, width: `${L.hud.w}px` }">
          <div class="score-box">
            <span class="t-label">{{ S.solitaire.score }}</span>
            <b class="t-slab red">{{ total }}</b>
          </div>
          <dl class="nums">
            <div><dt class="t-label">{{ S.solitaire.time }}</dt><dd class="t-slab">{{ clock }}</dd></div>
            <div><dt class="t-label">{{ S.solitaire.moves }}</dt><dd class="t-slab">{{ state.moves }}</dd></div>
            <div><dt class="t-label">{{ T.left }}</dt><dd class="t-slab">{{ PYRAMID - taken }}</dd></div>
            <div><dt class="t-label">{{ T.redeal }}</dt><dd class="t-slab">{{ T.redealLeft(state.recyclesLeft) }}</dd></div>
          </dl>
          <Btn v-if="!reviewing" size="sm" block :disabled="!ready || !canUndo || state.won || ended" @click="undo">{{ S.solitaire.undo }}<small class="cost">−{{ UNDO_PENALTY }}</small></Btn>
          <!-- 結算視窗關掉（點背景或「查看棋盤」）之後：看結果、再來一局、離開對局 -->
          <div v-if="reviewing" class="after">
            <Btn class="rise" tone="ink" size="sm" arrow block @click="resultOpen = true">{{ S.common.showResult }}</Btn>
            <Btn class="rise" style="--i: 1" tone="red" size="sm" icon="again" block @click="newGame">{{ S.common.again }}</Btn>
            <Btn class="rise" style="--i: 2" size="sm" icon="exit" block @click="emit('exit')">{{ S.common.quit }}</Btn>
          </div>
          <Transition name="stuck">
            <div v-if="stuck" class="stuck">
              <Btn tone="red" size="sm" block @click="settleStuck">{{ S.solitaire.stuckSettle }}</Btn>
            </div>
          </Transition>
        </div>
      </template>
    </PyramidTable>

    <p v-if="message" :key="message" class="toast pop">{{ message }}</p>
    <div class="corner"><IconBtn icon="menu" :label="S.common.menu" @click="menuOpen = true" /></div>

    <CursorGlow />
    <GameMenu :open="menuOpen" :game="game" :options="props.options" @close="menuOpen = false" @restart="newGame" @exit="emit('exit')" :can-save="canSave" @save-exit="saveAndExit" />

    <Dialog flip :open="resultOpen" :title="ended ? S.solitaire.stuckResult : S.solitaire.win" :label="T.resultLabel" tone="red" @close="closeResult">
      <table class="score">
        <tbody>
          <tr class="rise info" style="--i: 1"><td>{{ S.solitaire.moves }}</td><td class="t-slab">{{ state.moves }}</td></tr>
          <tr class="rise" style="--i: 2"><td>{{ T.rowCards(state.gone.length) }}</td><td class="t-slab">+{{ state.gone.length * CARD_SCORE }}</td></tr>
          <tr class="rise" style="--i: 3"><td>{{ T.rowRows(rows) }}</td><td class="t-slab">+{{ rows * ROW_SCORE }}</td></tr>
          <tr v-if="state.penalty" class="rise" style="--i: 4"><td>{{ S.solitaire.rowPenalty }}</td><td class="t-slab">−{{ state.penalty }}</td></tr>
          <tr v-if="state.won" class="rise" style="--i: 4"><td>{{ S.solitaire.rowBonus(clock) }}</td><td class="t-slab">+{{ bonus }}</td></tr>
          <tr class="rise total" style="--i: 5"><td class="t-black">{{ S.solitaire.rowTotal }}</td><td class="t-slab red">{{ total }}</td></tr>
        </tbody>
      </table>
      <p class="t-label best rise" style="--i: 6">{{ S.solitaire.best(bestAt('pyramid', level)) }}</p>
      <template #actions>
        <Btn icon="exit" size="sm" @click="emit('exit')">{{ S.common.quit }}</Btn>
        <Btn size="sm" icon="check" @click="closeResult">{{ S.common.viewBoard }}</Btn>
        <Btn tone="red" icon="again" @click="newGame">{{ S.common.again }}</Btn>
      </template>
    </Dialog>
  </section>
</template>

<style scoped src="../solitaire/hud.css"></style>
