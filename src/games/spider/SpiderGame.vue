<script setup lang="ts">
// 蜘蛛接龍對局：牌桌＋右邊的分數、時間、步數，以及返回（扣 5 分）、卡關時的選項。
// 規則都在引擎（applySpider），這裡只管流程、計時與存紀錄。
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'
import { playSound } from '@/core/audio'
import { bestAt, recordBest, recordResult, stats } from '@/core/settings'
import { S } from '@/data/strings'
import { seedRng } from '@/engine/common/rng'
import { applySpider, dealSpider, isStuck, RUN_SCORE, scoreOf, START_SCORE, UNDO_PENALTY, undoTo, type SpiderAction, type SpiderState, type SuitCount } from '@/engine/spider/rules'
import type { GameDef } from '@/games/types'
import Btn from '@/ui/Btn.vue'
import Dialog from '@/ui/Dialog.vue'
import CursorGlow from '@/ui/CursorGlow.vue'
import GameMenu from '@/ui/GameMenu.vue'
import IconBtn from '@/ui/IconBtn.vue'
import SpiderTable from './SpiderTable.vue'

const props = defineProps<{ game: GameDef; options: Record<string, string | boolean>; resume?: unknown }>()
const emit = defineEmits<{ exit: []; save: [data: unknown] }>()

interface Saved {
  state: SpiderState
  history: SpiderState[]
  seconds: number
}
const saved = (props.resume ?? null) as Saved | null
const T = S.spider
const level = computed(() => String(props.options.difficulty ?? 'easy'))
const SUITS: Record<string, SuitCount> = { easy: 1, normal: 2, hard: 4 }

