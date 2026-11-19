<script setup lang="ts">
// 九九互動教學：八關，數字牌和每一種功能牌都試一次（數字牌不超過 99、4 迴轉、5 指定、10 減、J PASS、Q 減到 0、K 直接 99、黑桃 A 歸零）。
// 畫面簡化成「桌上的總數＋出過的牌＋你的手牌」，點牌選起，再按出牌（或加／減、指定誰）。
// 動畫：手牌一張張發上來；出的牌從手上飛到出過的牌那一疊，總數彈一下；答錯那張牌左右晃一下。系統開「減少動態」時都不動。
import { computed, nextTick, ref } from 'vue'
import { playSound } from '@/core/audio'
import { reducedMotion } from '@/core/motion'
import { myLook } from '@/core/profile'
import { online } from '@/core/online'
import { opponentById } from '@/core/opponents'
import { S } from '@/data/strings'
import { applyNinetyNine, canPlay, createNinetyNine, kindOf, legalCards, makeCard, needsSign, RANK_LABELS, rankOf, suitOf, type Card, type NinetyNineState } from '@/engine/ninetynine/rules'
import Avatar from '@/ui/art/Avatar.vue'
import CardArt from '@/ui/art/Card.vue'
import Btn from '@/ui/Btn.vue'
import GuideNote from '@/ui/GuideNote.vue'
import IconBtn from '@/ui/IconBtn.vue'

const emit = defineEmits<{ exit: []; play: []; rules: [] }>()
const T = S.ninetynine
/** 教學結束時整理一次：規則說明的「功能牌」那一段 */
const FUNC = T.rules[1]
const C = makeCard

interface Lesson {
  total: number
  hand: Card[]
  /** 正確答案：'any' = 任何能出的牌；'minus' = 這張用減的；'target' = 這張再指定任何一位；或指定某張牌 */
  want: 'any' | { card: Card; how?: 'minus' | 'target' }
}
const LESSONS: Lesson[] = [
  { total: 92, hand: [C(1, 9), C(0, 6), C(2, 3)], want: 'any' },
  { total: 60, hand: [C(3, 9), C(0, 4)], want: { card: C(0, 4) } },
  { total: 30, hand: [C(1, 9), C(0, 5)], want: { card: C(0, 5), how: 'target' } },
  { total: 93, hand: [C(1, 8), C(2, 10)], want: { card: C(2, 10), how: 'minus' } },
  { total: 97, hand: [C(1, 7), C(0, 11)], want: { card: C(0, 11) } },
  { total: 15, hand: [C(1, 8), C(3, 12)], want: { card: C(3, 12), how: 'minus' } },
  { total: 40, hand: [C(0, 7), C(1, 2), C(2, 13)], want: { card: C(2, 13) } },
  { total: 98, hand: [C(2, 1), C(3, 1)], want: { card: C(3, 1) } },
]
/** 指定那一關讓你挑的三位對手 */
const foes = [3, 7, 12].map(opponentById)

const step = ref(0)
const solved = ref(false)
const misses = ref(0)
const finished = ref(false)
const selected = ref<Card | null>(null)
const state = ref<NinetyNineState>(build(0))
const played = ref<Card[]>([])
const bump = ref(0)
const text = computed(() => T.tutorial[step.value])
const lesson = computed(() => LESSONS[step.value])

function build(n: number): NinetyNineState {
  const l = LESSONS[n]
  // 牌堆放幾張用不到的牌，出完會補一張
  return createNinetyNine([l.hand, [C(3, 2)], [C(3, 3)], [C(3, 6)]], [C(2, 2), C(2, 6)], 0, l.total)
}

const handEls = new Map<Card, HTMLElement>()
const pileEl = ref<HTMLElement>()
const EASE = 'cubic-bezier(.22,1,.36,1)'
function fly(from: DOMRect, to: Element) {
  const r = to.getBoundingClientRect()
  if (!r.width) return
  const dx = from.left + from.width / 2 - (r.left + r.width / 2)
  const dy = from.top + from.height / 2 - (r.top + r.height / 2)
  const k = from.width / r.width
  ;(to as HTMLElement).animate(
    [{ transform: `translate(${dx}px, ${dy}px) scale(${k}) rotate(-6deg)` }, { transform: 'translate(0, -6%) scale(1.06)', offset: 0.8 }, { transform: 'scale(1.06, 0.92)', offset: 0.9 }, { transform: 'none' }],
    { duration: 520, easing: EASE },
  )
}
function shake(c: Card) {
  if (reducedMotion()) return
  handEls.get(c)?.animate([{ transform: 'none' }, { transform: 'translateX(-0.35rem) rotate(-3deg)' }, { transform: 'translateX(0.35rem) rotate(3deg)' }, { transform: 'translateX(-0.2rem)' }, { transform: 'none' }], { duration: 360 })
}

