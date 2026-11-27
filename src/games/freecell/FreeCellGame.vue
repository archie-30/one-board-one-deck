<script setup lang="ts">
// 新接龍對局：牌桌＋右下的步數、時間，以及返回（算一步）、自動收牌、卡關時的選項。
// 比的是步數：過關用的步數越少越好（最少步數記在 stats.freecell.fewest）。
import { checkDeadEnd } from '@/core/deadEnd'
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'
import { playSound } from '@/core/audio'
import { recordResult, stats } from '@/core/settings'
import { S } from '@/data/strings'
import { seedRng } from '@/engine/common/rng'
import { applyFreeCell, dealFreeCell, finishPlan, isStuck, undoTo, type FreeCellAction, type FreeCellError, type FreeCellState } from '@/engine/freecell/rules'
import type { GameDef } from '@/games/types'
import StuckBtn from '@/games/solitaire/StuckBtn.vue'
import Btn from '@/ui/Btn.vue'
import Dialog from '@/ui/Dialog.vue'
import CursorGlow from '@/ui/CursorGlow.vue'
import GameMenu from '@/ui/GameMenu.vue'
import IconBtn from '@/ui/IconBtn.vue'
import FreeCellTable from './FreeCellTable.vue'

const props = defineProps<{ game: GameDef; options: Record<string, string | boolean>; resume?: unknown }>()
const emit = defineEmits<{ exit: []; save: [data: unknown] }>()

interface Saved {
  state: FreeCellState
  history: FreeCellState[]
  seconds: number
}
const saved = (props.resume ?? null) as Saved | null
const T = S.freecell

