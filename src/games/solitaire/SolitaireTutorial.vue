<script setup lang="ts">
// 接龍互動教學：每一課一個小牌桌，照著提示做一步就過關
import { computed, ref, shallowRef } from 'vue'
import { playSound } from '@/core/audio'
import { S } from '@/data/strings'
import { applySolitaire, type SolitaireAction, type SolitaireState } from '@/engine/solitaire/rules'
import Btn from '@/ui/Btn.vue'
import GuideNote from '@/ui/GuideNote.vue'
import IconBtn from '@/ui/IconBtn.vue'
import SolitaireTable from './SolitaireTable.vue'
import { SOL_LESSONS } from './tutorialData'

const emit = defineEmits<{ exit: []; play: [] }>()
const T = S.solitaire

const step = ref(0)
const solved = ref(false)
const misses = ref(0)
const finished = ref(false)
const state = shallowRef<SolitaireState>(SOL_LESSONS[0].build())
const dealKey = ref(0)

const lesson = computed(() => SOL_LESSONS[step.value])
const text = computed(() => T.tutorial[step.value])
const hinted = computed(() => (solved.value || finished.value ? { cards: [], spot: null } : lesson.value.hint(state.value)))

function act(a: SolitaireAction) {
  if (solved.value) return
  const r = applySolitaire(state.value, a)
  if (!r.ok) {
    misses.value++
    playSound('error')
    return
  }
  state.value = r.state
  if (lesson.value.done(r.state)) {
    solved.value = true
    playSound('win')
  } else if (a.type === 'draw') playSound('deal')
}

function next() {
  if (step.value + 1 >= SOL_LESSONS.length) {
    finished.value = true
    return
  }
  step.value++
  solved.value = false
  misses.value = 0
  state.value = lesson.value.build()
  dealKey.value++
}
</script>

<template>
  <section class="st">
    <SolitaireTable :state="state" :deal-key="dealKey" :deal-in="false" :interactive="!solved && !finished" :hint-cards="hinted.cards" :hint-spot="hinted.spot" @action="act" @invalid="misses++">
      <template #default="{ layout: L }">
        <div class="guide" :style="{ left: `${L.cols[0].x - L.cw / 2}px`, width: `${L.cols[6].x - L.cols[0].x + L.cw}px`, top: `${L.cols[0].y + L.ch * 1.55}px` }">
          <div class="note">
            <GuideNote v-if="!finished" :step="step" :total="SOL_LESSONS.length" :text="text.text" :ok="text.ok" :solved="solved" :misses="misses" />
            <div v-else>
              <h2 class="t-black text-[2rem] leading-tight"><span class="mask"><span>{{ S.tutorial.finish }}</span></span></h2>
              <p class="text-ink-2">{{ S.tutorial.finishLead }}</p>
            </div>
          </div>
          <div class="act">
            <template v-if="finished">
              <Btn tone="red" size="lg" arrow block @click="emit('play')">{{ S.tutorial.play }}</Btn>
              <Btn icon="back" size="sm" block @click="emit('exit')">{{ S.common.back }}</Btn>
            </template>
            <Btn v-else-if="solved" class="rise" tone="red" size="lg" arrow block @click="next">{{ step + 1 >= SOL_LESSONS.length ? S.common.done : S.common.next }}</Btn>
          </div>
        </div>
      </template>
    </SolitaireTable>
    <div class="corner"><IconBtn icon="back" :label="S.common.back" @click="emit('exit')" /></div>
  </section>
</template>

<style scoped>
.st {
  position: relative;
  height: 100%;
}
.corner {
  position: absolute;
  left: max(0.9rem, env(safe-area-inset-left));
  top: max(0.7rem, env(safe-area-inset-top));
  z-index: 700;
}
.guide {
  position: absolute;
  bottom: 0.8rem;
  z-index: 5;
  display: flex;
  align-items: flex-end;
  gap: 1rem;
}
.note {
  min-width: 0;
  flex: 1;
  align-self: stretch;
  overflow: auto;
}
.act {
  display: flex;
  width: 9rem;
  flex-shrink: 0;
  flex-direction: column;
  gap: 0.5rem;
}
</style>
