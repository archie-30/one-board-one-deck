<script setup lang="ts">
// 猜拳決定先後手：你和對手面對面，出拳時兩個人一起甩手三下，然後亮出手勢。
// 分出勝負後結果停一下（約 1.3 秒）就自動開始，不用再按「開始」。
// 連線（remote）：自己出拳後送給伺服器，等兩邊都出了，伺服器把結果（remote.result）送回來才亮出手勢；時間到也由伺服器判。
import { onBeforeUnmount, ref, watch } from 'vue'
import { playSound } from '@/core/audio'
import type { Opponent } from '@/core/opponents'
import { myLook } from '@/core/profile'
import { S } from '@/data/strings'
import { seedRng } from '@/engine/common/rng'
import { RPS_HANDS, randomRps, resolveRps, type RpsHand } from '@/engine/common/rps'
import Avatar from './art/Avatar.vue'
import Icon from './art/Icon.vue'
import type { Mood as KidMood } from './art/look'
import Btn from './Btn.vue'
import Dialog from './Dialog.vue'
import TurnTimer from './TurnTimer.vue'

/** 連線猜拳：伺服器送來的結果（round 每次有新結果就加一）；mine／theirs 是 null＝那個人時間到沒出拳 */
export interface RemoteRps {
  round: number
  theirPicked: boolean
  result: { mine: RpsHand | null; theirs: RpsHand | null; outcome: 1 | 0 | -1 } | null
}
// seconds：要在幾秒內出拳（0 = 不計時），時間到沒出拳就算輸
const props = withDefaults(defineProps<{ open: boolean; opponent: Opponent; lead?: string; seconds?: number; remote?: RemoteRps | null }>(), { seconds: 0, remote: null })
const emit = defineEmits<{ done: [playerWins: boolean]; back: []; pick: [hand: RpsHand] }>()

let rng = seedRng(Date.now())
const phase = ref<'pick' | 'wait' | 'shake' | 'show'>('pick')
/** 連線：對方時間到沒出拳 */
const theyMissed = ref(false)
const mine = ref<RpsHand>('rock')
const theirs = ref<RpsHand>('rock')
const outcome = ref<1 | 0 | -1>(0)
const moods = ref<[KidMood, KidMood]>(['idle', 'idle'])
const round = ref(0)
const timedOut = ref(false)

/** 時間到還沒出拳：直接算輸 */
function timeout() {
  // 連線：時間到由伺服器判（結果會送回來）
  if (props.remote) return
  if (phase.value !== 'pick') return
  let cpu: RpsHand
  ;[cpu, rng] = randomRps(rng)
  theirs.value = cpu
  outcome.value = -1
  timedOut.value = true
  phase.value = 'show'
  round.value++
  playSound('error')
  moods.value = ['sad', 'happy']
  autoStart()
}

/** 結果停一下就自動開始 */
let startTimer = 0
function autoStart() {
  window.clearTimeout(startTimer)
  startTimer = window.setTimeout(finish, 1300)
}
onBeforeUnmount(() => window.clearTimeout(startTimer))

function choose(hand: RpsHand) {
  if (phase.value !== 'pick') return
  // 連線：送出去，等伺服器把兩邊的結果送回來
  if (props.remote) {
    mine.value = hand
    phase.value = 'wait'
    playSound('tap')
    emit('pick', hand)
    return
  }
  let cpu: RpsHand
  ;[cpu, rng] = randomRps(rng)
  reveal(hand, cpu, resolveRps(hand, cpu))
}
// 連線：伺服器送來這一輪的結果
watch(
  () => props.remote?.round,
  () => {
    const r = props.remote?.result
    if (!r) return
    theyMissed.value = r.theirs === null
    if (r.mine === null) {
      // 自己時間到沒出拳
      theirs.value = r.theirs ?? 'rock'
      outcome.value = -1
      timedOut.value = true
      phase.value = 'show'
      round.value++
      playSound('error')
      moods.value = ['sad', 'happy']
      autoStart()
      return
    }
    reveal(r.mine, r.theirs ?? 'rock', r.outcome)
  },
)
/** 兩個人一起甩手三下，然後亮出手勢 */
function reveal(hand: RpsHand, cpu: RpsHand, result: 1 | 0 | -1) {
  mine.value = hand
  theirs.value = cpu
  outcome.value = result
  phase.value = 'shake'
  round.value++
  playSound('tap')
  window.setTimeout(() => {
    phase.value = 'show'
    playSound('reveal')
    moods.value = outcome.value === 0 ? ['shock', 'shock'] : outcome.value === 1 ? ['happy', 'sad'] : ['sad', 'happy']
    if (outcome.value === 0)
      window.setTimeout(() => {
        phase.value = 'pick'
        moods.value = ['idle', 'idle']
      }, 1100)
    else autoStart()
  }, 720)
}

