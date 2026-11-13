<script setup lang="ts">
// 撿紅點互動教學：和對局一樣的牌桌與動畫，一步一步練習配對、挑紅牌、墊牌、翻牌
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { playSound } from '@/core/audio'
import { PLAYER_LOOK } from '@/data/names'
import { S } from '@/data/strings'
import { RANK_LABELS, parseCard, parseCards, rankOf, suitOf, type Card } from '@/engine/bigtwo/cards'
import { applyRedPoint, createRedPoint, matches, targetsFor, type RedPointState } from '@/engine/redpoint/rules'
import Avatar from '@/ui/art/Avatar.vue'
import CardArt from '@/ui/art/Card.vue'
import Btn from '@/ui/Btn.vue'
import GuideNote from '@/ui/GuideNote.vue'
import IconBtn from '@/ui/IconBtn.vue'
import { CardStage, type Pose } from '../bigtwo/cardStage'
import { makeLayout, type Layout } from '../bigtwo/tableLayout'
import { onTop, rpPoses, rpSpots } from './layout'
import { REDPOINT_LESSONS } from './tutorialData'

const emit = defineEmits<{ exit: []; play: [] }>()
const T = S.redpoint
const ALL: Card[] = Array.from({ length: 52 }, (_, i) => i)

const step = ref(0)
const solved = ref(false)
const misses = ref(0)
const finished = ref(false)
const busy = ref(false)
const selected = ref<Card | null>(null)
const state = shallowRef<RedPointState>(build(0))
const staged = new Map<Card, Pose>()
const lesson = computed(() => REDPOINT_LESSONS[step.value])
const text = computed(() => T.tutorial[step.value])
const used = computed(() => new Set([...state.value.hands[0], ...state.value.table, ...state.value.pile, ...state.value.captured[0]]))
const hits = computed(() => (selected.value !== null ? targetsFor(state.value, selected.value) : []))

function build(n: number): RedPointState {
  const l = REDPOINT_LESSONS[n]
  return createRedPoint([parseCards(l.hand), [], [], []], parseCards(l.table), l.pile ? parseCards(l.pile) : [], 0)
}

const stageEl = ref<HTMLElement>()
const layout = shallowRef<Layout>(makeLayout(844, 390))
const spots = computed(() => rpSpots(layout.value))
const stage = new CardStage()
stage.onLand = () => playSound('card')
const ch = computed(() => (layout.value.cw * 108) / 78)
const timers = new Set<number>()
const wait = (ms: number) =>
  new Promise<void>((r) => {
    const id = window.setTimeout(() => {
      timers.delete(id)
      r()
    }, ms)
    timers.add(id)
  })

function poses() {
  const s = state.value
  const map = rpPoses(layout.value, { hands: s.hands, table: s.table, pile: s.pile, captured: s.captured, selected: selected.value, gathered: false, salt: step.value * 131 })
  for (const [c, p] of staged) map.set(c, p)
  return map
}
function sync(fly: Card[] = [], instant = false) {
  const map = poses()
  for (const c of ALL) {
    const p = map.get(c)
    if (!p) continue
    const k = fly.indexOf(c)
    if (k >= 0) {
      const v = Math.random()
      stage.move(c, p, { delay: k * 110 + v * 40, dur: 420 * (0.88 + v * 0.3), arc: layout.value.cw * (0.4 + Math.random() * 0.6), flightZ: 600 + k, land: true, instant })
    }
    else stage.move(c, p, { dur: 240, instant })
  }
}

let observer: ResizeObserver | undefined
onMounted(() => {
  const el = stageEl.value!
  layout.value = makeLayout(el.clientWidth, el.clientHeight)
  enter()
  observer = new ResizeObserver(() => {
    layout.value = makeLayout(el.clientWidth, el.clientHeight)
    sync([], true)
  })
  observer.observe(el)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  stage.destroy()
  timers.forEach((t) => window.clearTimeout(t))
})

/** 新的一步：手牌從下面、桌上的牌從上面飛進來 */
function enter() {
  const { W, H } = layout.value
  const s = state.value
  for (const c of s.hands[0]) stage.move(c, { x: W / 2, y: H + 140, r: 0, s: 1, f: 1, z: 300 }, { instant: true })
  for (const c of [...s.table, ...s.pile]) stage.move(c, { x: W / 2, y: -140, r: 0, s: 0.8, f: 0, z: 200 }, { instant: true })
  sync([...s.table, ...s.pile, ...s.hands[0]])
}

function tapCard(c: Card) {
  if (busy.value || solved.value) return
  const s = state.value
  if (s.hands[0].includes(c)) {
    playSound('tap')
    selected.value = selected.value === c ? null : c
    sync()
  } else if (selected.value !== null && s.table.includes(c) && matches(selected.value, c)) void play(selected.value, c)
}

function playSelected() {
  if (selected.value === null || busy.value) return
  const t = hits.value
  if (t.length >= 2) {
    misses.value++
    playSound('error')
    return
  }
  void play(selected.value, t[0])
}

async function play(card: Card, target: Card | undefined) {
  const l = lesson.value
  const ok = card === parseCard(l.card) && (l.target ? target === parseCard(l.target) : target === undefined)
  if (!ok) {
    misses.value++
    selected.value = null
    playSound('error')
    sync()
    return
  }
  busy.value = true
  selected.value = null
  if (target !== undefined) {
    staged.set(card, onTop(poses().get(target)!))
    sync([card])
    await wait(560)
  }
  staged.delete(card)
  const r = applyRedPoint(state.value, { type: 'play', player: 0, card, target })
  if (!r.ok) return
  state.value = r.state
  sync(target !== undefined ? [card, target] : [card])
  await wait(560)
  if (state.value.phase === 'flip') {
    const top = state.value.pile[0]
    staged.set(top, { x: spots.value.reveal.x, y: spots.value.reveal.y, r: 4, s: 0.95, f: 1, z: 650 })
    sync([top])
    await wait(650)
    const t = targetsFor(state.value, top)[0]
    if (t !== undefined) {
      staged.set(top, onTop(poses().get(t)!))
      sync([top])
      await wait(460)
    }
    staged.delete(top)
    const f = applyRedPoint(state.value, { type: 'flip', player: 0 })
    if (f.ok) state.value = f.state
    sync(t !== undefined ? [top, t] : [top])
    await wait(400)
  }
  solved.value = true
  busy.value = false
}

