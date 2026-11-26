<script setup lang="ts">
// 金字塔接龍互動教學：每一課一個小金字塔，照著提示做一步就過關
import { computed, ref, shallowRef } from 'vue'
import { playSound } from '@/core/audio'
import { online } from '@/core/online'
import { S } from '@/data/strings'
import { applyPyramid, type PyramidAction, type PyramidState } from '@/engine/pyramid/rules'
import Btn from '@/ui/Btn.vue'
import GuideNote from '@/ui/GuideNote.vue'
import IconBtn from '@/ui/IconBtn.vue'
import PyramidTable from './PyramidTable.vue'
import { PYRAMID_LESSONS as SOL_LESSONS } from './tutorialData'

const emit = defineEmits<{ exit: []; play: []; rules: [] }>()
const T = S.pyramid

const step = ref(0)
const solved = ref(false)
const misses = ref(0)
const finished = ref(false)
const state = shallowRef<PyramidState>(SOL_LESSONS[0].build())
const dealKey = ref(0)

const lesson = computed(() => SOL_LESSONS[step.value])
const text = computed(() => T.tutorial[step.value])
const hinted = computed(() => (solved.value || finished.value ? { cards: [], stock: false } : lesson.value.hint(state.value)))

function act(a: PyramidAction) {
  if (solved.value) return
  const r = applyPyramid(state.value, a)
  if (!r.ok) {
    misses.value++
    playSound('error')
    return
  }
  state.value = r.state
  if (lesson.value.done(r.state)) {
    solved.value = true
    playSound('correct')
  } else if (a.type === 'draw') playSound('flip')
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
    <PyramidTable :state="state" :deal-key="dealKey" :deal-in="false" :interactive="!solved && !finished" :hint-cards="hinted.cards" :hint-stock="hinted.stock" @action="act" @invalid="misses++">
      <template #default="{ layout: L }">
        <div class="guide" :style="{ left: `${L.stock.x + L.cw}px`, width: `${L.W - L.stock.x - L.cw - 14}px`, top: '0.8rem', bottom: 'auto' }">
          <div class="note">
            <GuideNote v-if="!finished" :step="step" :total="SOL_LESSONS.length" :text="text.text" :ok="text.ok" :solved="solved" :misses="misses" />
            <div v-else>
              <h2 class="t-black text-[2rem] leading-tight"><span class="mask"><span>{{ S.tutorial.finish }}</span></span></h2>
              <p class="text-ink-2">{{ S.tutorial.finishLead }}</p>
            </div>
          </div>
          <div class="act">
            <template v-if="finished">
              <!-- 在連線房間裡不能自己開局（開始要在房間裡大家準備） -->
          <Btn v-if="!online.room" tone="red" size="lg" arrow block @click="emit('play')">{{ S.tutorial.play }}</Btn>
              <Btn icon="book" size="sm" block @click="emit('rules')">{{ S.tutorial.rules }}</Btn>
              <Btn icon="back" size="sm" block @click="emit('exit')">{{ S.common.back }}</Btn>
            </template>
            <Btn v-else-if="solved" class="rise" tone="red" size="lg" arrow block @click="next">{{ step + 1 >= SOL_LESSONS.length ? S.common.done : S.common.next }}</Btn>
          </div>
        </div>
      </template>
    </PyramidTable>
    <div class="corner"><IconBtn icon="back" :label="S.common.back" @click="emit('exit')" /></div>
  </section>
</template>

<style scoped>
.st {
  position: relative;
  height: 100%;
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
