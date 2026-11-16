<script setup lang="ts">
// 排七：你在下面，三位電腦在左、上、右。桌子中間是四排（黑桃、紅心、方塊、梅花），7 在正中間往兩邊接。
// 點手牌選起來，再按「出牌」（或再點一次同一張）；完全沒有牌可以接時，按鈕變成「蓋牌」，選一張蓋起來當罰分。
// 每張牌都是獨立的精靈（沿用大老二的 CardStage），發牌、出牌、蓋牌都一張一張飛。
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef } from 'vue'
import { playSound } from '@/core/audio'
import { useGrace } from '@/core/grace'
import { afterReveal } from '@/core/launch'
import { opponentById, pickOpponents } from '@/core/opponents'
import { recordResult, stats } from '@/core/settings'
import { myLook } from '@/core/profile'
import { S } from '@/data/strings'
import { TURN_SECONDS } from '@/data/timer'
import { sevensAt } from '@/engine/common/difficulty'
import { seedRng, nextInt, type RngState } from '@/engine/common/rng'
import { chooseSevensAction } from '@/engine/sevens/ai'
import { applySevens, dealSevens, legalPlays, penalties, RANK_LABELS, rankOf, suitOf, winners, type Card, type SevensAction, type SevensState } from '@/engine/sevens/rules'
import { CardStage } from '@/games/bigtwo/cardStage'
import type { GameDef } from '@/games/types'
import Avatar from '@/ui/art/Avatar.vue'
import CardArt from '@/ui/art/Card.vue'
import type { Mood } from '@/ui/art/look'
import Btn from '@/ui/Btn.vue'
import CursorGlow from '@/ui/CursorGlow.vue'
import Dialog from '@/ui/Dialog.vue'
import GameMenu from '@/ui/GameMenu.vue'
import IconBtn from '@/ui/IconBtn.vue'
import TurnGlow from '@/ui/TurnGlow.vue'
import TurnTimer from '@/ui/TurnTimer.vue'
import { sevensLayout, sevensPoses, type SevensLayout } from './layout'

const props = defineProps<{ game: GameDef; options: Record<string, string | boolean>; resume?: unknown }>()
const emit = defineEmits<{ exit: []; save: [data: unknown] }>()

interface Saved {
  state: SevensState
  opponents: number[]
  seed: number
  rng: number
}
const saved = (props.resume ?? null) as Saved | null

const T = S.sevens
const ME = 0
const ALL: Card[] = Array.from({ length: 52 }, (_, i) => i)
const SIDES = ['bottom', 'right', 'top', 'left'] as const
const timed = props.options.timer !== false
const difficulty = props.options.difficulty === 'hard' ? 'hard' : 'easy'

let seed = saved ? saved.seed : (Date.now() >>> 0) % 2147483647
let rng: RngState = saved ? saved.rng : seedRng(seed + 7)
const opponents = saved ? saved.opponents.map(opponentById) : pickOpponents(3, Date.now(), difficulty === 'hard')
const names = [S.common.you, ...opponents.map((o) => o.name)]
const looks = [myLook(), ...opponents.map((o) => o.look)]

const state = shallowRef<SevensState>(saved ? saved.state : dealSevens(seed))
const grace = useGrace(props.options, state, () => state.value.turn === ME)
const phase = ref<'deal' | 'play' | 'over'>(saved ? 'play' : 'deal')
const gathered = ref(!saved)
const selected = ref<Card | null>(null)
const message = ref('')
const menuOpen = ref(false)
const resultOpen = ref(false)
const moods = reactive<Mood[]>(['idle', 'idle', 'idle', 'idle'])

const timers = new Set<number>()
function later(fn: () => void, ms: number) {
  const id = window.setTimeout(() => {
    timers.delete(id)
    if (menuOpen.value) later(fn, 250)
    else fn()
  }, ms)
  timers.add(id)
}

