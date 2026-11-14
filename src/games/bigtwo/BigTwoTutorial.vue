<script setup lang="ts">
// 大老二互動教學：用和對局一樣的牌桌與動畫，一步一步出牌
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { playSound } from '@/core/audio'
import { PLAYER_LOOK } from '@/data/names'
import { S } from '@/data/strings'
import { RANK_LABELS, parseCards, rankOf, sortCards, suitOf, type Card } from '@/engine/bigtwo/cards'
import { canBeat, identifyCombo } from '@/engine/bigtwo/combos'
import { DEFAULT_BIGTWO_OPTIONS as OPTS } from '@/engine/bigtwo/options'
import Avatar from '@/ui/art/Avatar.vue'
import CardArt from '@/ui/art/Card.vue'
import Btn from '@/ui/Btn.vue'
import GuideNote from '@/ui/GuideNote.vue'
import IconBtn from '@/ui/IconBtn.vue'
import { CardStage } from './cardStage'
import { cardPoses, makeLayout, type Layout, type PileGroup } from './tableLayout'
import { BIGTWO_LESSONS } from './tutorialData'

const emit = defineEmits<{ exit: []; play: [] }>()
const T = S.bigtwo
const ALL: Card[] = Array.from({ length: 52 }, (_, i) => i)

const step = ref(0)
const solved = ref(false)
const misses = ref(0)
const finished = ref(false)
const hand = ref<Card[]>([])
const selected = ref<Card[]>([])
const pile = ref<PileGroup[]>([])
const olderPile = computed(() => new Set(pile.value.slice(0, -1).flatMap((g) => g.cards)))
const lesson = computed(() => BIGTWO_LESSONS[step.value])
const text = computed(() => T.tutorial[step.value])
const used = computed(() => new Set([...hand.value, ...pile.value.flatMap((g) => g.cards)]))
const comboName = computed(() => {
  const c = selected.value.length ? identifyCombo(selected.value, OPTS) : null
  return c ? T.combos[c.type] : ''
})

const stageEl = ref<HTMLElement>()
const layout = shallowRef<Layout>(makeLayout(844, 390))
const stage = new CardStage()
stage.onLand = () => playSound('card')
const ch = computed(() => (layout.value.cw * 108) / 78)
let groupId = 0

function sync(fly: Card[] = [], instant = false) {
  const poses = cardPoses(layout.value, { hands: [hand.value, [], [], []], selected: selected.value, pile: pile.value, discard: [], gathered: false })
  for (const c of ALL) {
    const p = poses.get(c)
    if (!p) continue
    const k = fly.indexOf(c)
    if (k >= 0) {
      const v = Math.random()
      stage.move(c, p, { delay: k * 120 + v * 50, dur: 420 * (0.88 + v * 0.3), arc: layout.value.cw * (0.6 + Math.random() * 0.6), flightZ: 600 + k, land: true, instant })
    }
    else stage.move(c, p, { dur: 240, instant })
  }
}

function load(n: number) {
  const l = BIGTWO_LESSONS[n]
  hand.value = sortCards(parseCards(l.hand), OPTS.suitOrder)
  pile.value = l.table ? [{ id: ++groupId, cards: parseCards(l.table), from: 2 }] : []
  selected.value = []
  solved.value = false
  misses.value = 0
  // 新的一步：手牌從下面滑進來、桌上的牌從上面丟過來
  for (const c of hand.value) stage.move(c, { x: layout.value.W / 2, y: layout.value.H + 120, r: 0, s: 1, f: 1, z: 300 }, { instant: true })
  for (const c of pile.value.flatMap((g) => g.cards)) stage.move(c, { x: layout.value.W / 2, y: -120, r: 0, s: 0.8, f: 1, z: 200 }, { instant: true })
  sync([...pile.value.flatMap((g) => g.cards)])
  hand.value.forEach((c, i) => {
    const p = cardPoses(layout.value, { hands: [hand.value, [], [], []], selected: [], pile: pile.value, discard: [], gathered: false }).get(c)!
    stage.move(c, p, { delay: 120 + i * 40, dur: 340, arc: 10 })
  })
}

let observer: ResizeObserver | undefined
onMounted(() => {
  const el = stageEl.value!
  const measure = () => {
    layout.value = makeLayout(el.clientWidth, el.clientHeight)
    sync([], true)
  }
  layout.value = makeLayout(el.clientWidth, el.clientHeight)
  load(0)
  observer = new ResizeObserver(measure)
  observer.observe(el)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  stage.destroy()
})

function tapCard(c: Card) {
  if (solved.value || !hand.value.includes(c)) return
  playSound('cardPick')
  selected.value = selected.value.includes(c) ? selected.value.filter((x) => x !== c) : [...selected.value, c]
  sync()
}

function miss() {
  misses.value++
  playSound('error')
}

