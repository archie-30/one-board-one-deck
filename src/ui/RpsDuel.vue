<script setup lang="ts">
// 猜拳決定先後手。出拳後雙方的手勢並排亮出來。
import { ref } from 'vue'
import { playSound } from '@/core/audio'
import { S } from '@/data/strings'
import { seedRng } from '@/engine/common/rng'
import { RPS_HANDS, randomRps, resolveRps, type RpsHand } from '@/engine/common/rps'
import type { Opponent } from '@/core/opponents'
import ArtBuddy from './art/ArtBuddy.vue'
import InkButton from './InkButton.vue'
import InkDialog from './InkDialog.vue'
import RpsIcon from './RpsIcon.vue'

defineProps<{ open: boolean; opponent: Opponent }>()
const emit = defineEmits<{ done: [playerWins: boolean] }>()

let rng = seedRng(Date.now())
const mine = ref<RpsHand | null>(null)
const theirs = ref<RpsHand | null>(null)
const outcome = ref<1 | 0 | -1 | null>(null)
const round = ref(0)

function choose(hand: RpsHand) {
  if (outcome.value !== null && outcome.value !== 0) return
  let cpu: RpsHand
  ;[cpu, rng] = randomRps(rng)
  mine.value = hand
  theirs.value = cpu
  outcome.value = resolveRps(hand, cpu)
  round.value++
  playSound(outcome.value === 0 ? 'pass' : 'stone')
}

function finish() {
  const win = outcome.value === 1
  mine.value = theirs.value = outcome.value = null
  emit('done', win)
}
</script>

<template>
  <InkDialog :open="open" :title="S.rps.title" wide>
    <p class="text-center text-[0.95rem] text-ink-soft">{{ S.rps.lead }}</p>

    <div class="flex h-[7.2rem] items-center justify-center gap-[1.6rem]">
      <template v-if="mine && theirs">
        <div :key="`m${round}`" class="shown from-left">
          <RpsIcon :hand="mine" class="h-[4.4rem] w-[4.4rem]" />
          <span>{{ S.common.you }}</span>
        </div>
        <p :key="`r${round}`" class="font-display verdict w-[15rem] text-center text-[1.3rem] leading-snug" :class="{ win: outcome === 1 }">
          {{ outcome === 0 ? S.rps.draw : outcome === 1 ? S.rps.win : S.rps.lose(opponent.name) }}
        </p>
        <div :key="`t${round}`" class="shown from-right">
          <span class="flex items-end"><RpsIcon :hand="theirs" class="h-[4.4rem] w-[4.4rem]" /><ArtBuddy :look="opponent.look" class="h-[3.4rem] w-[3.2rem]" /></span>
          <span>{{ opponent.name }}</span>
        </div>
      </template>
    </div>

    <template #actions>
      <template v-if="outcome === null || outcome === 0">
        <button v-for="hand in RPS_HANDS" :key="hand" class="hand" @click="choose(hand)">
          <RpsIcon :hand="hand" class="h-[4rem] w-[4rem]" />
          <span class="font-display">{{ S.rps[hand] }}</span>
        </button>
      </template>
      <InkButton v-else tone="red" size="lg" @click="finish">{{ S.rps.go }}</InkButton>
    </template>
  </InkDialog>
</template>

<style scoped>
.hand {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 6rem;
  border: 0;
  background: none;
  padding: 0.3rem 0 0.2rem;
  font-weight: 800;
  font-size: 1rem;
  line-height: 1.4;
  transition: transform 110ms var(--ease-out);
}
.hand:active {
  transform: scale(1.08) rotate(-1.2deg);
}
.shown {
  display: flex;
  flex-direction: column;
  align-items: center;
  font-size: 0.85rem;
  animation: show 260ms var(--ease-out) both;
}
.from-left {
  --from: -1.4rem;
}
.from-right {
  --from: 1.4rem;
}
@keyframes show {
  from {
    opacity: 0;
    transform: translateX(var(--from)) scale(0.95);
  }
}
.verdict {
  animation: rise 260ms var(--ease-out) 140ms both;
}
.verdict.win {
  color: var(--color-red);
}
</style>
