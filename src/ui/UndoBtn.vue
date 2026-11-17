<script setup lang="ts">
// 悔棋：每局一次，要按兩次才生效（第一次變成「再按一次悔棋」，2.5 秒內再按才真的悔棋）
// 連線時：
//   waiting：自己申請了、在等對方回答（按鈕反灰「等對方同意…」）
//   asked：對方要求悔棋 → 按鈕變成「對方要求悔棋，是否同意」，左半紅色「不同意」、右半綠色「同意」，下面 10 秒倒數條；時間到就當作不同意
import { onBeforeUnmount, ref, watch } from 'vue'
import { playSound } from '@/core/audio'
import { S } from '@/data/strings'
import Btn from './Btn.vue'

/** 對方要求悔棋時，幾毫秒內要回答 */
const ANSWER_MS = 10_000

const props = defineProps<{ disabled: boolean; used: boolean; waiting?: boolean; asked?: boolean }>()
const emit = defineEmits<{ undo: []; answer: [ok: boolean] }>()
const armed = ref(false)
let timer = 0
function press() {
  if (!armed.value) {
    armed.value = true
    window.clearTimeout(timer)
    timer = window.setTimeout(() => (armed.value = false), 2500)
    return
  }
  armed.value = false
  window.clearTimeout(timer)
  emit('undo')
}
watch(
  () => props.disabled,
  (d) => d && (armed.value = false),
)

// 對方要求悔棋：10 秒內沒回答就當作不同意
let answerTimer = 0
const askKey = ref(0)
watch(
  () => props.asked,
  (on) => {
    window.clearTimeout(answerTimer)
    if (!on) return
    askKey.value++
    playSound('tap')
    answerTimer = window.setTimeout(() => answer(false), ANSWER_MS)
  },
  { immediate: true },
)
function answer(ok: boolean) {
  window.clearTimeout(answerTimer)
  if (!props.asked) return
  playSound(ok ? 'tap' : 'pass')
  emit('answer', ok)
}
onBeforeUnmount(() => {
  window.clearTimeout(timer)
  window.clearTimeout(answerTimer)
})
</script>

<template>
  <div v-if="asked" :key="askKey" class="ask pop">
    <p class="ask-q t-black">{{ S.common.undoAsk }}</p>
    <div class="ask-row">
      <button class="half no" @click="answer(false)">{{ S.common.undoRefuse }}</button>
      <button class="half yes" @click="answer(true)">{{ S.common.undoAgree }}</button>
    </div>
    <span class="bar" :style="{ '--ms': `${ANSWER_MS}ms` }" />
  </div>
  <Btn v-else size="sm" icon="back" :tone="armed ? 'yellow' : 'plain'" :disabled="disabled || used || waiting" @click="press">{{ used ? S.common.undoUsed : waiting ? S.common.undoWaiting : armed ? S.common.undoConfirm : S.common.undo }}</Btn>
</template>

<style scoped>
/* 對方要求悔棋：一顆按鈕分成左右兩半（左紅不同意、右綠同意），下面一條 10 秒倒數條 */
.ask {
  position: relative;
  width: 100%;
  border: 0.13rem solid var(--color-ink);
  background: var(--color-card);
  box-shadow: 0.2rem 0.2rem 0 var(--color-ink);
}
.ask-q {
  padding: 0.25rem 0.4rem 0.2rem;
  font-size: 0.68rem;
  line-height: 1.25;
  text-align: center;
}
.ask-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border-top: 0.13rem solid var(--color-ink);
}
.half {
  height: 2rem;
  font-size: 0.85rem;
  font-weight: 900;
  color: var(--color-card);
  transition: filter 120ms ease;
}
.half:active {
  filter: brightness(0.85);
}
.half.no {
  background: var(--color-red);
  border-right: 0.13rem solid var(--color-ink);
}
.half.yes {
  background: var(--color-green);
}
.bar {
  position: absolute;
  left: 0;
  bottom: -0.45rem;
  height: 0.2rem;
  width: 100%;
  background: var(--color-ink);
  transform-origin: left;
  animation: drain var(--ms) linear forwards;
}
@keyframes drain {
  to {
    transform: scaleX(0);
  }
}
@media (prefers-reduced-motion: reduce) {
  .bar {
    animation: none;
  }
}
</style>
