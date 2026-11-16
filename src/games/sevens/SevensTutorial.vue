<script setup lang="ts">
// 排七互動教學：三關（第一手出黑桃 7、從 7 往兩邊接、沒牌可接就蓋最小的）。
// 畫面簡化成「桌上四排＋你的手牌」，點牌選起、再按出牌／蓋牌。
// 動畫：每一關手牌一張張發上來、桌上的牌依序冒出；出的牌從手上飛到桌上的格子（落地壓一下），
// 蓋的牌翻成背面飛到頭像下面的蓋牌堆；答錯那張牌左右晃一下。系統開「減少動態」時都不動。
import { computed, nextTick, ref } from 'vue'
import { playSound } from '@/core/audio'
import { reducedMotion } from '@/core/motion'
import { myLook } from '@/core/profile'
import { online } from '@/core/online'
import { S } from '@/data/strings'
import { applySevens, createSevens, legalPlays, lowestCover, makeCard, RANK_LABELS, rankOf, suitOf, type Card, type Row, type SevensState } from '@/engine/sevens/rules'
import Avatar from '@/ui/art/Avatar.vue'
import CardArt from '@/ui/art/Card.vue'
import Btn from '@/ui/Btn.vue'
import GuideNote from '@/ui/GuideNote.vue'
import IconBtn from '@/ui/IconBtn.vue'
import { ROW_ORDER } from './layout'

const emit = defineEmits<{ exit: []; play: []; rules: [] }>()
const T = S.sevens
const C = makeCard

interface Lesson {
  hand: Card[]
  rows: Row[]
  first: boolean
  /** 正確答案：'any' = 任何能接的牌都對；'cover' = 要蓋點數最小的 */
  want: 'any' | 'cover' | Card
}
const LESSONS: Lesson[] = [
  { hand: [C(3, 7), C(2, 8), C(1, 3), C(0, 13)], rows: [null, null, null, null], first: true, want: C(3, 7) },
  { hand: [C(3, 8), C(2, 7), C(2, 8), C(1, 2)], rows: [null, null, null, [7, 7]], first: false, want: 'any' },
  { hand: [C(1, 3), C(0, 9), C(2, 1), C(3, 13)], rows: [null, null, [7, 7], [5, 9]], first: false, want: 'cover' },
]

const step = ref(0)
const solved = ref(false)
const misses = ref(0)
const finished = ref(false)
const selected = ref<Card | null>(null)
const state = ref<SevensState>(build(0))
const text = computed(() => T.tutorial[step.value])
const lesson = computed(() => LESSONS[step.value])
const canPlayAny = computed(() => legalPlays(state.value, 0).length > 0)

function build(n: number): SevensState {
  const l = LESSONS[n]
  const s = createSevens([l.hand, [], [], []])
  return { ...s, rows: l.rows.map((r) => (r ? [r[0], r[1]] : null)), first: l.first, turn: 0 }
}
// ── 動畫用：每張手牌、桌上的牌、蓋牌堆的元素 ──
const handEls = new Map<Card, HTMLElement>()
const tableEls = new Map<Card, Element>()
const coverEl = ref<HTMLElement>()
/** 剛飛上桌的那張（不要再播「冒出來」） */
const flown = ref<Card | null>(null)
const covered = ref<Card[]>([])
const EASE = 'cubic-bezier(.22,1,.36,1)'

/** 從 from 的位置飛到 to（to 是已經畫在終點的那個元素） */
function fly(from: DOMRect, to: Element, flip: boolean) {
  const r = to.getBoundingClientRect()
  if (!r.width) return
  const dx = from.left + from.width / 2 - (r.left + r.width / 2)
  const dy = from.top + from.height / 2 - (r.top + r.height / 2)
  const k = from.width / r.width
  const start = `translate(${dx}px, ${dy}px) scale(${k}) rotate(-6deg)`
  const frames = flip
    ? [{ transform: start }, { transform: `translate(${dx / 2}px, ${dy / 2 - 30}px) scale(${(k + 1) / 2}) scaleX(0) rotate(4deg)`, offset: 0.45 }, { transform: 'none' }]
    : [{ transform: start }, { transform: 'translate(0, -6%) scale(1.06)', offset: 0.8 }, { transform: 'scale(1.06, 0.92)', offset: 0.9 }, { transform: 'none' }]
  ;(to as HTMLElement).animate(frames, { duration: flip ? 560 : 520, easing: EASE })
}
function shake(c: Card) {
  if (reducedMotion()) return
  handEls.get(c)?.animate([{ transform: 'none' }, { transform: 'translateX(-0.35rem) rotate(-3deg)' }, { transform: 'translateX(0.35rem) rotate(3deg)' }, { transform: 'translateX(-0.2rem)' }, { transform: 'none' }], { duration: 360 })
}