const sel = computed(() => selected.value)
const signValue = computed(() => (sel.value !== null && rankOf(sel.value) === 12 ? 20 : 10))
const isTarget = computed(() => sel.value !== null && kindOf(sel.value) === 'target')

function tap(c: Card) {
  if (solved.value || finished.value) return
  selected.value = selected.value === c ? null : c
  playSound('cardPick')
}
function wrong(c: Card) {
  misses.value++
  shake(c)
  selected.value = null
  playSound('error')
}
function confirm(extra: { minus?: boolean; target?: number } = {}) {
  const c = selected.value
  if (c === null || solved.value) return
  const l = lesson.value
  const ok = l.want === 'any' ? legalCards(state.value).includes(c) && canPlay(state.value.total, c, !!extra.minus) : c === l.want.card && (l.want.how !== 'minus' || !!extra.minus) && (l.want.how !== 'target' || extra.target !== undefined)
  if (!ok) return wrong(c)
  const r = applyNinetyNine(state.value, { type: 'play', player: 0, card: c, ...extra })
  if (!r.ok) return wrong(c)
  const from = handEls.get(c)?.getBoundingClientRect()
  played.value = [...played.value, c]
  state.value = r.state
  selected.value = null
  bump.value++
  solved.value = true
  playSound('card')
  if (!from || reducedMotion()) return
  void nextTick(() => {
    const to = pileEl.value?.lastElementChild
    if (to) fly(from, to)
  })
}
function next() {
  if (step.value + 1 >= LESSONS.length) {
    finished.value = true
    playSound('correct')
    return
  }
  step.value++
  state.value = build(step.value)
  played.value = []
  solved.value = false
  misses.value = 0
  selected.value = null
}
/** 答錯兩次：提示正確的牌 */
const hint = computed(() => {
  if (solved.value || misses.value < 2) return []
  const w = lesson.value.want
  return w === 'any' ? legalCards(state.value).filter((c) => canPlay(state.value.total, c)) : [w.card]
})
</script>