function fresh(): FreeCellState {
  const seed = (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0
  return dealFreeCell(seedRng(seed))[0]
}

const finishing = ref(false)
const state = shallowRef<FreeCellState>(saved ? saved.state : fresh())
const stuck = ref(false)
const ended = ref(false)
const ready = ref(false)
const plan = computed(() => (finishing.value ? null : finishPlan(state.value)))
const history: FreeCellState[] = saved ? saved.history.slice() : []
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
/** 這一局有沒有破紀錄 */
const record = ref(false)

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

let msgTimer = 0
function say(text: string, ms = 1600) {
  message.value = text
  window.clearTimeout(msgTimer)
  msgTimer = window.setTimeout(() => (message.value = ''), ms)
}
function onInvalid(reason: FreeCellError, info?: { n: number; max: number }) {
  playSound('error')
  if (reason === 'tooMany') say(info ? T.tooManyDetail(info.n, info.max) : T.tooMany, 3200)
  else say(S.solitaire.cantPlace)
}

function commit(next: FreeCellState) {
  history.push(state.value)
  if (history.length > 80) history.shift()
  canUndo.value = true
  state.value = next
  startClock()
  if (!counted) {
    counted = true
    stats.freecell.played++
  }
}
function act(action: FreeCellAction) {
  if (finishing.value) return
  const r = applyFreeCell(state.value, action)
  if (!r.ok) return onInvalid(r.reason)
  commit(r.state)
  if (action.to.pile === 'foundation') playSound('collect')
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
  void checkDeadEnd('freecell', s).then((dead) => {
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
  recordResult('freecell', 'all', 'l', state.value.foundations.flat().length / 52)
  playSound('lose')
  window.setTimeout(() => (resultOpen.value = true), 500)
}

function undo() {
  if (!history.length || finishing.value || state.value.won || ended.value) return
  playSound('tap')
  state.value = undoTo(history.pop()!, state.value)
  canUndo.value = history.length > 0
  say(T.undoCost)
  checkStuck()
}

let finishTimer = 0
function autoFinish() {
  const steps = plan.value
  if (!steps || finishing.value) return
  finishing.value = true
  let i = 0
  const step = () => {
    const a = steps[i++]
    const r = a && applyFreeCell(state.value, a)
    if (!r || !r.ok) {
      finishing.value = false
      return
    }
    commit(r.state)
    playSound('collect')
    if (r.state.won) {
      finishing.value = false
      win()
      return
    }
    finishTimer = window.setTimeout(step, 110)
  }
  step()
}

function win() {
  stopClock()
  const m = state.value.moves
  stats.freecell.wins++
  record.value = !stats.freecell.fewest || m < stats.freecell.fewest
  if (record.value) stats.freecell.fewest = m
  // 表現：步數越少越好（100 步以內滿分）
  recordResult('freecell', 'all', 'w', 1 - (m - 100) / 150)
  playSound('win')
  window.setTimeout(() => (resultOpen.value = true), 900)
}

function newGame() {
  stopClock()
  window.clearTimeout(finishTimer)
  window.clearTimeout(stuckTimer)
  finishing.value = false
  menuOpen.value = false
  resultOpen.value = false
  reviewing.value = false
  stuck.value = false
  ended.value = false
  record.value = false
  history.length = 0
  canUndo.value = false
  seconds.value = 0
  counted = false
  ready.value = false
  state.value = fresh()
  dealKey.value++
}

const canSave = computed(() => !state.value.won && !ended.value && !finishing.value && state.value.moves > 0)
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

const collected = computed(() => state.value.foundations.flat().length)
</script>

<template>
  <section class="game">
    <FreeCellTable :state="state" :deal-key="dealKey" :interactive="!finishing && !state.won && !ended" @action="act" @invalid="onInvalid" @ready="onReady">
      <template #default="{ layout: L }">
        <div class="hud" :style="{ left: `${L.hud.x}px`, top: `${L.hud.y}px`, width: `${L.hud.w}px` }">
          <div class="score-box">
            <span class="t-label">{{ S.solitaire.moves }}</span>
            <b class="t-slab red">{{ state.moves }}</b>
          </div>
          <dl class="nums">
            <div><dt class="t-label">{{ S.solitaire.time }}</dt><dd class="t-slab">{{ clock }}</dd></div>
            <div><dt class="t-label">{{ T.collected }}</dt><dd class="t-slab">{{ collected }}</dd></div>
          </dl>
          <template v-if="!reviewing">
          <Btn v-if="plan || finishing" class="pop" tone="yellow" size="sm" block :disabled="finishing || !ready" @click="autoFinish">{{ S.solitaire.autoFinish }}</Btn>
          <Btn v-else size="sm" block :disabled="!ready || !canUndo || state.won || ended" @click="undo">{{ S.solitaire.undo }}<small class="cost">{{ T.undoTag }}</small></Btn>
          </template>
          <!-- 結算視窗關掉（點背景或「查看棋盤」）之後：看結果、再來一局、離開對局 -->
          <div v-if="reviewing" class="after">
            <Btn class="rise" tone="ink" size="sm" arrow block @click="resultOpen = true">{{ S.common.showResult }}</Btn>
            <Btn class="rise" style="--i: 1" tone="red" size="sm" icon="again" block @click="newGame">{{ S.common.again }}</Btn>
            <Btn class="rise" style="--i: 2" size="sm" icon="exit" block @click="emit('exit')">{{ S.common.quit }}</Btn>
          </div>
          <Transition name="stuck">
            <div v-if="stuck" class="stuck">
              <StuckBtn @settle="settleStuck" />
            </div>
          </Transition>
        </div>
      </template>
    </FreeCellTable>

    <p v-if="message" :key="message" class="toast pop">{{ message }}</p>
    <div class="corner"><IconBtn icon="menu" :label="S.common.menu" @click="menuOpen = true" /></div>

    <CursorGlow />
    <GameMenu :open="menuOpen" :game="game" :options="props.options" @close="menuOpen = false" @restart="newGame" @exit="emit('exit')" :can-save="canSave" @save-exit="saveAndExit" />

    <Dialog flip :open="resultOpen" :title="ended ? S.solitaire.stuckResult : S.solitaire.win" :label="T.resultLabel" tone="red" @close="closeResult">
      <table class="score">
        <tbody>
          <tr class="rise info" style="--i: 1"><td>{{ S.solitaire.time }}</td><td class="t-slab">{{ clock }}</td></tr>
          <tr class="rise" style="--i: 2"><td>{{ T.collected }}</td><td class="t-slab">{{ collected }}/52</td></tr>
          <tr class="rise total" style="--i: 4"><td class="t-black">{{ S.solitaire.moves }}</td><td class="t-slab red">{{ state.moves }}</td></tr>
        </tbody>
      </table>
      <p class="t-label best rise" style="--i: 5">{{ record ? T.newRecord : T.fewest(stats.freecell.fewest) }}</p>
      <template #actions>
        <Btn icon="exit" size="sm" @click="emit('exit')">{{ S.common.quit }}</Btn>
        <Btn size="sm" icon="check" @click="closeResult">{{ S.common.viewBoard }}</Btn>
        <Btn tone="red" icon="again" @click="newGame">{{ S.common.again }}</Btn>
      </template>
    </Dialog>
  </section>
</template>

<style scoped src="../solitaire/hud.css"></style>