function play() {
  const l = lesson.value
  const combo = identifyCombo(selected.value, OPTS)
  const table = l.table ? identifyCombo(parseCards(l.table), OPTS) : null
  let ok = !!combo && !l.pass
  if (ok && combo && table) ok = canBeat(combo, table, OPTS)
  if (ok && combo && l.type) ok = combo.type === l.type
  if (ok && l.exact) {
    const want = parseCards(l.exact)
    ok = want.length === selected.value.length && want.every((c) => selected.value.includes(c))
  }
  if (!ok) return miss()
  const cards = selected.value
  hand.value = hand.value.filter((c) => !cards.includes(c))
  pile.value = [...pile.value, { id: ++groupId, cards, from: 0 }]
  selected.value = []
  solved.value = true
  sync(cards)
}

function pass() {
  if (!lesson.value.pass) return miss()
  selected.value = []
  solved.value = true
  playSound('pass')
  sync()
}

function next() {
  if (step.value + 1 >= BIGTWO_LESSONS.length) {
    finished.value = true
    playSound('win')
    return
  }
  // 把這一步的牌收走
  const old = [...used.value]
  for (const c of old) stage.move(c, { x: layout.value.W / 2, y: -160, r: 20, s: 0.6, f: 0, z: 10 }, { dur: 300, delay: 0 })
  step.value++
  window.setTimeout(() => load(step.value), 260)
}
</script>

<template>
  <section ref="stageEl" class="tut">
    <div class="corner"><IconBtn icon="back" :label="S.common.back" @click="emit('exit')" /></div>

    <div class="guide">
      <GuideNote v-if="!finished" :step="step" :total="BIGTWO_LESSONS.length" :text="text.text" :ok="text.ok" :solved="solved" :misses="misses" />
      <div v-else class="done pop">
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
      :class="{ mine: hand.includes(c), sel: selected.includes(c), old: olderPile.has(c) }"
      :style="{ width: `${layout.cw}px`, height: `${ch}px`, marginLeft: `${-layout.cw / 2}px`, marginTop: `${-ch / 2}px` }"
      @click="tapCard(c)"
    >
      <svg class="face" viewBox="-2 -2 78 108" aria-hidden="true"><CardArt :rank="RANK_LABELS[rankOf(c)]" :suit="suitOf(c)" /></svg>
      <svg class="back" viewBox="-2 -2 78 108" aria-hidden="true"><CardArt back /></svg>
    </div>
    </div>

    <div class="me" :style="{ left: `${layout.seats[0].kid.x - layout.seats[0].kid.w / 2}px`, width: `${layout.seats[0].kid.w}px`, height: `${layout.seats[0].kid.w}px` }">
      <Avatar :look="PLAYER_LOOK" :mood="finished ? 'happy' : solved ? 'happy' : misses ? 'shock' : 'think'" />
    </div>
    <p class="combo t-black" :style="{ bottom: `${layout.cw * 1.62}px` }">{{ comboName }}</p>

    <div v-if="!finished" class="actions">
      <Btn v-if="solved" class="rise" tone="red" size="lg" arrow block @click="next">{{ step + 1 >= BIGTWO_LESSONS.length ? S.common.done : S.common.next }}</Btn>
      <template v-else>
        <Btn tone="red" size="lg" arrow block :disabled="!selected.length" @click="play">{{ T.play }}</Btn>
        <Btn icon="pass" block :disabled="!lesson.table" @click="pass">{{ T.pass }}</Btn>
      </template>
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
  left: max(0.8rem, env(safe-area-inset-left));
  top: max(0.6rem, env(safe-area-inset-top));
  z-index: 700;
}
.guide {
  position: absolute;
  right: max(1rem, env(safe-area-inset-right));
  top: 0.9rem;
  width: 18.5rem;
  z-index: 650;
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
  position: relative;
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
  cursor: pointer;
}
.sprite.sel::after {
  content: '';
  position: absolute;
  left: 8%;
  right: 4%;
  bottom: -10%;
  height: 6%;
  background: var(--color-yellow);
  border: 0.1rem solid var(--color-ink);
}
.me {
  position: absolute;
  bottom: 4px;
  pointer-events: none;
}
.me :deep(svg) {
  width: 100%;
  height: 100%;
}
.combo {
  position: absolute;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 1.1rem;
  pointer-events: none;
  z-index: 650;
}
.actions {
  position: absolute;
  right: max(1rem, env(safe-area-inset-right));
  bottom: 0.7rem;
  display: flex;
  width: 8.6rem;
  flex-direction: column;
  gap: 0.5rem;
  z-index: 700;
}
.sprite .face {
  transition: filter 360ms ease;
}
.sprite.old .face {
  filter: grayscale(1) brightness(0.93) contrast(0.85);
}
</style>