<template>
  <section class="nt">
    <div class="corner"><IconBtn icon="back" :label="S.common.back" @click="emit('exit')" /></div>
    <aside class="side">
      <span class="kid"><Avatar :look="myLook()" :mood="finished || solved ? 'happy' : misses ? 'shock' : 'think'" /></span>
    </aside>
    <!-- 教學結束：中間換成「功能牌」整理（跟規則說明的第 02 段一樣），一行一行浮上來 -->
    <div v-if="finished" class="mid recap">
      <h3 class="rise"><span class="t-slab rnum">02</span><span class="t-black">{{ FUNC.title }}</span></h3>
      <div class="rule wipe" style="--i: 1" />
      <p v-for="(line, i) in FUNC.body" :key="line" class="rise" :style="{ '--i': i * 0.5 + 1.5 }">{{ line }}</p>
    </div>
    <div v-else class="mid">
      <div :key="`t${step}`" class="table">
        <span class="t-label lab">TABLE</span>
        <span ref="pileEl" class="pile">
          <svg v-for="(c, i) in played" :key="c" viewBox="-2 -2 78 108" class="pcard" :style="{ rotate: `${(i % 2 ? 1 : -1) * 8}deg` }"><CardArt :rank="RANK_LABELS[rankOf(c)]" :suit="suitOf(c)" /></svg>
        </span>
        <span class="total">
          <span class="t-label tl">{{ T.total }}</span>
          <span :key="bump" class="num t-slab" :class="{ hot: state.total >= 90 }">{{ state.total }}</span>
          <svg class="dir" :class="{ ccw: state.dir === 1 }" viewBox="-12 -12 24 24" aria-hidden="true">
            <path d="M -7 -4 A 8 8 0 1 1 -4 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
            <path d="M -9.5 -8 L -7 -3 L -2.5 -6.2" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
      </div>
      <TransitionGroup :key="`h${step}`" tag="div" name="hc" class="hand">
        <button
          v-for="(c, i) in state.hands[0]"
          :key="c"
          :ref="(el) => (el ? handEls.set(c, el as HTMLElement) : handEls.delete(c))"
          class="hcard deal"
          :class="{ sel: selected === c, hint: hint.includes(c) }"
          :style="{ '--d': `${250 + i * 90}ms` }"
          @click="tap(c)"
        >
          <svg viewBox="-2 -2 78 108"><CardArt :rank="RANK_LABELS[rankOf(c)]" :suit="suitOf(c)" /></svg>
        </button>
      </TransitionGroup>
    </div>
    <aside class="guide">
      <GuideNote v-if="!finished" :step="step" :total="LESSONS.length" :text="text.text" :ok="text.ok" :solved="solved" :misses="misses" />
      <div v-else class="pop">
        <h2 class="t-black text-[2.4rem] leading-tight"><span class="mask"><span>{{ S.tutorial.finish }}</span></span></h2>
        <p class="text-ink-2">{{ S.tutorial.finishLead }}</p>
      </div>
      <div class="act">
        <template v-if="finished">
          <Btn v-if="!online.room" tone="red" size="lg" arrow block @click="emit('play')">{{ S.tutorial.play }}</Btn>
          <Btn icon="book" size="sm" block @click="emit('rules')">{{ S.tutorial.rules }}</Btn>
          <Btn icon="back" size="sm" block @click="emit('exit')">{{ S.common.back }}</Btn>
        </template>
        <!-- 按鈕換組（出牌 ↔ 加／減 ↔ 指定誰 ↔ 下一步）：舊的往下沉，新的一顆顆往上彈 -->
        <Transition v-else name="swap" mode="out-in" :duration="{ enter: 600, leave: 160 }">
          <div v-if="solved" key="next" class="grp">
            <Btn tone="red" size="lg" arrow block style="--i: 0" @click="next">{{ step + 1 >= LESSONS.length ? S.common.done : S.common.next }}</Btn>
          </div>
          <div v-else-if="sel !== null && needsSign(sel)" :key="`sign${signValue}`" class="grp">
            <Btn tone="red" block style="--i: 0" :disabled="!canPlay(state.total, sel)" @click="confirm({ minus: false })">{{ T.plus(signValue) }}</Btn>
            <Btn tone="ink" block style="--i: 1" @click="confirm({ minus: true })">{{ T.minus(signValue) }}</Btn>
          </div>
          <div v-else-if="isTarget" key="target" class="grp">
            <p class="pick t-black" style="--i: 0">{{ T.pickTarget }}</p>
            <Btn v-for="(o, i) in foes" :key="o.id" size="sm" tone="red" block :style="{ '--i': i + 1 }" @click="confirm({ target: i + 1 })">{{ o.name }}</Btn>
          </div>
          <div v-else key="play" class="grp">
            <Btn tone="red" size="lg" arrow block style="--i: 0" :disabled="selected === null" @click="confirm()">{{ T.play }}</Btn>
          </div>
        </Transition>
      </div>
    </aside>
  </section>
</template>

