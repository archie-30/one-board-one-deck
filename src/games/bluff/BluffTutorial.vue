<script setup lang="ts">
// 吹牛互動教學：四關（帶頭照實出、沒那個點數就吹牛、抓一定說謊的人、說真話出完出線）。
// 畫面簡化成「桌上這一輪蓋著的牌＋喊的點數＋上一家喊了什麼＋你的手牌」。
// 動畫：手牌一張張發上來；出的牌一邊飛一邊翻成背面、落到桌上那疊（真的牌，不是替身）；抓人時上一家那兩張從牌堆拿起來翻開，
// 接著整疊飛到上一家那邊；答錯那張牌左右晃一下。系統開「減少動態」時都不動。
import { computed, nextTick, ref } from 'vue'
import { playSound } from '@/core/audio'
import { reducedMotion } from '@/core/motion'
import { myLook } from '@/core/profile'
import { online } from '@/core/online'
import { OPPONENTS } from '@/data/names'
import { S } from '@/data/strings'
import { makeCard, MAX_PLAY, RANK_LABELS, rankOf, suitOf, type Card } from '@/engine/bluff/rules'
import Avatar from '@/ui/art/Avatar.vue'
import CardArt from '@/ui/art/Card.vue'
import Btn from '@/ui/Btn.vue'
import GuideNote from '@/ui/GuideNote.vue'
import IconBtn from '@/ui/IconBtn.vue'

const emit = defineEmits<{ exit: []; play: []; rules: [] }>()
const T = S.bluff
const C = makeCard
const RANKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]

interface Lesson {
  hand: Card[]
  /** 這一輪喊的點數（null＝你帶頭） */
  claim: number | null
  /** 桌上已經蓋了幾張 */
  pile: number
  /** 上一家剛喊的（「2 張 K」）；抓的時候翻開的牌 */
  last?: { count: number; cards: Card[] }
  /** 這一關要做的事 */
  want: 'lead9' | 'bluff' | 'call' | 'finish'
}
const LESSONS: Lesson[] = [
  { hand: [C(0, 3), C(1, 9), C(3, 9), C(2, 12)], claim: null, pile: 0, want: 'lead9' },
  { hand: [C(0, 2), C(1, 8), C(3, 11), C(2, 13)], claim: 5, pile: 3, want: 'bluff' },
  { hand: [C(0, 13), C(1, 13), C(3, 13), C(2, 6)], claim: 13, pile: 4, last: { count: 2, cards: [C(2, 4), C(1, 12)] }, want: 'call' },
  { hand: [C(3, 3), C(2, 3)], claim: 3, pile: 2, want: 'finish' },
]

const step = ref(0)
const solved = ref(false)
const misses = ref(0)
const finished = ref(false)
const selected = ref<Card[]>([])
const leadRank = ref<number | null>(null)
const hand = ref<Card[]>(LESSONS[0].hand.slice())
/** 桌上這一輪蓋著的牌（null＝不知道是什麼的牌；你出的就是那張牌） */
const pile = ref<(Card | null)[]>(Array(LESSONS[0].pile).fill(null))
/** 剛從手上飛過來的那幾張（不播「冒出來」） */
const flown = ref(new Set<number>())
/** 抓人：0＝還沒、1＝那一手翻開、2＝整疊飛去給上一家 */
const callStage = ref(0)
/** 上一家的頭像 */
const PREV_LOOK = OPPONENTS[3].look
const text = computed(() => T.tutorial[step.value])
const lesson = computed(() => LESSONS[step.value])
const claim = computed(() => (lesson.value.claim === null ? leadRank.value : lesson.value.claim))

const handEls = new Map<Card, HTMLElement>()
const pileEls = new Map<number, HTMLElement>()
const pileEl = ref<HTMLElement>()
const prevEl = ref<HTMLElement>()

