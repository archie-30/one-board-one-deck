<script setup lang="ts">
// 猜拳決定先後手：你和對手面對面，出拳時兩個人一起甩手三下，然後亮出手勢。
import { ref } from 'vue'
import { playSound } from '@/core/audio'
import type { Opponent } from '@/core/opponents'
import { PLAYER_LOOK } from '@/data/names'
import { S } from '@/data/strings'
import { seedRng } from '@/engine/common/rng'
import { RPS_HANDS, randomRps, resolveRps, type RpsHand } from '@/engine/common/rps'
import Avatar from './art/Avatar.vue'
import Icon from './art/Icon.vue'
import type { Mood as KidMood } from './art/look'
import Btn from './Btn.vue'
import Dialog from './Dialog.vue'

defineProps<{ open: boolean; opponent: Opponent; lead?: string }>()
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
    playSound(outcome.value === 0 ? 'slide' : 'stone')
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
  <Dialog :open="open" :title="S.rps.title" label="ROCK · PAPER · SCISSORS" tone="blue" wide>
    <p class="text-[0.85rem] text-ink-2">{{ lead ?? S.rps.lead }}</p>
    <div class="duel">
      <div class="side">
        <span v-if="phase === 'show'" :key="`m${round}`" class="reveal pop"><Icon :name="mine" /></span>
        <span class="who" :class="{ shake: phase === 'shake' }"><Avatar :look="PLAYER_LOOK" :mood="moods[0]" /></span>
        <span class="t-black nm">{{ S.common.you }}</span>
      </div>
      <p class="verdict t-black" :class="{ win: phase === 'show' && outcome === 1 }">
        <span v-if="phase === 'show'" :key="`v${round}`" class="mask"><span>{{ outcome === 0 ? S.rps.draw : outcome === 1 ? S.rps.win : S.rps.lose(opponent.name) }}</span></span>
        <span v-else class="t-slab vs">{{ S.rps.vs }}</span>
      </p>
      <div class="side">
        <span v-if="phase === 'show'" :key="`t${round}`" class="reveal pop"><Icon :name="theirs" /></span>
        <span class="who" :class="{ shake: phase === 'shake' }"><Avatar :look="opponent.look" :mood="moods[1]" flip /></span>
        <span class="t-black nm">{{ opponent.name }}</span>
      </div>
    </div>
    <template #actions>
      <template v-if="phase !== 'show' || outcome === 0">
        <button v-for="hand in RPS_HANDS" :key="hand" class="hand" :disabled="phase !== 'pick'" @click="choose(hand)">
          <span class="ic"><Icon :name="hand" /></span>
          <span class="t-black">{{ S.rps[hand] }}</span>
        </button>
      </template>
      <Btn v-else class="rise" tone="red" size="lg" arrow @click="finish">{{ S.rps.go }}</Btn>
    </template>
  </Dialog>
</template>

<style scoped>
.duel {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 1.2rem;
  padding-top: 3.2rem;
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
  height: 4.6rem;
}
.who :deep(svg) {
  width: 100%;
  height: 100%;
}
.reveal {
  position: absolute;
  top: -2.6rem;
  width: 2.4rem;
  height: 2.4rem;
  padding: 0.35rem;
  border: 0.13rem solid var(--color-ink);
  background: var(--color-yellow);
  box-shadow: 0.15rem 0.15rem 0 var(--color-ink);
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
.vs {
  font-size: 2rem;
  color: var(--color-red);
}
.verdict {
  width: 13rem;
  padding-bottom: 1.6rem;
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
  border: 0.13rem solid var(--color-ink);
  background: var(--color-card);
  box-shadow: 0.2rem 0.2rem 0 var(--color-ink);
  padding: 0.4rem 0 0.2rem;
  font-size: 0.95rem;
  line-height: 1.3;
  transition: transform 140ms var(--ease-out);
}
.ic {
  display: block;
  width: 2.2rem;
  height: 2.2rem;
}
.ic :deep(svg) {
  width: 100%;
  height: 100%;
}
.hand:active:not(:disabled) {
  transform: translate(0.2rem, 0.2rem);
  box-shadow: none;
}
.hand:disabled {
  opacity: 0.4;
}
</style>