function tap(c: Card) {
  if (solved.value || finished.value) return
  if (selected.value === c) return confirm()
  selected.value = c
  playSound('cardPick')
}
function confirm() {
  const c = selected.value
  if (c === null || solved.value) return
  const l = lesson.value
  const covering = !canPlayAny.value
  const ok = l.want === 'any' ? !covering && legalPlays(state.value, 0).includes(c) : l.want === 'cover' ? covering && c === lowestCover(state.value.hands[0]) : c === l.want
  if (!ok) {
    misses.value++
    shake(c)
    selected.value = null
    playSound('error')
    return
  }
  const r = applySevens(state.value, covering ? { type: 'cover', player: 0, card: c } : { type: 'play', player: 0, card: c })
  if (!r.ok) return
  const from = handEls.get(c)?.getBoundingClientRect()
  flown.value = c
  if (covering) covered.value = [...covered.value, c]
  state.value = r.state
  selected.value = null
  solved.value = true
  playSound(covering ? 'pass' : 'card')
  if (!from || reducedMotion()) return
  void nextTick(() => {
    const to = covering ? coverEl.value?.lastElementChild : tableEls.get(c)
    if (to) fly(from, to, covering)
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
  flown.value = null
  covered.value = []
  solved.value = false
  misses.value = 0
  selected.value = null
}
const rowCards = (suit: number) => {
  const r = state.value.rows[suit]
  return r ? Array.from({ length: r[1] - r[0] + 1 }, (_, k) => C(suit, r[0] + k)) : []
}
const hint = computed(() => (!solved.value && misses.value >= 2 ? (lesson.value.want === 'cover' ? [lowestCover(state.value.hands[0])] : lesson.value.want === 'any' ? legalPlays(state.value, 0) : [lesson.value.want]) : []))
</script>

<template>
  <section class="st">
    <div class="corner"><IconBtn icon="back" :label="S.common.back" @click="emit('exit')" /></div>
    <aside class="side">
      <span class="kid"><Avatar :look="myLook()" :mood="finished || solved ? 'happy' : misses ? 'shock' : 'think'" /></span>
      <!-- 蓋牌堆：蓋起來的牌翻成背面飛到這裡 -->
      <span ref="coverEl" class="cpile">
        <svg v-for="(c, i) in covered" :key="c" viewBox="-2 -2 78 108" class="cback" :style="{ rotate: `${(i % 2 ? 1 : -1) * 6}deg` }"><CardArt back /></svg>
      </span>
    </aside>
    <div class="mid">
      <!-- 換關時整塊重畫：桌上的牌依序冒出、手牌一張張發上來 -->
      <div :key="`t${step}`" class="table">
        <span class="t-label lab">TABLE</span>
        <div v-for="(suit, ri) in ROW_ORDER" :key="suit" class="row">
          <span v-for="r in 13" :key="r" class="slot" :class="{ seven: r === 7 }">
            <svg
              v-if="rowCards(suit).some((c) => rankOf(c) === r)"
              :ref="(el) => el && tableEls.set(C(suit, r), el as Element)"
              viewBox="-2 -2 78 108"
              class="tcard"
              :class="{ appear: flown !== C(suit, r) }"
              :style="{ '--d': `${ri * 90 + Math.abs(r - 7) * 50}ms` }"
            ><CardArt :rank="RANK_LABELS[r]" :suit="suit" :shadow="false" /></svg>
          </span>
        </div>
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
          <!-- 在連線房間裡不能自己開局（開始要在房間裡大家準備） -->
          <Btn v-if="!online.room" tone="red" size="lg" arrow block @click="emit('play')">{{ S.tutorial.play }}</Btn>
          <Btn icon="book" size="sm" block @click="emit('rules')">{{ S.tutorial.rules }}</Btn>
          <Btn icon="back" size="sm" block @click="emit('exit')">{{ S.common.back }}</Btn>
        </template>
        <Btn v-else-if="solved" class="rise" tone="red" size="lg" arrow block @click="next">{{ step + 1 >= LESSONS.length ? S.common.done : S.common.next }}</Btn>
        <Btn v-else tone="red" size="lg" arrow block :disabled="selected === null" @click="confirm">{{ canPlayAny ? T.play : T.cover }}</Btn>
      </div>
    </aside>
  </section>
</template>

<style scoped>
.st {
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
  gap: 0.6rem;
  padding-bottom: 1rem;
}
/* 蓋牌堆（頭像上面） */
.cpile {
  position: relative;
  display: block;
  width: 2.6rem;
  height: 3.6rem;
}
.cback {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
/* 桌上的牌：從中間的 7 往外依序冒出 */
.tcard.appear {
  animation: t-pop 380ms var(--ease-back) var(--d) both;
}
@keyframes t-pop {
  from {
    opacity: 0;
    transform: scale(0.6);
  }
}
/* 手牌：一張張從下面發上來 */
.hcard.deal {
  animation: deal 420ms var(--ease-out) var(--d) both;
}
@keyframes deal {
  from {
    opacity: 0;
    transform: translateY(2.2rem) rotate(8deg);
  }
}
/* 出掉的牌離開手牌時，剩下的牌滑過去補位 */
.hc-move {
  transition: transform 320ms var(--ease-out);
}
.hc-leave-active {
  position: absolute;
  opacity: 0;
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
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.7rem 0.6rem 0.5rem;
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
.row {
  display: grid;
  grid-template-columns: repeat(13, 1fr);
  height: 3.2rem;
}
.slot {
  position: relative;
}
.slot.seven::before {
  /* 7 的位置：跟牌一樣比例的虛線框（不是被格子拉長的細長條） */
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  height: 92%;
  aspect-ratio: 70 / 100;
  translate: -50% -50%;
  border: 0.08rem dashed var(--color-ink-3);
  border-radius: 0.25rem;
}
.tcard {
  position: absolute;
  left: 50%;
  top: 50%;
  height: 100%;
  translate: -50% -50%;
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
.hcard.sel {
  transform: translateY(-0.6rem);
}
/* 滑鼠移上去：牌先浮起一點 */
@media (hover: hover) and (pointer: fine) {
  .hcard:not(.sel):hover {
    transform: translateY(-0.25rem);
  }
}
@media (prefers-reduced-motion: reduce) {
  .tcard.appear,
  .hcard.deal {
    animation: none;
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
</style>