<style scoped>
.nt {
  position: relative;
  display: flex;
  height: 100%;
  gap: 1.2rem;
  padding: 0.6rem 1.2rem;
}
.side {
  display: flex;
  width: 5.5rem;
  flex-shrink: 0;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  padding-bottom: 1rem;
}
.kid {
  display: block;
  width: 4.4rem;
  height: 4.4rem;
}
.kid :deep(svg) {
  width: 100%;
  height: 100%;
}
.mid {
  display: flex;
  min-width: 0;
  flex: 1.6;
  flex-direction: column;
  justify-content: center;
  gap: 1rem;
  animation: rise 520ms var(--ease-out) both;
}
.table {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-around;
  min-height: 9rem;
  padding: 0.9rem 0.6rem 0.6rem;
  border: 0.14rem solid var(--color-ink);
  background-image: radial-gradient(rgb(20 20 20 / 0.1) 30%, transparent 32%);
  background-size: 0.5rem 0.5rem;
}
.lab {
  position: absolute;
  left: 0.5rem;
  top: -0.55rem;
  padding: 0 0.4rem;
  background: var(--color-paper);
}
.pile {
  position: relative;
  display: block;
  width: 4.2rem;
  height: 5.8rem;
  border: 0.08rem dashed var(--color-ink-3);
  border-radius: 0.35rem;
}
.pcard {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.total {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.tl {
  font-size: 0.6rem;
  color: var(--color-ink-2);
}
.num {
  font-size: 3.6rem;
  line-height: 1;
  animation: bump 320ms var(--ease-back);
}
.num.hot {
  color: var(--color-red);
}
@keyframes bump {
  from {
    transform: scale(1.25);
  }
}
.hand {
  display: flex;
  justify-content: center;
  gap: 0.5rem;
}
.hcard {
  position: relative;
  width: 3.4rem;
  padding: 0;
  transition: transform 160ms var(--ease-out);
}
.hcard svg {
  display: block;
  width: 100%;
}
.hcard.deal {
  animation: deal 420ms var(--ease-out) var(--d) both;
}
@keyframes deal {
  from {
    opacity: 0;
    transform: translateY(2.2rem) rotate(8deg);
  }
}
.hc-move {
  transition: transform 320ms var(--ease-out);
}
.hc-leave-active {
  position: absolute;
  opacity: 0;
}
.hcard.sel {
  transform: translateY(-0.6rem);
}
@media (hover: hover) and (pointer: fine) {
  .hcard:not(.sel):hover {
    transform: translateY(-0.25rem);
  }
}
.hcard.sel::after,
.hcard.hint::after {
  content: '';
  position: absolute;
  inset: -0.2rem;
  border: 0.18rem solid var(--color-red);
  border-radius: 0.5rem;
  pointer-events: none;
}
.hcard.hint:not(.sel)::after {
  border-color: var(--color-blue);
  animation: breathe 1.4s ease-in-out infinite;
}
@keyframes breathe {
  50% {
    transform: scale(1.05);
  }
}
.guide {
  display: flex;
  min-width: 13rem;
  flex: 1;
  flex-direction: column;
  justify-content: space-between;
  padding: 1rem 0 0.4rem;
}
.guide > :first-child {
  min-height: 0;
  overflow-y: auto;
}
.act {
  display: flex;
  width: 10rem;
  flex: none;
  flex-direction: column;
  gap: 0.5rem;
  align-self: flex-end;
  margin-top: 0.6rem;
}
.dir {
  width: 1.5rem;
  height: 1.5rem;
  margin-top: 0.2rem;
  color: var(--color-ink-2);
  transform: scaleX(-1);
  transition: transform 520ms var(--ease-back);
}
.dir.ccw {
  transform: none;
}
.grp {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.swap-leave-active {
  transition:
    opacity 160ms ease-in,
    transform 160ms ease-in;
}
.swap-leave-to {
  opacity: 0;
  transform: translateY(0.7rem);
}
.swap-enter-active > * {
  animation: pop-up 340ms var(--ease-back) calc(var(--i, 0) * 60ms) both;
}
@keyframes pop-up {
  from {
    opacity: 0;
    transform: translateY(0.9rem) scale(0.94);
  }
}
@media (prefers-reduced-motion: reduce) {
  .swap-leave-active,
  .dir {
    transition: none;
  }
  .swap-enter-active > * {
    animation: none;
  }
}
.recap {
  justify-content: center;
  gap: 0;
  overflow-y: auto;
}
.recap h3 {
  display: flex;
  align-items: baseline;
  gap: 0.7rem;
  font-size: 1.6rem;
  line-height: 1.2;
}
.rnum {
  font-size: 1.4rem;
  color: var(--color-red);
}
.recap .rule {
  height: 0.16rem;
  margin: 0.4rem 0 0.5rem;
  background: var(--color-ink);
}
.recap p {
  position: relative;
  padding-left: 1.2rem;
  font-size: 1.02rem;
  line-height: 1.75;
}
.recap p::before {
  content: '';
  position: absolute;
  left: 0.1rem;
  top: 0.68em;
  width: 0.42rem;
  height: 0.42rem;
  background: var(--color-ink);
}
.pick {
  font-size: 0.85rem;
}
@media (prefers-reduced-motion: reduce) {
  .hcard.deal,
  .num {
    animation: none;
  }
}
</style>
