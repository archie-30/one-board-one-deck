<script setup lang="ts">
// 猜拳決定先後手：你和對手面對面，出拳時兩個人一起甩手三下，然後亮出手勢。
import { ref } from 'vue'
import { playSound } from '@/core/audio'
import type { Opponent } from '@/core/opponents'
import { PLAYER_LOOK } from '@/data/names'
import { S } from '@/data/strings'
import { seedRng } from '@/engine/common/rng'
import { RPS_HANDS, randomRps, resolveRps, type RpsHand } from '@/engine/common/rps'
import ArtKid from './art/ArtKid.vue'
import type { KidMood } from './art/kid'
import InkDialog from './InkDialog.vue'
import MenuButton from './MenuButton.vue'
import RpsIcon from './RpsIcon.vue'

defineProps<{ open: boolean; opponent: Opponent }>()
const emit = defineEmits<{ done: [playerWins: boolean] }>()

let rng = seedRng(Date.now())
const phase = ref<'pick' | 'shake' | 'show'>('pick')
const mine = ref<RpsHand>('rock')
const theirs = ref<RpsHand>('rock')
const outcome = ref<1 | 0 | -1>(0)
const moods = ref<[KidMood, KidMood]>(['idle', 'idle'])
const round = ref(0)

function choose(hand: RpsHand) {
  if (phase.value !== 'pick') return
  let cpu: RpsHand
  ;[cpu, rng] = randomRps(rng)
  mine.value = hand
  theirs.value = cpu
  outcome.value = resolveRps(hand, cpu)
  phase.value = 'shake'
  round.value++
  playSound('tap')
  window.setTimeout(() => {
    phase.value = 'show'
    playSound(outcome.value === 0 ? 'pass' : 'stone')
    moods.value = outcome.value === 0 ? ['shock', 'shock'] : outcome.value === 1 ? ['happy', 'sad'] : ['sad', 'happy']
    if (outcome.value === 0)
      window.setTimeout(() => {
        phase.value = 'pick'
        moods.value = ['idle', 'idle']
      }, 1100)
  }, 720)
}

function finish() {
  const win = outcome.value === 1
  phase.value = 'pick'
  moods.value = ['idle', 'idle']
  emit('done', win)
}
</script>

<template>
  <InkDialog :open="open" :title="S.rps.title" wide>
    <p class="text-center text-[0.92rem] text-ink-soft">{{ S.rps.lead }}</p>
    <div class="duel">
      <div class="side">
        <span v-if="phase === 'show'" :key="`m${round}`" class="reveal pop"><RpsIcon :hand="mine" /></span>
        <span class="who" :class="{ shake: phase === 'shake' }"><ArtKid :look="PLAYER_LOOK" :mood="moods[0]" :seed="7" /></span>
        <span class="font-display nm">{{ S.common.you }}</span>
      </div>
      <p class="verdict font-display" :class="{ win: phase === 'show' && outcome === 1 }">
        <template v-if="phase === 'show'">{{ outcome === 0 ? S.rps.draw : outcome === 1 ? S.rps.win : S.rps.lose(opponent.name) }}</template>
        <template v-else>{{ S.rps.vs }}</template>
      </p>
      <div class="side">
        <span v-if="phase === 'show'" :key="`t${round}`" class="reveal pop"><RpsIcon :hand="theirs" /></span>
        <span class="who" :class="{ shake: phase === 'shake' }"><ArtKid :look="opponent.look" :mood="moods[1]" :seed="opponent.id" flip /></span>
        <span class="font-display nm">{{ opponent.name }}</span>
      </div>
    </div>
    <template #actions>
      <template v-if="phase !== 'show' || outcome === 0">
        <button v-for="hand in RPS_HANDS" :key="hand" class="hand" :disabled="phase !== 'pick'" @click="choose(hand)">
          <span class="ic"><RpsIcon :hand="hand" /></span>
          <span class="font-display">{{ S.rps[hand] }}</span>
        </button>
      </template>
      <div v-else class="w-[11rem] pop"><MenuButton primary icon="play" size="md" :label="S.rps.go" :chevron="false" :seed="61" @click="finish" /></div>
    </template>
  </InkDialog>
</template>

<style scoped>
.duel {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 1.2rem;
  padding-top: 0.4rem;
}
.side {
  position: relative;
  display: flex;
  width: 6.5rem;
  flex-direction: column;
  align-items: center;
}
.who {
  display: block;
  width: 4.6rem;
  height: 6.5rem;
}
.who :deep(svg) {
  width: 100%;
  height: 100%;
}
.reveal {
  position: absolute;
  top: -1.8rem;
  width: 3rem;
  height: 3rem;
}
.reveal :deep(svg) {
  width: 100%;
  height: 100%;
}
.nm {
  font-size: 0.9rem;
}
.shake {
  animation: shake 240ms ease-in-out 3;
}
@keyframes shake {
  50% {
    transform: translateY(-0.5rem) rotate(-4deg);
  }
}
.verdict {
  width: 12rem;
  padding-bottom: 2.4rem;
  text-align: center;
  font-size: 1.2rem;
  line-height: 1.4;
}
.verdict.win {
  color: var(--color-red);
}
.hand {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 5.4rem;
  border: 0;
  background: none;
  font-size: 0.95rem;
  line-height: 1.3;
  transition: transform 140ms var(--ease-out);
}
.ic {
  display: block;
  width: 3.4rem;
  height: 3.4rem;
}
.ic :deep(svg) {
  width: 100%;
  height: 100%;
}
.hand:active:not(:disabled) {
  transform: scale(1.1) rotate(-4deg);
}
.hand:disabled {
  opacity: 0.4;
}
</style>
