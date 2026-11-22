<script setup lang="ts">
// 吹牛互動教學：四關（帶頭照實出、沒那個點數就吹牛、抓一定說謊的人、說真話出完出線）。
// 畫面簡化成「桌上這一輪蓋著的牌＋喊的點數＋上一家喊了什麼＋你的手牌」。
// 動畫：手牌一張張發上來；出的牌翻成背面飛到桌上那疊；抓人時上一家那兩張翻開；答錯那張牌左右晃一下。系統開「減少動態」時都不動。
import { computed, nextTick, ref } from 'vue'
import { playSound } from '@/core/audio'
import { reducedMotion } from '@/core/motion'
import { myLook } from '@/core/profile'
import { online } from '@/core/online'
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
const pile = ref(LESSONS[0].pile)
/** 抓到時翻開的牌 */
const revealed = ref<Card[] | null>(null)
const text = computed(() => T.tutorial[step.value])
const lesson = computed(() => LESSONS[step.value])
const claim = computed(() => (lesson.value.claim === null ? leadRank.value : lesson.value.claim))

const handEls = new Map<Card, HTMLElement>()
const pileEl = ref<HTMLElement>()
const EASE = 'cubic-bezier(.22,1,.36,1)'

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
  hand.value = hand.value.filter((c) => !sel.includes(c))
  selected.value = []
  pile.value += sel.length
  solved.value = true
  playSound('card')
  window.setTimeout(() => playSound('correct'), 400)
  if (reducedMotion()) return
  void nextTick(() => {
    const to = pileEl.value?.getBoundingClientRect()
    if (!to) return
    from.forEach((f, k) => {
      if (!f) return
      const ghost = document.createElement('div')
      ghost.className = 'tt-ghost'
      Object.assign(ghost.style, { left: `${f.left}px`, top: `${f.top}px`, width: `${f.width}px`, height: `${f.height}px` })
      document.body.appendChild(ghost)
      const dx = to.left + to.width / 2 - (f.left + f.width / 2)
      const dy = to.top + to.height / 2 - (f.top + f.height / 2)
      ghost.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(0.7) rotate(${(k - 0.5) * 14}deg)`, opacity: 1 }], { duration: 520, delay: k * 70, easing: EASE, fill: 'forwards' }).onfinish = () => ghost.remove()
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
  revealed.value = lesson.value.last!.cards
  solved.value = true
  playSound('flip')
  window.setTimeout(() => playSound('correct'), 500)
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
  pile.value = l.pile
  revealed.value = null
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
            <svg v-for="k in Math.min(pile, 8)" :key="k" viewBox="-2 -2 78 108" class="pback" :style="{ rotate: `${((k * 37) % 23) - 11}deg`, translate: `${((k * 13) % 9) - 4}px ${((k * 7) % 5) - 2}px` }"><CardArt back :shadow="false" /></svg>
            <span v-if="revealed" class="rev">
              <svg v-for="(c, k) in revealed" :key="c" viewBox="-2 -2 78 108" class="rcard" :style="{ '--k': k }"><CardArt :rank="RANK_LABELS[rankOf(c)]" :suit="suitOf(c)" /></svg>
            </span>
          </span>
          <span class="t-label cnt">{{ T.pileLabel(pile) }}</span>
        </div>
        <!-- 上一家喊的 -->
        <div v-if="lesson.last" class="lastsay">
          <span class="say t-black" :class="{ hot: revealed }">{{ revealed ? T.call : T.said(lesson.last.count, RANK_LABELS[lesson.claim!]) }}</span>
          <span v-if="revealed" class="t-black res">{{ T.lied(T.prev) }}</span>
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
.pback {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  animation: t-pop 320ms var(--ease-back) both;
}
.rev {
  position: absolute;
  left: 50%;
  top: 50%;
  display: flex;
  gap: 0.3rem;
  translate: -50% -50%;
}
.rcard {
  width: 3.4rem;
  flex: none;
  animation: flip-in 520ms var(--ease-out) calc(var(--k) * 140ms) both;
}
@keyframes flip-in {
  from {
    transform: scaleX(0);
  }
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
.say.hot {
  background: var(--color-red);
  color: var(--color-card);
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
  .pback,
  .rcard {
    animation: none;
  }
}
</style>

<style>
/* 教學：出的牌（背面）從手上飛到桌上那疊（暫時掛在 body 上，飛完就拿掉） */
.tt-ghost {
  position: fixed;
  z-index: 900;
  border: 0.12rem solid var(--color-ink);
  border-radius: 0.35rem;
  background: repeating-linear-gradient(45deg, var(--color-blue) 0 0.3rem, color-mix(in srgb, var(--color-blue) 80%, white) 0.3rem 0.6rem);
  pointer-events: none;
}
</style>
