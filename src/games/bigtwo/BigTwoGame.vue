<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { playSound } from '@/core/audio'
import { pickOpponents } from '@/core/opponents'
import { stats } from '@/core/settings'
import { S } from '@/data/strings'
import { seedRng } from '@/engine/common/rng'
import type { Difficulty } from '@/engine/common/types'
import { chooseBigTwoAction, legalPlays, suggestPlay } from '@/engine/bigtwo/ai'
import type { Card } from '@/engine/bigtwo/cards'
import { identifyCombo } from '@/engine/bigtwo/combos'
import { applyBigTwo, checkPlay, dealBigTwo, scoreBigTwo, type BigTwoAction, type BigTwoState } from '@/engine/bigtwo/game'
import type { BigTwoOptions } from '@/engine/bigtwo/options'
import type { GameDef } from '@/games/types'
import GameMenu from '@/ui/GameMenu.vue'
import InkDialog from '@/ui/InkDialog.vue'
import ArtBuddy from '@/ui/art/ArtBuddy.vue'
import ArtCard from '@/ui/art/ArtCard.vue'
import Doodle from '@/ui/art/Doodle.vue'
import DoodleButton from '@/ui/DoodleButton.vue'
import SketchBox from '@/ui/SketchBox.vue'
import CardHand from './CardHand.vue'
import TablePlay from './TablePlay.vue'

const props = defineProps<{ game: GameDef; options: Record<string, string | boolean>; difficulty: Difficulty }>()
const emit = defineEmits<{ exit: [] }>()

// 規則在開局時固定下來
const options = { ...props.options } as unknown as BigTwoOptions
const T = S.bigtwo
const ME = 0

// 這一桌的三位對手：坐下時隨機挑，離開前都是同一批人
const opponents = pickOpponents(3)
const names = [S.common.you, ...opponents.map((o) => o.name)]
/** 這一桌的累計分數（換一桌就重算）；自己的總分另外存檔 */
const tableTotals = ref([0, 0, 0, 0])

let seed = (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0
let rng = seedRng(seed)
let timer = 0

const state = ref<BigTwoState>(dealBigTwo(seed, options))
const selected = ref<Card[]>([])
const message = ref('')
const round = ref(0)
const menuOpen = ref(false)
const resultOpen = ref(false)
const scores = ref(scoreBigTwo(state.value))

const over = computed(() => state.value.winner >= 0)
const myTurn = computed(() => !over.value && state.value.turn === ME)
const selectedCombo = computed(() => (selected.value.length ? identifyCombo(selected.value, options) : null))
const canPass = computed(() => myTurn.value && state.value.table !== null)
const tableCaption = computed(() => {
  const table = state.value.table
  return table ? `${names[table.player]}　${T.combos[table.combo.type]}` : ''
})
const status = computed(() => {
  if (over.value) return state.value.winner === ME ? T.result.win : T.result.lose(names[state.value.winner])
  if (!myTurn.value) return T.waiting(names[state.value.turn])
  if (selectedCombo.value) return T.combos[selectedCombo.value.type]
  if (state.value.firstTurn) return T.firstLead
  return state.value.table ? T.yourTurn : T.yourLead
})
const doubleNotes = computed(() => {
  const notes: string[] = []
  if (options.doubleOverTen) notes.push(T.result.overTen)
  if (options.doubleTwos) notes.push(T.result.twos)
  return notes.length ? notes : [T.result.noDoubles]
})

function act(action: BigTwoAction): boolean {
  const result = applyBigTwo(state.value, action)
  if (!result.ok) {
    message.value = T.errors[result.reason]
    playSound('error')
    return false
  }
  state.value = result.state
  message.value = ''
  playSound(action.type === 'play' ? 'card' : 'pass')
  if (result.state.winner >= 0) finish()
  else if (result.state.turn !== ME) scheduleCpu()
  return true
}

function scheduleCpu() {
  window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    let action: BigTwoAction
    ;[action, rng] = chooseBigTwoAction(state.value, props.difficulty, rng)
    act(action)
  }, 760)
}