// ── 版面與動畫 ──
const stageEl = ref<HTMLElement>()
const L = shallowRef<SevensLayout>(sevensLayout(844, 390))
const ch = computed(() => (L.value.cw * 108) / 78)
const stage = new CardStage()
let lastLand = 0
stage.onLand = () => {
  const now = performance.now()
  if (now - lastLand > 45) playSound(phase.value === 'deal' ? 'deal' : 'card')
  lastLand = now
}
function sync(fly: Card[] = [], opts: { stagger?: number; dur?: number; arc?: number; order?: (c: Card) => number } = {}, instant = false) {
  const poses = sevensPoses(L.value, state.value, selected.value, gathered.value)
  for (const c of ALL) {
    const pose = poses.get(c)
    if (!pose) continue
    const fi = fly.indexOf(c)
    if (fi >= 0) {
      const k = opts.order ? opts.order(c) : fi
      const v = Math.random()
      const st = opts.stagger ?? 0
      stage.move(c, pose, { delay: k * st + v * st * 0.4, dur: (opts.dur ?? 420) * (0.88 + v * 0.3), arc: (opts.arc ?? L.value.cw * 0.8) * (0.65 + Math.random() * 0.7), flightZ: 600 + k, land: true, instant })
    } else stage.move(c, pose, { dur: 240, instant })
  }
}
let observer: ResizeObserver | undefined
onMounted(() => {
  const el = stageEl.value!
  const measure = () => {
    L.value = sevensLayout(el.clientWidth, el.clientHeight)
    sync([], {}, true)
  }
  measure()
  observer = new ResizeObserver(measure)
  observer.observe(el)
  if (saved) nextTurn()
  else void afterReveal().then(() => later(deal, 120))
})
onBeforeUnmount(() => {
  observer?.disconnect()
  stage.destroy()
  timers.forEach((t) => window.clearTimeout(t))
})

// ── 流程 ──
function deal() {
  phase.value = 'deal'
  playSound('shuffle')
  gathered.value = false
  const order = new Map<Card, number>()
  state.value.hands.forEach((h, seat) => h.forEach((c, k) => order.set(c, k * 4 + seat)))
  sync(ALL, { stagger: 24, dur: 320, arc: 16, order: (c) => order.get(c) ?? 0 })
  later(() => {
    phase.value = 'play'
    nextTurn()
  }, 52 * 24 + 420)
}

let scheduledFor: SevensState | null = null
function nextTurn() {
  const s = state.value
  if (s.over || phase.value !== 'play') return
  // 同一個局面只排一次電腦出牌
  if (scheduledFor === s) return
  scheduledFor = s
  moods.forEach((m, i) => m === 'think' && (moods[i] = 'idle'))
  if (s.turn === ME) {
    if (!legalPlays(s).length) message.value = T.mustCover
    return
  }
  const p = s.turn
  moods[p] = 'think'
  const st = sevensAt(opponents[p - 1].persona.bigtwo, difficulty)
  const at = state.value
  later(
    () => {
      // 想完的時候局面要還是同一個（沒被重新開局、也沒有別人先動），才出牌
      if (state.value !== at || at.over || phase.value !== 'play') return
      let a: SevensAction
      ;[a, rng] = chooseSevensAction(state.value, st, rng)
      act(a)
    },
    // 電腦每一手想一下：約 2.1～3.9 秒
    2100 + st.skill * 900 + Math.random() * 900,
  )
}

function act(a: SevensAction): boolean {
  const r = applySevens(state.value, a)
  if (!r.ok) {
    message.value = T.errors[r.reason]
    playSound('error')
    return false
  }
  state.value = r.state
  selected.value = null
  message.value = ''
  const p = a.player
  if (moods[p] === 'think') moods[p] = 'idle'
  const m = r.state.lastMove!
  if (m.covered) {
    flash(p, 'sad', 1300)
    playSound('pass')
  } else if (rankOf(m.card) === 7) flash(p, 'smug', 1100)
  sync([m.card], { dur: 440, arc: L.value.cw * 0.9 })
  if (r.state.over) later(finish, 900)
  else later(nextTurn, 520)
  return true
}

