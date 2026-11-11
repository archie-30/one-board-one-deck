<script setup lang="ts">
import { computed, ref } from 'vue'
import { playSound } from '@/core/audio'
import { S } from '@/data/strings'
import { parseCards, sortCards, type Card } from '@/engine/bigtwo/cards'
import { canBeat, identifyCombo } from '@/engine/bigtwo/combos'
import { DEFAULT_BIGTWO_OPTIONS as OPTS } from '@/engine/bigtwo/options'
import InkButton from '@/ui/InkButton.vue'
import InkIcon from '@/ui/InkIcon.vue'
import CardHand from './CardHand.vue'
import TablePlay from './TablePlay.vue'
import { BIGTWO_LESSONS } from './tutorialData'

const emit = defineEmits<{ exit: []; play: [] }>()
const T = S.bigtwo

const step = ref(0)
const selected = ref<Card[]>([])
const solved = ref(false)
const misses = ref(0)
const finished = ref(false)
const played = ref<Card[] | null>(null)

const lesson = computed(() => BIGTWO_LESSONS[step.value])
const text = computed(() => T.tutorial[step.value])
const table = computed(() => (lesson.value.table ? parseCards(lesson.value.table) : null))
const hand = computed(() => sortCards(parseCards(lesson.value.hand), OPTS.suitOrder).filter((c) => !played.value?.includes(c)))
const shown = computed(() => played.value ?? table.value)
const selectedName = computed(() => {
  const combo = selected.value.length ? identifyCombo(selected.value, OPTS) : null
  return combo ? T.combos[combo.type] : ''
})

function miss() {
  misses.value++
  playSound('error')
}

function play() {
  const l = lesson.value
  const combo = identifyCombo(selected.value, OPTS)
  const tableCombo = table.value ? identifyCombo(table.value, OPTS) : null
  let ok = !!combo && !l.pass
  if (ok && combo && tableCombo) ok = canBeat(combo, tableCombo, OPTS)
  if (ok && combo && l.type) ok = combo.type === l.type
  if (ok && l.exact) ok = parseCards(l.exact).every((c) => selected.value.includes(c)) && selected.value.length === parseCards(l.exact).length
  if (!ok) return miss()
  played.value = selected.value.slice()
  selected.value = []
  solved.value = true
  playSound('card')
}

function pass() {
  if (!lesson.value.pass) return miss()
  selected.value = []
  solved.value = true
  playSound('pass')
}

function next() {
  if (step.value + 1 >= BIGTWO_LESSONS.length) {
    finished.value = true
    playSound('win')
    return
  }
  step.value++
  selected.value = []
  played.value = null
  solved.value = false
  misses.value = 0
}
</script>

<template>
  <section class="flex h-full flex-col px-[max(1.4rem,env(safe-area-inset-left))] pt-[0.7rem] pb-[0.55rem]">
    <header class="flex shrink-0 items-center gap-[0.6rem]">
      <button class="back" :aria-label="S.common.back" @click="emit('exit')"><InkIcon name="back" class="h-[1.4rem] w-[1.4rem]" /></button>
      <h1 class="font-display text-[1.5rem] leading-none">{{ S.tutorial.title }}</h1>
      <span v-if="!finished" class="ml-auto text-[0.9rem] text-ink-soft tabular-nums">{{ S.tutorial.step(step + 1, BIGTWO_LESSONS.length) }}</span>
    </header>

    <div v-if="finished" class="rise flex flex-1 flex-col items-start justify-center gap-[0.6rem] pl-[2rem]">
      <p class="font-display text-[2.2rem] leading-tight">{{ S.tutorial.finish }}</p>
      <p class="text-ink-soft">{{ S.tutorial.finishLead }}</p>
      <div class="flex gap-[0.8rem] pt-[0.6rem]">
        <InkButton tone="red" size="lg" @click="emit('play')">{{ S.tutorial.play }}</InkButton>
        <InkButton :variant="1" size="lg" @click="emit('exit')">{{ S.common.back }}</InkButton>
      </div>
    </div>

    <template v-else>
      <div class="grid min-h-0 flex-1 grid-cols-12 items-center gap-[1rem]">
        <div :key="step" class="rise col-span-6">
          <p class="text-[1.02rem] leading-relaxed text-pretty">{{ text.text }}</p>
          <p v-if="solved" class="rise mt-[0.5rem] border-l-[0.25rem] border-leaf pl-[0.7rem] text-[0.98rem] leading-relaxed">{{ text.ok }}</p>
          <p v-else-if="misses > 0" :key="misses" class="rise mt-[0.5rem] text-[0.95rem] text-red">{{ S.tutorial.tryAgain }}</p>
        </div>
        <div class="col-span-6 h-full">
          <TablePlay :cards="shown" :from="played ? 0 : 2" />
        </div>
      </div>

      <div class="flex shrink-0 items-end justify-center gap-[1rem]">
        <p class="font-display w-[6.2rem] pb-[0.6rem] text-[1.1rem] text-leaf">{{ selectedName }}</p>
        <CardHand v-model:selected="selected" :cards="hand" :disabled="solved" :deal-key="step" />
        <div class="flex w-[6.2rem] flex-col gap-[0.5rem] pb-[0.2rem]">
          <InkButton v-if="solved" tone="leaf" @click="next">{{ step + 1 >= BIGTWO_LESSONS.length ? S.common.done : S.common.next }}</InkButton>
          <template v-else>
            <InkButton tone="red" :disabled="!selected.length" @click="play">{{ T.play }}</InkButton>
            <InkButton :variant="1" :disabled="!table" @click="pass">{{ T.pass }}</InkButton>
          </template>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.back {
  display: grid;
  place-items: center;
  width: 2.2rem;
  height: 2.2rem;
  margin-left: -0.4rem;
  border: 0;
  background: none;
}
</style>