function finish() {
  scores.value = scoreBigTwo(state.value)
  stats.bigtwo.rounds++
  if (state.value.winner === ME) stats.bigtwo.wins++
  tableTotals.value = scores.value.map((s, p) => tableTotals.value[p] + s.points)
  stats.bigtwo.totals[ME] = (stats.bigtwo.totals[ME] ?? 0) + scores.value[ME].points
  timer = window.setTimeout(() => {
    playSound(state.value.winner === ME ? 'win' : 'lose')
    resultOpen.value = true
  }, 900)
}

function playSelected() {
  if (!myTurn.value) return
  const check = checkPlay(state.value, ME, selected.value)
  if (!check.ok) {
    message.value = T.errors[check.reason]
    playSound('error')
    return
  }
  if (act({ type: 'play', player: ME, cards: selected.value })) selected.value = []
}

function pass() {
  if (canPass.value && act({ type: 'pass', player: ME })) selected.value = []
}

function hint() {
  if (!myTurn.value) return
  const cards = legalPlays(state.value).length ? suggestPlay(state.value) : null
  if (!cards) {
    message.value = T.noPlay
    selected.value = []
    return
  }
  message.value = ''
  selected.value = cards
}

function newRound() {
  window.clearTimeout(timer)
  menuOpen.value = false
  resultOpen.value = false
  seed = (seed * 1664525 + 1013904223) >>> 0
  state.value = dealBigTwo(seed, options)
  selected.value = []
  message.value = ''
  round.value++
  playSound('deal')
  if (state.value.turn !== ME) scheduleCpu()
}

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`)

onMounted(() => {
  if (state.value.turn !== ME) scheduleCpu()
})
onUnmounted(() => window.clearTimeout(timer))
</script>

<template>
  <section class="felt">
    <button class="icon-btn menu" :aria-label="S.common.menu" @click="menuOpen = true"><Doodle name="menu" class="h-[2rem] w-[2rem]" /></button>

    <!-- 三個電腦：右、上、左（出牌順序是 你 → 右 → 上 → 左） -->
    <div v-for="p in [1, 2, 3]" :key="p" class="seat" :class="[`seat-${p}`, { active: !over && state.turn === p }]">
      <ArtBuddy class="robot" :look="opponents[p - 1].look" />
      <svg class="back" viewBox="-3 -3 84 114" aria-hidden="true">
        <ArtCard back :seed="p + 20" shadow still />
        <circle cx="35" cy="50" r="23" fill="var(--color-card)" />
        <text x="35" y="61" text-anchor="middle" font-size="31" class="font-display" :fill="state.hands[p].length <= 3 ? 'var(--color-red)' : 'var(--color-ink)'">{{ state.hands[p].length }}</text>
      </svg>
      <span class="name font-display">{{ names[p] }}</span>
      <Transition name="pass">
        <span v-if="state.lastMoves[p] === 'pass'" class="pass-mark font-display">{{ T.passed }}</span>
      </Transition>
    </div>

    <div class="center">
      <div class="mat"><SketchBox fill="var(--color-paper-deep)" :variant="2" :weight="2.6" shadow shade="var(--color-mid)" /></div>
      <TablePlay :cards="state.table?.combo.cards ?? null" :from="state.table?.player" :caption="tableCaption" />
    </div>

    <p class="status font-display" :class="{ mine: myTurn && !message, warn: !!message }">
      <Transition name="pass">
        <span v-if="state.lastMoves[ME] === 'pass'" class="my-pass">{{ T.passed }}</span>
      </Transition>
      {{ message || status }}
    </p>

    <div class="bottom">
      <div class="side">
        <DoodleButton :label="T.hint" size="3.4rem" :disabled="!myTurn" @click="hint"><Doodle name="bulb" /></DoodleButton>
      </div>
      <CardHand v-model:selected="selected" class="mine-hand" :cards="state.hands[ME]" :disabled="over" :deal-key="round" />
      <div class="side actions">
        <DoodleButton v-if="over" :label="T.result.howTitle" size="4rem" @click="resultOpen = true"><Doodle name="score" /></DoodleButton>
        <template v-else>
          <DoodleButton :label="T.pass" size="3.2rem" :disabled="!canPass" @click="pass"><Doodle name="pass" /></DoodleButton>
          <DoodleButton :label="T.play" size="4.2rem" :disabled="!myTurn || !selected.length" @click="playSelected"><Doodle name="play" /></DoodleButton>
        </template>
      </div>
    </div>

    <GameMenu :open="menuOpen" :game="game" :options="props.options" @close="menuOpen = false" @restart="newRound" @exit="emit('exit')" />

    <InkDialog :open="resultOpen" :title="state.winner === ME ? T.result.win : T.result.lose(names[Math.max(0, state.winner)])" wide @close="resultOpen = false">
      <table class="score">
        <thead>
          <tr>
            <th>{{ T.result.colPlayer }}</th>
            <th>{{ T.result.colLeft }}</th>
            <th>{{ T.result.colTimes }}</th>
            <th>{{ T.result.colRound }}</th>
            <th>{{ T.result.colTotal }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(s, p) in scores" :key="p" :class="{ winner: p === state.winner }">
            <td class="font-display">{{ names[p] }}</td>
            <td>{{ p === state.winner ? T.result.winner : s.twos ? T.result.leftWithTwos(s.cards, s.twos) : T.cardsLeft(s.cards) }}</td>
            <td>{{ p === state.winner ? '' : `×${s.multiplier}` }}</td>
            <td class="num">{{ signed(s.points) }}</td>
            <td class="num">{{ signed(tableTotals[p]) }}</td>
          </tr>
        </tbody>
      </table>
      <p class="how">
        <b class="font-display">{{ T.result.howTitle }}</b>
        {{ T.result.base }}{{ doubleNotes.join('') }}
        <span class="lifetime">{{ T.result.lifetime(signed(stats.bigtwo.totals[ME] ?? 0)) }}</span>
      </p>
      <template #actions>
        <DoodleButton row :label="S.common.again" size="2.8rem" @click="newRound"><Doodle name="again" /></DoodleButton>
        <DoodleButton row :label="S.common.quit" size="2.8rem" @click="emit('exit')"><Doodle name="exit" /></DoodleButton>
      </template>
    </InkDialog>
  </section>
</template>

<style scoped>
.felt {
  position: relative;
  display: grid;
  grid-template-rows: 1fr auto auto;
  height: 100%;
  padding: 0.6rem max(1rem, env(safe-area-inset-left)) 0.55rem;
}
.icon-btn {
  display: grid;
  place-items: center;
  width: 2.6rem;
  height: 2.6rem;
  border: 0;
  background: none;
  transition: transform 160ms var(--ease-out);
}
.icon-btn:active {
  transform: scale(0.92);
}
.menu {
  position: absolute;
  left: max(0.7rem, env(safe-area-inset-left));
  top: 0.5rem;
  z-index: 2;
}
.center {
  position: relative;
  min-height: 0;
  padding: 3.4rem 9.5rem 0.2rem;
}
/* 桌墊：出的牌都落在這裡 */
.mat {
  position: absolute;
  inset: 3.7rem 10.5rem 0.3rem;
}
.robot {
  width: 2.9rem;
  height: 3.1rem;
  transition: transform 240ms var(--ease-out);
}
.seat.active .robot {
  transform: translateY(-0.2rem) rotate(-5deg);
}

/* 電腦的座位：牌背上寫剩幾張 */
.seat {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  opacity: 0.8;
  transition: opacity 200ms ease;
}
.seat.active {
  opacity: 1;
}
.seat-1 {
  right: max(1.2rem, env(safe-area-inset-right));
  top: 4.2rem;
  display: grid;
  grid-template-columns: auto auto;
  justify-items: center;
  gap: 0.2rem 0.4rem;
}
.seat-2 {
  left: 50%;
  top: 0.55rem;
  transform: translateX(-50%);
}
.seat-3 {
  left: max(1.2rem, env(safe-area-inset-left));
  top: 4.2rem;
  display: grid;
  grid-template-columns: auto auto;
  justify-items: center;
  gap: 0.2rem 0.4rem;
}
.seat-1 .name,
.seat-3 .name,
.seat-1 .pass-mark,
.seat-3 .pass-mark {
  grid-column: 1 / -1;
}
.back {
  width: 2.2rem;
  height: 3rem;
  overflow: visible;
  transition: transform 220ms var(--ease-out);
}
.seat-2 .back {
  width: 2rem;
  height: 2.7rem;
}
.seat.active .back {
  transform: translateY(-0.2rem) rotate(-3deg);
}
.name {
  position: relative;
  font-size: 0.95rem;
  line-height: 1.2;
}
/* 輪到誰：名字下方一道綠色筆劃 */
.name::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -0.2rem;
  height: 0.22rem;
  border-radius: 0.2rem;
  background: var(--color-red);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 240ms var(--ease-out);
}
.seat.active .name::after {
  transform: scaleX(1);
}
.pass-mark,
.my-pass {
  border: 0.12rem solid var(--color-ink);
  border-radius: 0.4rem 0.3rem 0.45rem 0.28rem;
  background: var(--color-paper-deep);
  padding: 0 0.5rem;
  font-size: 1rem;
  line-height: 1.5;
}
.my-pass {
  margin-right: 0.6rem;
  color: var(--color-ink);
}
.pass-enter-active {
  transition:
    opacity 160ms ease,
    transform 200ms var(--ease-out);
}
.pass-leave-active {
  transition: opacity 120ms ease;
}
.pass-enter-from {
  opacity: 0;
  transform: scale(0.95) translateY(0.3rem);
}
.pass-leave-to {
  opacity: 0;
}

.status {
  min-height: 1.9rem;
  text-align: center;
  font-size: 1.05rem;
  line-height: 1.7;
  color: var(--color-ink-soft);
}
.status.mine {
  color: var(--color-leaf);
}
.status.warn {
  color: var(--color-red);
}
.bottom {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 0.8rem;
}
.side {
  display: flex;
  position: absolute;
  bottom: 0.5rem;
  left: max(1rem, env(safe-area-inset-left));
  width: 6.2rem;
  flex-direction: column;
  align-items: center;
  gap: 0.1rem;
}
.side.actions {
  left: auto;
  right: max(1rem, env(safe-area-inset-right));
}

.score {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.98rem;
  line-height: 1.5;
  font-variant-numeric: tabular-nums;
}
.score th {
  padding: 0 0.6rem 0.2rem;
  border-bottom: 0.12rem solid var(--color-ink);
  font-size: 0.82rem;
  font-weight: 400;
  color: var(--color-ink-soft);
  text-align: center;
}
.score td {
  padding: 0.08rem 0.6rem;
  border-bottom: 0.07rem dashed var(--color-ink-soft);
  text-align: center;
}
.score th:first-child,
.score td:first-child {
  text-align: left;
  font-size: 1.1rem;
}
.score .num {
  text-align: right;
}
.score .winner td {
  background: repeating-linear-gradient(-52deg, var(--color-sun) 0 0.35rem, #efe08f 0.35rem 0.45rem);
}
.how {
  padding-top: 0.5rem;
  font-size: 0.8rem;
  line-height: 1.5;
  color: var(--color-ink-soft);
}
.lifetime {
  margin-left: 0.6rem;
  font-family: var(--font-display);
  font-weight: 800;
  color: var(--color-ink);
}
.how b {
  margin-right: 0.5rem;
  font-size: 1rem;
  font-weight: 400;
  color: var(--color-ink);
}
</style>