function flash(p: number, mood: Mood, ms: number) {
  moods[p] = mood
  later(() => moods[p] === mood && phase.value === 'play' && (moods[p] = 'idle'), ms)
}

const pens = computed(() => penalties(state.value))
const won = computed(() => winners(state.value))
function finish() {
  phase.value = 'over'
  message.value = ''
  const w = won.value
  for (let p = 0; p < 4; p++) moods[p] = w.includes(p) ? 'happy' : 'sad'
  stats.sevens.rounds++
  if (w.includes(ME)) stats.sevens.wins++
  // 表現：贏的話看比第二名少罰幾分，輸的話看比第一名多罰幾分
  const pen = pens.value
  const others = pen.filter((_, p) => p !== ME)
  const perf = w.includes(ME) ? (Math.min(...others) - pen[ME]) / 40 : 1 - (pen[ME] - Math.min(...pen)) / 60
  recordResult('sevens', difficulty, !w.includes(ME) ? 'l' : w.length > 1 ? 'd' : 'w', perf)
  playSound(w.includes(ME) ? 'win' : 'lose')
  later(() => (resultOpen.value = true), 900)
}

function newRound() {
  timers.forEach((t) => window.clearTimeout(t))
  timers.clear()
  menuOpen.value = false
  resultOpen.value = false
  selected.value = null
  message.value = ''
  moods.fill('idle')
  phase.value = 'deal'
  gathered.value = true
  sync(ALL, { stagger: 7, dur: 360, arc: 0 })
  later(() => {
    let k: number
    ;[k, rng] = nextInt(rng, 2147483646)
    seed = k + 1
    state.value = dealSevens(seed)
    acted.value = false
    deal()
  }, 52 * 7 + 480)
}

// ── 你的操作 ──
const myTurn = computed(() => phase.value === 'play' && !state.value.over && state.value.turn === ME)
const canPlayAny = computed(() => legalPlays(state.value, ME).length > 0)
const status = computed(() => {
  if (message.value) return message.value
  const s = state.value
  if (phase.value === 'deal') return ''
  if (s.over) return won.value.includes(ME) ? T.win : T.lose
  if (!myTurn.value) return T.waiting(names[s.turn])
  if (s.first) return T.firstLead
  return canPlayAny.value ? T.yourTurn : T.mustCover
})
// ── 拖曳出牌：按住手牌往上拖到桌框裡放開＝出這張（沒牌可接時＝蓋這張）；沒拖到桌上就回原位 ──
let drag: { c: Card; id: number; x0: number; y0: number; base: ReturnType<CardStage['target']>; moving: boolean } | null = null
let suppressClick = false
function local(e: PointerEvent) {
  const r = stageEl.value!.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}
function onDown(c: Card, e: PointerEvent) {
  if (drag || phase.value !== 'play' || !state.value.hands[ME].includes(c) || (e.pointerType === 'mouse' && e.button !== 0)) return
  const p = local(e)
  drag = { c, id: e.pointerId, x0: p.x, y0: p.y, base: stage.target(c), moving: false }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onCancel)
}
function onMove(e: PointerEvent) {
  if (!drag || e.pointerId !== drag.id) return
  const p = local(e)
  const dx = p.x - drag.x0
  const dy = p.y - drag.y0
  if (!drag.moving && Math.hypot(dx, dy) < (e.pointerType === 'mouse' ? 6 : 14)) return
  drag.moving = true
  stage.move(drag.c, { ...drag.base, x: drag.base.x + dx, y: drag.base.y + dy, r: 0, s: 1.06, z: 1000 }, { instant: true })
}
function stopDrag() {
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
  window.removeEventListener('pointercancel', onCancel)
  const d = drag
  drag = null
  return d
}
function onUp(e: PointerEvent) {
  if (!drag || e.pointerId !== drag.id) return
  const d = stopDrag()!
  if (!d.moving) return
  suppressClick = true
  window.setTimeout(() => (suppressClick = false), 0)
  const p = local(e)
  const b = L.value.box
  const onTable = p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h
  if (onTable && myTurn.value) {
    selected.value = d.c
    acted.value = true
    if (act(canPlayAny.value ? { type: 'play', player: ME, card: d.c } : { type: 'cover', player: ME, card: d.c })) return
  }
  sync()
}
function onCancel() {
  if (stopDrag()) sync()
}
onBeforeUnmount(() => stopDrag())

