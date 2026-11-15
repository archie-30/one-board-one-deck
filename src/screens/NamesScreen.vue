<script setup lang="ts">
// 幫電腦取名字：20 位對手各一格。改完（離開輸入框或按 Enter）就存；留空＝用預設名字；不能跟別人重複。
// 恢復預設：有改過的名字，字一個個從下面翻上來換成預設名字（由上往下一格格接著換）。
import { onBeforeUnmount, ref, watch } from 'vue'
import { playSound } from '@/core/audio'
import { reducedMotion } from '@/core/motion'
import { opponentNames, resetOpponentNames, setOpponentName } from '@/core/names'
import { NAME_MAX_WIDTH } from '@/data/namePool'
import { OPPONENTS } from '@/data/names'
import { S } from '@/data/strings'
import Avatar from '@/ui/art/Avatar.vue'
import Btn from '@/ui/Btn.vue'
import Page from '@/ui/Page.vue'

const drafts = ref<string[]>(opponentNames.names.slice())
watch(
  () => opponentNames.names.slice(),
  (v) => (drafts.value = v),
)
/** 哪一格剛剛跟別人重複（顯示紅框與提示） */
const clash = ref(-1)
let clashTimer = 0

function commit(i: number) {
  if (drafts.value[i] === opponentNames.names[i]) return
  if (setOpponentName(i, drafts.value[i]) === 'duplicate') {
    clash.value = i
    playSound('error')
    window.clearTimeout(clashTimer)
    clashTimer = window.setTimeout(() => (clash.value = -1), 2200)
  } else if (clash.value === i) clash.value = -1
  drafts.value[i] = opponentNames.names[i]
}
/** 恢復預設時正在換字的格子（第幾個開始換） */
const swapping = ref(new Map<number, number>())
const swapKey = ref(0)
let swapTimer = 0
function reset() {
  const before = opponentNames.names.slice()
  resetOpponentNames()
  clash.value = -1
  const changed = opponentNames.names.map((n, i) => (n !== before[i] ? i : -1)).filter((i) => i >= 0)
  if (!changed.length || reducedMotion()) return
  swapping.value = new Map(changed.map((i, order) => [i, order]))
  swapKey.value++
  window.clearTimeout(swapTimer)
  swapTimer = window.setTimeout(() => (swapping.value = new Map()), changed.length * 60 + 6 * 45 + 420)
}
onBeforeUnmount(() => window.clearTimeout(swapTimer))
</script>

<template>
  <Page :title="S.names.title" label="OPPONENTS" num="20">
    <div class="scroll-y h-full pr-[0.8rem]">
      <ul class="grid">
        <li v-for="(o, i) in OPPONENTS" :key="i" class="row rise" :class="{ clash: clash === i }" :style="{ '--i': Math.min(i, 8) * 0.5 }">
          <span class="av"><Avatar :look="o.look" /></span>
          <label class="field">
            <span class="t-label no">{{ String(i + 1).padStart(2, '0') }} · {{ o.tag }}</span>
            <span class="box">
            <input
              v-model="drafts[i]"
              :class="{ hide: swapping.has(i) }"
              class="t-black"
              type="text"
              :maxlength="NAME_MAX_WIDTH"
              :placeholder="S.names.auto"
              enterkeyhint="done"
              autocomplete="off"
              spellcheck="false"
              @blur="commit(i)"
              @keydown.enter="($event.target as HTMLInputElement).blur()"
            />
            <!-- 恢復預設：新名字一個字一個字從下面翻上來 -->
            <span v-if="swapping.has(i)" :key="`sw${swapKey}`" class="swap t-black" aria-hidden="true">
              <span v-for="(ch, k) in [...opponentNames.names[i]]" :key="k" class="ch" :style="{ '--d': `${swapping.get(i)! * 60 + k * 45}ms` }">{{ ch }}</span>
            </span>
            </span>
          </label>
          <span v-if="clash === i" class="warn">{{ S.names.duplicate }}</span>
        </li>
      </ul>
    </div>
    <template #foot>
      <p class="text-[0.75rem] text-ink-2">{{ S.names.note }}</p>
      <Btn icon="again" size="sm" @click="reset">{{ S.names.reset }}</Btn>
    </template>
  </Page>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(11.5rem, 1fr));
  gap: 0.6rem 1rem;
  padding: 0.2rem 0.2rem 0.6rem;
}
.row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.55rem;
}
.av {
  display: block;
  width: 2.4rem;
  height: 2.4rem;
  flex: none;
}
.av :deep(svg) {
  width: 100%;
  height: 100%;
}
.field {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}
.no {
  font-size: 0.62rem;
  color: var(--color-ink-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.box {
  position: relative;
  display: block;
}
input {
  width: 100%;
  border: 0.13rem solid var(--color-ink);
  background: var(--color-card);
  box-shadow: 0.15rem 0.15rem 0 var(--color-ink);
  padding: 0.15rem 0.45rem;
  font-size: 1rem;
  outline: none;
}
input:focus {
  box-shadow: 0.15rem 0.15rem 0 var(--color-blue);
  border-color: var(--color-blue);
}
input::placeholder {
  color: var(--color-ink-3);
  font-weight: 500;
}
input.hide {
  color: transparent;
}
.swap {
  position: absolute;
  inset: 0.13rem;
  display: flex;
  align-items: center;
  overflow: hidden;
  padding: 0 0.32rem;
  font-size: 1rem;
  pointer-events: none;
}
.ch {
  display: inline-block;
  white-space: pre;
  animation: ch-up 380ms var(--ease-back) var(--d) both;
}
@keyframes ch-up {
  from {
    opacity: 0;
    transform: translateY(110%) rotate(8deg);
  }
}
.clash input {
  border-color: var(--color-red);
  animation: nudge 260ms ease-in-out 2;
}
.warn {
  position: absolute;
  right: 0.2rem;
  bottom: -0.95rem;
  font-size: 0.65rem;
  color: var(--color-red);
}
@keyframes nudge {
  25% {
    transform: translateX(-0.2rem);
  }
  75% {
    transform: translateX(0.2rem);
  }
}
@media (prefers-reduced-motion: reduce) {
  .clash input {
    animation: none;
  }
}
</style>