function finish() {
  window.clearTimeout(startTimer)
  if (phase.value !== 'show') return
  const win = outcome.value === 1
  timedOut.value = false
  theyMissed.value = false
  phase.value = 'pick'
  moods.value = ['idle', 'idle']
  emit('done', win)
}
</script>

<template>
  <Dialog :open="open" :title="S.rps.title" label="ROCK · PAPER · SCISSORS" tone="blue" wide>
    <p class="text-[0.85rem] text-ink-2">{{ lead ?? S.rps.lead }}</p>
    <TurnTimer v-if="props.seconds > 0" inline side="top" :active="phase === 'pick'" :paused="!open" :seconds="props.seconds" :turn-key="round" @timeout="timeout" />
    <div class="duel">
      <div class="side">
        <span v-if="phase === 'show' && !timedOut" :key="`m${round}`" class="reveal pop"><Icon :name="mine" /></span>
        <span class="who" :class="{ shake: phase === 'shake' }"><Avatar :look="myLook()" :mood="moods[0]" /></span>
        <span class="t-black nm">{{ S.common.you }}</span>
      </div>
      <p class="verdict t-black" :class="{ win: phase === 'show' && outcome === 1 }">
        <span v-if="phase === 'show'" :key="`v${round}`" class="mask"><span>{{ timedOut ? S.rps.timeout(opponent.name) : theyMissed ? S.rps.theyMissed(opponent.name) : outcome === 0 ? S.rps.draw : outcome === 1 ? S.rps.win : S.rps.lose(opponent.name) }}</span></span>
        <span v-else-if="phase === 'wait'" class="wait">{{ S.rps.waiting(opponent.name) }}</span>
        <span v-else class="t-slab vs">{{ S.rps.vs }}</span>
      </p>
      <div class="side">
        <span v-if="phase === 'show' && !theyMissed" :key="`t${round}`" class="reveal pop"><Icon :name="theirs" /></span>
        <span class="who" :class="{ shake: phase === 'shake' }"><Avatar :look="opponent.look" :mood="moods[1]" flip talk /></span>
        <span class="t-black nm">{{ opponent.name }}</span>
        <span v-if="remote?.theirPicked && (phase === 'pick' || phase === 'wait')" class="t-label picked">{{ S.rps.picked }}</span>
      </div>
    </div>
    <template #actions>
      <Btn class="back" data-back icon="back" size="sm" :disabled="phase !== 'pick'" @click="emit('back')">{{ S.common.resumeBack }}</Btn>
      <button v-for="hand in RPS_HANDS" :key="hand" class="hand" :disabled="phase !== 'pick'" @click="choose(hand)">
        <span class="ic"><Icon :name="hand" /></span>
        <span class="t-black">{{ S.rps[hand] }}</span>
      </button>
    </template>
  </Dialog>
</template>

<style scoped>
.wait {
  display: block;
  max-width: 7rem;
  font-size: 0.85rem;
  font-weight: 900;
  color: var(--color-ink-2);
  text-align: center;
  animation: breathe 1.4s ease-in-out infinite;
}
.picked {
  position: absolute;
  bottom: -1.1rem;
  color: var(--color-blue);
}
@keyframes breathe {
  50% {
    opacity: 0.45;
  }
}
.duel {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 1.2rem;
  /* 手勢放在頭像旁邊（不放頭上），手機橫拿高度不夠時也不會被裁掉 */
  padding: 0.4rem 0 0.2rem;
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
  width: 4rem;
  height: 4rem;
}
.who :deep(svg) {
  width: 100%;
  height: 100%;
}
.reveal {
  position: absolute;
  top: 0.3rem;
  left: -2.2rem;
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
.side + .verdict + .side .reveal {
  left: auto;
  right: -2.2rem;
}
.verdict {
  width: 13rem;
  padding-bottom: 1.4rem;
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
/* 按下時整顆往右下移；多一圈看不見的點擊範圍，放開的位置才不會落在按鈕外面（不然要按兩次） */
.hand {
  position: relative;
}
.hand::after {
  content: '';
  position: absolute;
  inset: -0.3rem;
}
.hand:active:not(:disabled) {
  transform: translate(0.2rem, 0.2rem);
  box-shadow: none;
}
.back {
  align-self: center;
  margin-right: 0.6rem;
}
.hand:disabled {
  opacity: 0.4;
}
</style>