function tapCard(c: Card) {
  if (suppressClick) return
  if (phase.value !== 'play' || !state.value.hands[ME].includes(c)) return
  if (selected.value === c && myTurn.value) return confirm()
  selected.value = selected.value === c ? null : c
  message.value = ''
  playSound('cardPick')
  sync()
}
function confirm() {
  const c = selected.value
  if (!myTurn.value || c === null) return
  acted.value = true
  act(canPlayAny.value ? { type: 'play', player: ME, card: c } : { type: 'cover', player: ME, card: c })
}
function onTimeout() {
  if (!myTurn.value) return
  acted.value = true
  act({ type: 'timeout', player: ME })
}

// ── 保存進度並退出 ──
const acted = ref(!!saved)
const canSave = computed(() => phase.value === 'play' && acted.value)
function snapshot(): Saved | null {
  if (!canSave.value) return null
  return { state: state.value, opponents: opponents.map((o) => o.id), seed, rng }
}
function saveAndExit() {
  const data = snapshot()
  if (data) emit('save', data)
}
defineExpose({ pause: () => phase.value !== 'over' && !resultOpen.value && (menuOpen.value = true), snapshot })

const rankText = (c: Card) => RANK_LABELS[rankOf(c)]
const order = (p: number) => [...state.value.covered[p]].sort((a, b) => rankOf(a) - rankOf(b))
</script>