function fresh(): SpiderState {
  const seed = (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0
  return dealSpider(seedRng(seed), SUITS[level.value] ?? 1)[0]
}

const state = shallowRef<SpiderState>(saved ? saved.state : fresh())
const stuck = ref(false)
const ended = ref(false)
const ready = ref(false)
const history: SpiderState[] = saved ? saved.history.slice() : []
const canUndo = ref(history.length > 0)
const dealKey = ref(0)
const menuOpen = ref(false)
const resultOpen = ref(false)
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

function act(action: SpiderAction) {
  const r = applySpider(state.value, action)
  if (!r.ok) {
    if (r.reason === 'emptyCol') say(T.emptyCol)
    else if (r.reason !== 'won' && r.reason !== 'empty') say(S.solitaire.cantPlace)
    playSound('error')
    return
  }
  const before = state.value.done.length
  history.push(state.value)
  if (history.length > 60) history.shift()
  canUndo.value = true
  state.value = r.state
  startClock()
  if (!counted) {
    counted = true
    stats.spider.played++
  }
  if (r.state.done.length > before) {
    playSound('collect')
    say(T.runDone)
  }
  if (r.state.won) win()
  else checkStuck()
}

let stuckTimer = 0
function checkStuck() {
  window.clearTimeout(stuckTimer)
  stuck.value = false
  if (!isStuck(state.value)) return
  stuckTimer = window.setTimeout(() => (stuck.value = true), 700)
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
  recordBest('spider', level.value, scoreOf(state.value))
  recordResult('spider', level.value, 'l', state.value.done.length / 8)
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
  stats.spider.wins++
  recordBest('spider', level.value, scoreOf(state.value))
  // 表現：分數越高越好（約 1100 分以上滿分）
  recordResult('spider', level.value, 'w', (scoreOf(state.value) - 700) / 400)
  playSound('win')
  window.setTimeout(() => (resultOpen.value = true), 1100)
}

function newGame() {
  stopClock()
  window.clearTimeout(stuckTimer)
  menuOpen.value = false
  resultOpen.value = false
  stuck.value = false
  ended.value = false
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

/** 結算表：收走幾串、移動扣了多少 */
const runs = computed(() => state.value.done.length * RUN_SCORE)
const moveCost = computed(() => START_SCORE + runs.value - state.value.score)
const deals = computed(() => Math.ceil(state.value.stock.length / 10))
</script>

<template>
  <section class="game">
    <SpiderTable :state="state" :deal-key="dealKey" :interactive="!state.won && !ended" @action="act" @invalid="playSound('error')" @ready="onReady">
      <template #default="{ layout: L }">
        <div class="hud" :style="{ left: `${L.hud.x}px`, top: `${L.hud.y}px`, width: `${L.hud.w}px` }">
          <div class="score-box">
            <span class="t-label">{{ S.solitaire.score }}</span>
            <b class="t-slab red">{{ scoreOf(state) }}</b>
          </div>
          <dl class="nums">
            <div><dt class="t-label">{{ S.solitaire.time }}</dt><dd class="t-slab">{{ clock }}</dd></div>
            <div><dt class="t-label">{{ S.solitaire.moves }}</dt><dd class="t-slab">{{ state.moves }}</dd></div>
            <div><dt class="t-label">{{ T.runs }}</dt><dd class="t-slab">{{ state.done.length }}/8</dd></div>
            <div><dt class="t-label">{{ T.deals }}</dt><dd class="t-slab">{{ deals }}</dd></div>
          </dl>
          <Btn size="sm" block :disabled="!ready || !canUndo || state.won || ended" @click="undo">{{ S.solitaire.undo }}<small class="cost">−{{ UNDO_PENALTY }}</small></Btn>
          <Transition name="stuck">
            <div v-if="stuck" class="stuck">
              <Btn tone="red" size="sm" block @click="settleStuck">{{ S.solitaire.stuckSettle }}</Btn>
            </div>
          </Transition>
        </div>
      </template>
    </SpiderTable>

    <p v-if="message" :key="message" class="toast pop">{{ message }}</p>
    <div class="corner"><IconBtn icon="menu" :label="S.common.menu" @click="menuOpen = true" /></div>

    <CursorGlow />
    <GameMenu :open="menuOpen" :game="game" :options="props.options" @close="menuOpen = false" @restart="newGame" @exit="emit('exit')" :can-save="canSave" @save-exit="saveAndExit" />

    <Dialog flip :open="resultOpen" :title="ended ? S.solitaire.stuckResult : S.solitaire.win" :label="T.resultLabel" tone="red" @close="resultOpen = false">
      <table class="score">
        <tbody>
          <tr class="rise info" style="--i: 1"><td>{{ S.solitaire.moves }}</td><td class="t-slab">{{ state.moves }}</td></tr>
          <tr class="rise" style="--i: 2"><td>{{ T.rowStart }}</td><td class="t-slab">{{ START_SCORE }}</td></tr>
          <tr class="rise" style="--i: 3"><td>{{ T.rowRuns(state.done.length) }}</td><td class="t-slab">+{{ runs }}</td></tr>
          <tr class="rise" style="--i: 3"><td>{{ T.rowMoves }}</td><td class="t-slab">−{{ moveCost }}</td></tr>
          <tr v-if="state.penalty" class="rise" style="--i: 4"><td>{{ S.solitaire.rowPenalty }}</td><td class="t-slab">−{{ state.penalty }}</td></tr>
          <tr class="rise total" style="--i: 5"><td class="t-black">{{ S.solitaire.rowTotal }}</td><td class="t-slab red">{{ scoreOf(state) }}</td></tr>
        </tbody>
      </table>
      <p class="t-label best rise" style="--i: 6">{{ S.solitaire.best(bestAt('spider', level)) }}</p>
      <template #actions>
        <Btn icon="exit" size="sm" @click="emit('exit')">{{ S.common.quit }}</Btn>
        <Btn tone="red" icon="again" @click="newGame">{{ S.common.again }}</Btn>
      </template>
    </Dialog>
  </section>
</template>

<style scoped src="../solitaire/hud.css"></style>