function shake(cs: readonly Card[]) {
  if (reducedMotion()) return
  for (const c of cs) handEls.get(c)?.animate([{ transform: 'none' }, { transform: 'translateX(-0.35rem) rotate(-3deg)' }, { transform: 'translateX(0.35rem) rotate(3deg)' }, { transform: 'translateX(-0.2rem)' }, { transform: 'none' }], { duration: 360 })
}
function miss(cs: readonly Card[] = selected.value) {
  misses.value++
  shake(cs)
  playSound('error')
}
function tap(c: Card) {
  if (solved.value || finished.value) return
  if (selected.value.includes(c)) selected.value = selected.value.filter((x) => x !== c)
  else if (selected.value.length < MAX_PLAY) {
    selected.value = [...selected.value, c]
    if (lesson.value.claim === null && leadRank.value === null) leadRank.value = rankOf(c)
  }
  playSound('cardPick')
}
function pickRank(r: number) {
  if (solved.value) return
  leadRank.value = r
  playSound('tap')
}
/** 出牌：手上選的牌翻成背面飛到桌上那疊 */
function play() {
  const sel = selected.value
  if (!sel.length || claim.value === null || solved.value) return
  const l = lesson.value
  const ok =
    l.want === 'lead9'
      ? claim.value === 9 && sel.length === 2 && sel.every((c) => rankOf(c) === 9)
      : l.want === 'bluff'
        ? sel.length === 1
        : l.want === 'finish'
          ? sel.length === hand.value.length
          : false
  if (!ok) return miss()
  const from = sel.map((c) => handEls.get(c)?.getBoundingClientRect())
  const start = pile.value.length
  hand.value = hand.value.filter((c) => !sel.includes(c))
  selected.value = []
  pile.value = [...pile.value, ...sel]
  flown.value = new Set(sel.map((_, k) => start + k))
  solved.value = true
  playSound('card')
  window.setTimeout(() => playSound('correct'), 500)
  if (reducedMotion()) return
  void nextTick(() => {
    from.forEach((f, k) => {
      const el = pileEls.get(start + k)
      if (!f || !el) return
      const r = el.getBoundingClientRect()
      const dx = f.left + f.width / 2 - (r.left + r.width / 2)
      const dy = f.top + f.height / 2 - (r.top + r.height / 2)
      const sc = f.width / r.width
      // 從手上的位置（正面朝上）一路滑過去、途中翻成背面，落下時輕輕壓一下
      el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(${sc}) rotateY(180deg)`, easing: 'cubic-bezier(.35,0,.6,1)' },
          { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 14}px) scale(${(sc + 1) / 2 + 0.06}) rotateY(90deg)`, offset: 0.5, easing: 'cubic-bezier(.3,0,.4,1)' },
          { transform: 'scale(1.05, 0.94)', offset: 0.88 },
          { transform: 'none' },
        ],
        { duration: 680, delay: k * 120, fill: 'backwards' },
      )
    })
  })
}
function pass() {
  if (solved.value) return
  miss([])
}
function call() {
  if (solved.value) return
  if (lesson.value.want !== 'call') return miss([])
  // 上一家那一手（桌上最後兩張）換成真的牌：先拿起來翻開，停一下，整疊飛去給上一家
  const cards = lesson.value.last!.cards
  pile.value = [...pile.value.slice(0, pile.value.length - cards.length), ...cards]
  solved.value = true
  playSound('reveal')
  window.setTimeout(() => {
    callStage.value = 1
    playSound('flip')
  }, 120)
  window.setTimeout(() => playSound('correct'), 900)
  window.setTimeout(() => {
    if (step.value !== 2) return
    callStage.value = 2
    playSound('collect')
    flyToPrev()
  }, 2000)
}
/** 整疊牌飛到上一家的頭像那邊、縮小淡掉 */
function flyToPrev() {
  const from = pileEl.value?.getBoundingClientRect()
  const to = prevEl.value?.getBoundingClientRect()
  if (!from || !to || reducedMotion()) {
    pile.value = []
    return
  }
  const dx = to.left + to.width / 2 - (from.left + from.width / 2)
  const dy = to.top + to.height / 2 - (from.top + from.height / 2)
  const a = pileEl.value!.animate(
    [
      { transform: 'none', opacity: 1 },
      { transform: `translate(${dx * 0.8}px, ${dy * 0.8}px) scale(0.55)`, opacity: 1, offset: 0.75 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.3)`, opacity: 0 },
    ],
    { duration: 620, easing: 'cubic-bezier(.45,0,.25,1)', fill: 'forwards' },
  )
  a.onfinish = () => {
    pile.value = []
    a.cancel()
  }
}
function next() {
  if (step.value + 1 >= LESSONS.length) {
    finished.value = true
    playSound('correct')
    return
  }
  step.value++
  const l = LESSONS[step.value]
  hand.value = l.hand.slice()
  pile.value = Array(l.pile).fill(null)
  flown.value = new Set()
  callStage.value = 0
  solved.value = false
  misses.value = 0
  selected.value = []
  leadRank.value = null
}
/** 答錯兩次：提示該選哪幾張 */
const hint = computed(() => {
  if (solved.value || misses.value < 2) return []
  const w = lesson.value.want
  if (w === 'lead9') return hand.value.filter((c) => rankOf(c) === 9)
  if (w === 'finish') return hand.value.slice()
  if (w === 'bluff') return [hand.value[0]]
  return []
})
</script>

<template>
  <section class="bt">
    <div class="corner"><IconBtn icon="back" :label="S.common.back" @click="emit('exit')" /></div>
    <aside class="side">
      <span class="kid"><Avatar :look="myLook()" :mood="finished || solved ? 'happy' : misses ? 'shock' : 'think'" /></span>
    </aside>
    <div class="mid">
      <div :key="`t${step}`" class="table">
        <span class="t-label lab">TABLE</span>
        <!-- 桌上這一輪蓋著的牌 -->
        <div class="pilebox">
          <span ref="pileEl" class="pile">
            <span
              v-for="(c, k) in pile"
              :key="k"
              :ref="(el) => (el ? pileEls.set(k, el as HTMLElement) : pileEls.delete(k))"
              class="pc"
              :class="{ appear: !flown.has(k), up: callStage >= 1 && k >= pile.length - (lesson.last?.cards.length ?? 0) }"
              :style="{ '--r': `${((k * 37) % 23) - 11}deg`, '--x': `${((k * 13) % 9) - 4}px`, '--y': `${((k * 7) % 5) - 2}px`, '--u': k - (pile.length - (lesson.last?.cards.length ?? 0)) - ((lesson.last?.cards.length ?? 1) - 1) / 2, '--d': `${k * 60}ms` }"
            >
              <svg viewBox="-2 -2 78 108" class="b"><CardArt back :shadow="false" /></svg>
              <svg v-if="c !== null" viewBox="-2 -2 78 108" class="f"><CardArt :rank="RANK_LABELS[rankOf(c)]" :suit="suitOf(c)" :shadow="false" /></svg>
            </span>
          </span>
          <span class="t-label cnt">{{ T.pileLabel(pile.length) }}</span>
        </div>
        <!-- 上一家喊的 -->
        <div v-if="lesson.last" class="lastsay">
          <span ref="prevEl" class="prev"><Avatar :look="PREV_LOOK" :mood="callStage ? 'sad' : 'smug'" /></span>
          <span class="say t-black">{{ T.said(lesson.last.count, RANK_LABELS[lesson.claim!]) }}</span>
          <Transition name="res">
            <span v-if="callStage" class="t-black res">{{ T.lied(T.prev) }}</span>
          </Transition>
        </div>
        <div class="claim">
          <span class="t-label">{{ T.claimLabel }}</span>
          <span class="big t-slab" :class="{ none: claim === null }">{{ claim === null ? '－' : RANK_LABELS[claim] }}</span>
        </div>
      </div>
      <!-- 帶頭：選要喊的點數 -->
      <div v-if="lesson.claim === null && !solved" class="ranks">
        <button v-for="r in RANKS" :key="r" class="rk t-slab" :class="{ on: leadRank === r }" @click="pickRank(r)">{{ RANK_LABELS[r] }}</button>
      </div>
      <TransitionGroup :key="`h${step}`" tag="div" name="hc" class="hand">
        <button
          v-for="(c, i) in hand"
          :key="c"
          :ref="(el) => (el ? handEls.set(c, el as HTMLElement) : handEls.delete(c))"
          class="hcard deal"
          :class="{ sel: selected.includes(c), hint: hint.includes(c) }"
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
        <Btn v-else-if="solved" class="rise" tone="red" size="lg" arrow block @click="next">{{ step + 1 >= LESSONS.length ? S.common.done : S.common.next }}</Btn>
        <template v-else>
          <Btn v-if="lesson.last" tone="yellow" size="lg" block :class="{ hintbtn: misses >= 2 }" @click="call">{{ T.call }}</Btn>
          <Btn v-if="lesson.claim !== null" size="sm" block @click="pass">{{ T.pass }}</Btn>
          <Btn tone="red" size="lg" arrow block :disabled="!selected.length || claim === null" @click="play">{{ selected.length && claim !== null ? T.playAs(selected.length, RANK_LABELS[claim]) : T.play }}</Btn>
        </template>
      </div>
    </aside>
  </section>
</template>

<style scoped>
.bt {
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
  gap: 0.8rem;
  animation: rise 520ms var(--ease-out) both;
}
.table {
  position: relative;
  /* 飛過來的牌要在手牌上面，不能從手牌底下穿過去 */
  z-index: 2;
  display: flex;
  min-height: 9.5rem;
  align-items: center;
  justify-content: space-around;
  gap: 0.8rem;
  padding: 0.9rem 0.8rem 0.6rem;
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
.pilebox {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
}
.pile {
  position: relative;
  display: block;
  width: 3.6rem;
  height: 5rem;
}
.pc {
  position: absolute;
  inset: 0;
  transform-style: preserve-3d;
  rotate: var(--r);
  translate: var(--x) var(--y);
  transition:
    rotate 420ms var(--ease-out),
    translate 520ms var(--ease-out) var(--d),
    transform 520ms var(--ease-out) var(--d),
    scale 420ms var(--ease-out);
}
.pc.appear {
  /* 只動 scale／opacity、不留住（transform 要留給翻牌用，不然被抓時翻不開） */
  animation: pc-pop 320ms var(--ease-back) calc(var(--d) * 0.5) backwards;
}
@keyframes pc-pop {
  from {
    opacity: 0;
    scale: 0.6;
  }
}
.pc svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  backface-visibility: hidden;
}
.pc .f {
  transform: rotateY(180deg);
}
/* 被抓的那一手：從牌堆拿起來、往兩邊攤開、翻成正面 */
.pc.up {
  z-index: 5;
  rotate: 0deg;
  /* 往右攤開（牌堆在桌子左邊，往左會超出桌框） */
  translate: calc((var(--u) + 0.5) * 108% + 6%) -12%;
  scale: 1.05;
  transform: rotateY(180deg);
}
.res-enter-active {
  transition:
    opacity 200ms var(--ease-out) 500ms,
    scale 320ms var(--ease-back) 500ms;
}
.res-enter-from {
  opacity: 0;
  scale: 0.6;
}
.prev {
  display: block;
  width: 2.6rem;
  height: 2.6rem;
}
.prev :deep(svg) {
  width: 100%;
  height: 100%;
}
.cnt {
  color: var(--color-ink-2);
}
.lastsay {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
}
.say {
  padding: 0.05rem 0.6rem;
  border: 0.13rem solid var(--color-ink);
  border-radius: 1rem;
  background: var(--color-card);
  font-size: 0.95rem;
  white-space: nowrap;
}
.res {
  font-size: 0.8rem;
  color: var(--color-red);
}
.claim {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.claim .big {
  font-size: 2.8rem;
  line-height: 1;
  color: var(--color-red);
}
.claim .big.none {
  color: var(--color-ink-3);
}
.ranks {
  display: grid;
  grid-template-columns: repeat(13, 1fr);
  gap: 0.2rem;
}
.rk {
  position: relative;
  height: 1.7rem;
  border: 0.12rem solid var(--color-ink);
  background: var(--color-card);
  padding: 0;
  font-size: 0.85rem;
  box-shadow: 0.1rem 0.1rem 0 var(--color-ink);
}
.rk.on {
  background: var(--color-ink);
  color: var(--color-card);
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
@media (hover: hover) and (pointer: fine) {
  .hcard:not(.sel):hover {
    transform: translateY(-0.25rem);
  }
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
@keyframes t-pop {
  from {
    opacity: 0;
    transform: scale(0.6);
  }
}
.hc-move {
  transition: transform 320ms var(--ease-out);
}
.hc-leave-active {
  position: absolute;
  opacity: 0;
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
.hintbtn {
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
@media (prefers-reduced-motion: reduce) {
  .hcard.deal,
  .pc {
    animation: none;
    transition: none;
  }
}
</style>