<template>
  <section ref="stageEl" class="felt">
    <TurnGlow v-for="(side, p) in SIDES" :key="side" :side="side" :on="phase === 'play' && !state.over && state.turn === p" />
    <TurnTimer v-if="timed" :side="SIDES[state.turn]" :active="phase === 'play' && !state.over && !(grace && state.turn === ME)" :paused="menuOpen || resultOpen" :seconds="TURN_SECONDS.cards" :turn-key="state" @timeout="onTimeout" />

    <div class="table-box" :style="{ left: `${L.box.x}px`, top: `${L.box.y}px`, width: `${L.box.w}px`, height: `${L.box.h}px` }">
      <span class="t-label lab">TABLE</span>
    </div>

    <!-- 座位上的人＋每個人的罰分 -->
    <template v-for="(seat, p) in L.seats" :key="p">
      <div class="who" :class="{ active: phase === 'play' && state.turn === p }" :style="{ left: `${seat.kid.x - seat.kid.w / 2}px`, top: `${seat.kid.y - seat.kid.w}px`, width: `${seat.kid.w}px`, height: `${seat.kid.w}px` }">
        <Avatar :look="looks[p]" :mood="moods[p]" :flip="p === 1" :talk="p !== ME" />
      </div>
      <div v-if="p !== ME" class="tag" :class="[`al-${seat.label.align}`, { active: phase === 'play' && state.turn === p }]" :style="{ left: `${seat.label.x}px`, top: `${seat.label.y}px` }">
        <span class="nm t-black"><span class="hl" />{{ names[p] }}</span>
        <span class="t-label tg">{{ opponents[p - 1].tag }}</span>
      </div>
      <span v-if="state.covered[p].length" class="pen t-slab" :style="{ left: `${L.coverAt[p].x}px`, top: `${L.coverAt[p].y + ch * 0.32}px` }">{{ T.coveredCount(state.covered[p].length) }}</span>
    </template>

    <div class="cards">
      <div
        v-for="c in ALL"
        :key="c"
        :ref="(el) => stage.attach(c, el as HTMLElement | null)"
        class="sprite"
        :class="{ mine: state.hands[ME].includes(c), sel: selected === c }"
        :style="{ width: `${L.cw}px`, height: `${ch}px`, marginLeft: `${-L.cw / 2}px`, marginTop: `${-ch / 2}px` }"
        @pointerdown="onDown(c, $event)"
        @click="tapCard(c)"
      >
        <svg class="face" viewBox="-2 -2 78 108" aria-hidden="true"><CardArt :rank="rankText(c)" :suit="suitOf(c)" /></svg>
        <svg class="back" viewBox="-2 -2 78 108" aria-hidden="true"><CardArt back /></svg>
      </div>
    </div>

    <p class="status" :class="{ mine: myTurn && !message, warn: !!message || (myTurn && !canPlayAny) }" :style="{ top: `${L.box.y + L.box.h - 4}px` }">{{ status }}</p>

    <div class="corner"><IconBtn icon="menu" :label="S.common.menu" @click="menuOpen = true" /></div>
    <div class="actions">
      <Btn v-if="phase !== 'over'" class="rise" tone="red" size="lg" arrow block :disabled="!myTurn || selected === null" @click="confirm">{{ canPlayAny || !myTurn ? T.play : T.cover }}</Btn>
      <Btn v-else class="rise" tone="ink" size="lg" arrow block @click="resultOpen = true">{{ S.common.showResult }}</Btn>
    </div>

    <CursorGlow />
    <GameMenu :open="menuOpen" :game="game" :options="props.options" :can-save="canSave" @close="menuOpen = false" @restart="newRound" @exit="emit('exit')" @save-exit="saveAndExit" />

    <Dialog flip :open="resultOpen" :title="won.includes(ME) ? (won.length > 1 ? T.tie : T.win) : T.lose" :label="T.resultLabel" tone="red" wide @close="resultOpen = false">
      <table class="score">
        <thead>
          <tr>
            <th>{{ T.colPlayer }}</th>
            <th>{{ T.colCovered }}</th>
            <th>{{ T.colPenalty }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in [0, 1, 2, 3]" :key="p" class="rise" :class="{ winner: won.includes(p) }" :style="{ '--i': p + 2 }">
            <td>
              <span class="who-in">
                <span class="mini"><Avatar :look="looks[p]" :mood="won.includes(p) ? 'happy' : 'sad'" /></span>
                <span class="t-black">{{ names[p] }}</span>
              </span>
            </td>
            <td>
              <span class="cov">
                <svg v-for="c in order(p)" :key="c" viewBox="-2 -2 78 108" class="cov-card"><CardArt :rank="rankText(c)" :suit="suitOf(c)" :shadow="false" /></svg>
                <span v-if="!state.covered[p].length" class="none">{{ T.noCover }}</span>
              </span>
            </td>
            <td class="num t-slab" :class="{ red: won.includes(p) }">{{ pens[p] }}</td>
          </tr>
        </tbody>
      </table>
      <p class="how">{{ T.how }}</p>
      <p class="lifetime t-black">{{ T.record(stats.sevens.rounds, stats.sevens.wins) }}</p>
      <template #actions>
        <Btn icon="exit" size="sm" @click="emit('exit')">{{ S.common.quit }}</Btn>
        <Btn size="sm" icon="check" @click="resultOpen = false">{{ S.common.viewBoard }}</Btn>
        <Btn tone="red" icon="again" @click="newRound">{{ S.common.again }}</Btn>
      </template>
    </Dialog>
  </section>
</template>

<style scoped>
.felt {
  position: relative;
  isolation: isolate;
  height: 100%;
  overflow: hidden;
}
.table-box {
  position: absolute;
  border: 0.14rem solid var(--color-ink);
  background-image: radial-gradient(rgb(20 20 20 / 0.1) 30%, transparent 32%);
  background-size: 0.5rem 0.5rem;
  animation: rise 520ms var(--ease-out) both;
}
.lab {
  position: absolute;
  left: 0.5rem;
  top: -0.55rem;
  padding: 0 0.4rem;
  background: var(--color-paper);
}
.cards {
  position: absolute;
  inset: 0;
  isolation: isolate;
}
.sprite {
  position: absolute;
  left: 0;
  top: 0;
  will-change: transform;
}
.sprite svg {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.sprite[data-face='1'] .back,
.sprite[data-face='0'] .face {
  display: none;
}
.sprite.mine {
  cursor: grab;
  touch-action: none;
}
.sprite.sel::after {
  content: '';
  position: absolute;
  inset: -3% -4%;
  border: 0.18rem solid var(--color-red);
  border-radius: 10%;
  box-shadow: 0 0.35rem 0.9rem rgb(255 74 28 / 0.28);
  pointer-events: none;
  animation: sel-in 260ms var(--ease-back) both;
}
@keyframes sel-in {
  from {
    opacity: 0;
    transform: scale(1.12);
  }
}
.who {
  position: absolute;
  z-index: 2;
  pointer-events: none;
  transition: transform 300ms var(--ease-back);
}
.who.active {
  transform: translateY(-0.25rem);
}
.who :deep(svg) {
  width: 100%;
  height: 100%;
}
.tag {
  position: absolute;
  z-index: 2;
  display: flex;
  flex-direction: column;
  line-height: 1.2;
  white-space: nowrap;
  pointer-events: none;
}
.al-center {
  transform: translateX(-50%);
  align-items: center;
}
.al-right {
  transform: translateX(-100%);
  align-items: flex-end;
}
.nm {
  position: relative;
  padding: 0 0.25rem;
  font-size: 0.95rem;
}
.hl {
  position: absolute;
  inset: 0.15rem -0.1rem 0.05rem;
  z-index: -1;
  background: var(--color-yellow);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 300ms var(--ease-out);
}
.tag.active .hl {
  transform: none;
}
.tg {
  font-size: 0.5rem;
  color: var(--color-ink-2);
}
/* 蓋牌堆下面的小字：蓋了幾張 */
.pen {
  position: absolute;
  z-index: 3;
  translate: -50% 0;
  font-size: 0.65rem;
  color: var(--color-red);
  white-space: nowrap;
  pointer-events: none;
}
.status {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 0;
  translate: 0 -100%;
  text-align: center;
  font-size: 1.05rem;
  font-weight: 900;
  line-height: 1.6;
  color: var(--color-ink-3);
  pointer-events: none;
}
.status.mine {
  color: var(--color-ink);
}
.status.warn {
  color: var(--color-red);
}
.actions {
  position: absolute;
  right: 1rem;
  bottom: 0.7rem;
  display: flex;
  width: 8.4rem;
  flex-direction: column;
  gap: 0.45rem;
  z-index: 700;
}
.score {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
  line-height: 1.4;
  font-variant-numeric: tabular-nums;
}
.score th {
  padding: 0 0.5rem 0.2rem;
  border-bottom: 0.14rem solid var(--color-ink);
  font-size: 0.6rem;
  font-weight: 900;
  letter-spacing: 0.15em;
  color: var(--color-ink-2);
  text-align: center;
}
.score td {
  padding: 0.1rem 0.5rem;
  border-bottom: 0.07rem solid var(--color-ink);
  text-align: center;
}
.score th:first-child,
.score td:first-child {
  text-align: left;
}
.score .winner td {
  background: rgb(255 194 26 / 0.3);
}
.who-in {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}
.mini {
  display: block;
  width: 1.5rem;
  height: 1.5rem;
}
.mini :deep(svg) {
  width: 100%;
  height: 100%;
}
.cov {
  display: flex;
  min-height: 1.9rem;
  align-items: center;
  justify-content: center;
}
.cov-card {
  width: 1.35rem;
  flex: none;
}
.cov-card + .cov-card {
  margin-left: -0.5rem;
}
.none {
  font-size: 0.7rem;
  color: var(--color-ink-3);
}
.num {
  font-size: 1rem;
}
.red {
  color: var(--color-red);
}
.how {
  padding-top: 0.5rem;
  font-size: 0.72rem;
  line-height: 1.55;
  color: var(--color-ink-2);
}
.lifetime {
  padding-top: 0.2rem;
  font-size: 0.8rem;
}
</style>