async function next() {
  if (step.value + 1 >= REDPOINT_LESSONS.length) {
    finished.value = true
    playSound('win')
    return
  }
  const { W } = layout.value
  for (const c of used.value) stage.move(c, { x: W / 2, y: -180, r: 20, s: 0.6, f: 0, z: 10 }, { dur: 300 })
  await wait(260)
  step.value++
  solved.value = false
  misses.value = 0
  state.value = build(step.value)
  enter()
}
</script>

<template>
  <section ref="stageEl" class="tut">
    <div class="corner"><IconBtn icon="back" :label="S.common.back" @click="emit('exit')" /></div>
    <div class="table-box" :style="{ left: `${spots.box.x}px`, top: `${spots.box.y}px`, width: `${spots.box.w}px`, height: `${spots.box.h}px` }" />

    <div class="guide">
      <GuideNote v-if="!finished" :step="step" :total="REDPOINT_LESSONS.length" :text="text.text" :ok="text.ok" :solved="solved" :misses="misses" />
      <div v-else class="done">
        <h2 class="t-black text-[2.4rem] leading-tight"><span class="mask"><span>{{ S.tutorial.finish }}</span></span></h2>
        <p class="text-ink-2">{{ S.tutorial.finishLead }}</p>
        <div class="mt-[0.8rem] flex w-[12rem] flex-col gap-[0.5rem]">
          <Btn tone="red" size="lg" arrow block @click="emit('play')">{{ S.tutorial.play }}</Btn>
          <Btn icon="back" size="sm" block @click="emit('exit')">{{ S.common.back }}</Btn>
        </div>
      </div>
    </div>

    <div class="cards">
      <div
        v-for="c in ALL"
        v-show="used.has(c)"
        :key="c"
        :ref="(el) => stage.attach(c, el as HTMLElement | null)"
        class="sprite"
        :class="{ mine: state.hands[0].includes(c), sel: selected === c, hit: hits.includes(c) }"
        :style="{ width: `${layout.cw}px`, height: `${ch}px`, marginLeft: `${-layout.cw / 2}px`, marginTop: `${-ch / 2}px` }"
        @click="tapCard(c)"
      >
        <svg class="face" viewBox="-2 -2 78 108" aria-hidden="true"><CardArt :rank="RANK_LABELS[rankOf(c)]" :suit="suitOf(c)" /></svg>
        <svg class="back" viewBox="-2 -2 78 108" aria-hidden="true"><CardArt back /></svg>
      </div>
    </div>

    <div class="me" :style="{ left: `${layout.seats[0].kid.x - layout.seats[0].kid.w / 2}px`, width: `${layout.seats[0].kid.w}px`, height: `${layout.seats[0].kid.w}px` }">
      <Avatar :look="PLAYER_LOOK" :mood="finished || solved ? 'happy' : misses ? 'shock' : 'think'" />
    </div>

    <div v-if="!finished" class="actions">
      <Btn v-if="solved" class="rise" tone="red" size="lg" arrow block @click="next">{{ step + 1 >= REDPOINT_LESSONS.length ? S.common.done : S.common.next }}</Btn>
      <Btn v-else tone="red" size="lg" arrow block :disabled="selected === null || busy" @click="playSelected">{{ T.play }}</Btn>
    </div>
  </section>
</template>

<style scoped>
.tut {
  position: relative;
  height: 100%;
  overflow: hidden;
}
.corner {
  position: absolute;
  left: max(0.9rem, env(safe-area-inset-left));
  top: max(0.7rem, env(safe-area-inset-top));
  z-index: 700;
}
.table-box {
  position: absolute;
  border-radius: 1.4rem;
  background: var(--color-felt);
  box-shadow: inset 0 1px 3px rgb(23 23 26 / 0.06);
}
.guide {
  position: absolute;
  right: max(1rem, env(safe-area-inset-right));
  top: 0.8rem;
  width: 17rem;
  z-index: 650;
}
.done {
  padding-top: 2rem;
}
.cards {
  position: absolute;
  inset: 0;
  isolation: isolate;
  z-index: 1;
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
.sprite.mine,
.sprite.hit {
  cursor: pointer;
}
.sprite.sel::after {
  content: '';
  position: absolute;
  left: 8%;
  right: 4%;
  bottom: -10%;
  height: 4%;
  border-radius: 999px;
  background: var(--color-red);
}
.sprite.hit::before {
  content: '';
  position: absolute;
  inset: -6% -8%;
  border-radius: 12%;
  box-shadow: 0 0 0 0.2rem var(--color-yellow), 0 0 1.2rem rgb(255 203 47 / 0.7);
  animation: hit 0.9s ease-in-out infinite;
  pointer-events: none;
}
@keyframes hit {
  50% {
    transform: translateY(-6%);
  }
}
.me {
  position: absolute;
  bottom: 8px;
  z-index: 2;
  pointer-events: none;
}
.me :deep(svg) {
  width: 100%;
  height: 100%;
}
.actions {
  position: absolute;
  right: max(1rem, env(safe-area-inset-right));
  bottom: 0.7rem;
  width: 8.4rem;
  z-index: 700;
}
</style>
