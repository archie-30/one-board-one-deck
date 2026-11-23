<script setup lang="ts">
// 第一次玩的歡迎畫面（core/welcome.ts）：整個畫面的一頁，蓋在主畫面上面。
// 左邊：大大的「初次見面！」、一段歡迎的話、輸入名字（跟個人資料同一個）＋灰色小字「之後可以在個人資料修改」；
// 右邊：一把扇開的牌和一個小棋盤；右下「開始遊戲」——名字輸入好才能按。
// 動畫：開機加載畫面收掉後，字從遮罩滑上來、元件依序上浮、牌一張張扇開、棋子落下；
// 按「開始遊戲」：元件依序往下沉、整片紙往上捲走，底下的主畫面重新播一次進場（welcomeDone）。
import { computed, ref } from 'vue'
import { playSound } from '@/core/audio'
import { reducedMotion } from '@/core/motion'
import { closeWelcome, finishWelcome, revealTitle, skipWelcome, usableName, welcomeOpen } from '@/core/welcome'
import { S } from '@/data/strings'
import { NAME_MAX_WIDTH } from '@/data/namePool'
import Card from './art/Card.vue'
import Btn from './Btn.vue'

const T = S.welcome
const name = ref('')
const bad = ref(false)
const leaving = ref(false)
/** 名字能用才能按開始 */
const ok = computed(() => !!usableName(name.value))
const fan = [
  { rank: 'A', suit: 3 },
  { rank: 'K', suit: 2 },
  { rank: '7', suit: 1 },
]

function start() {
  if (leaving.value) return
  if (!finishWelcome(name.value)) {
    bad.value = true
    playSound('error')
    return
  }
  playSound('correct')
  leave()
}
/** 略過：不取名字，一樣播收場動畫進主畫面 */
function skip() {
  if (leaving.value) return
  skipWelcome()
  playSound('tap')
  leave()
}
function leave() {
  leaving.value = true
  // 收場：元件往下沉（約 0.33 秒）→ 整片紙往上捲走（約 0.56 秒），捲的同時底下的主畫面重新進場
  if (reducedMotion()) {
    revealTitle()
    closeWelcome()
    return
  }
  window.setTimeout(revealTitle, 300)
  window.setTimeout(closeWelcome, 950)
}
function onInput() {
  bad.value = false
}
</script>

<template>
  <section v-if="welcomeOpen" class="welcome" :class="{ leaving }">
    <div class="sheet" />
    <div class="cols">
      <div class="left">
        <p class="t-label rise" style="--i: 1">{{ T.label }}</p>
        <h1 class="t-black hello">
          <span class="mask"><span style="--i: 1">{{ T.hello }}</span></span>
        </h1>
        <div class="rule wipe" style="--i: 3" />
        <p class="lead rise" style="--i: 4">{{ T.lead1 }}</p>
        <p class="lead rise" style="--i: 5">{{ T.lead2 }}</p>
        <label class="t-black ask rise" style="--i: 7" for="welcome-name">{{ T.ask }}</label>
        <input
          id="welcome-name"
          v-model="name"
          class="t-black name rise"
          :class="{ bad }"
          style="--i: 8"
          type="text"
          :maxlength="NAME_MAX_WIDTH"
          :placeholder="T.namePh"
          enterkeyhint="go"
          autocomplete="off"
          spellcheck="false"
          @input="onInput"
          @keydown.enter="ok && start()"
        />
        <p class="note rise" :class="{ warn: bad }" style="--i: 9">{{ bad ? T.bad : T.note }}</p>
      </div>
      <div class="art" aria-hidden="true">
        <svg viewBox="0 0 200 150" class="fan">
          <g v-for="(c, i) in fan" :key="i" class="fc" :style="{ '--a': `${(i - 1) * 18}deg`, '--i': i }">
            <Card :rank="c.rank" :suit="c.suit" transform="translate(64 22)" />
          </g>
        </svg>
        <svg viewBox="0 0 120 120" class="board">
          <rect x="4" y="4" width="112" height="112" fill="var(--color-ink)" transform="translate(4 4)" />
          <rect x="4" y="4" width="112" height="112" fill="#e9c46a" stroke="var(--color-ink)" stroke-width="3" />
          <path v-for="k in 5" :key="`h${k}`" :d="`M18 ${k * 18 + 6}H102`" stroke="var(--color-ink)" stroke-width="1.6" />
          <path v-for="k in 5" :key="`v${k}`" :d="`M${k * 18 + 6} 18V102`" stroke="var(--color-ink)" stroke-width="1.6" />
          <circle v-for="(st, k) in [[42, 42, 1], [60, 60, 0], [78, 42, 1], [60, 78, 0]]" :key="`s${k}`" :cx="st[0]" :cy="st[1]" r="8" :fill="st[2] ? 'var(--color-ink)' : 'var(--color-card)'" stroke="var(--color-ink)" stroke-width="1.8" class="st" :style="{ '--i': k }" />
        </svg>
      </div>
    </div>
    <footer class="foot rise" style="--i: 10">
      <Btn class="skip" size="sm" :disabled="leaving" @click="skip">{{ T.skip }}</Btn>
      <span class="hint">{{ ok ? '' : T.need }}</span>
      <Btn tone="red" size="lg" arrow :disabled="!ok || leaving" @click="start">{{ T.start }}</Btn>
    </footer>
  </section>
</template>

<style scoped>
/* 整個畫面：蓋在所有東西上面（主畫面、公告都在底下），內縮跟 #app 一樣避開鏡頭 */
.welcome {
  position: fixed;
  inset: 0;
  z-index: 970;
  display: flex;
  flex-direction: column;
  padding: calc(1.1rem + var(--cut-t)) calc(1.8rem + var(--cut-r)) calc(0.9rem + var(--cut-b)) calc(1.8rem + var(--cut-l));
}
.sheet {
  position: absolute;
  inset: 0;
  z-index: -1;
  background-color: var(--color-paper);
}
.cols {
  display: flex;
  min-height: 0;
  flex: 1;
  gap: 2rem;
}
.left {
  display: flex;
  min-width: 0;
  flex: 1.2;
  flex-direction: column;
  justify-content: center;
}
.hello {
  font-size: 3.2rem;
  line-height: 1.1;
  padding-top: 0.2rem;
}
.rule {
  width: 9rem;
  height: 0.3rem;
  margin: 0.55rem 0 0.8rem;
  background: var(--color-red);
}
.lead {
  /* 不要剩一兩個字掉到下一行 */
  text-wrap: pretty;
  font-size: 1.05rem;
  line-height: 1.65;
  color: var(--color-ink-2);
}
.ask {
  margin-top: 1.1rem;
  font-size: 1.05rem;
}
.name {
  width: min(100%, 19rem);
  margin-top: 0.45rem;
  border: 0.14rem solid var(--color-ink);
  background: var(--color-card);
  box-shadow: 0.22rem 0.22rem 0 var(--color-ink);
  padding: 0.35rem 0.7rem;
  font-size: 1.3rem;
  outline: none;
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease;
}
.name:focus {
  border-color: var(--color-blue);
  box-shadow: 0.22rem 0.22rem 0 var(--color-blue);
}
.name.bad {
  border-color: var(--color-red);
  box-shadow: 0.22rem 0.22rem 0 var(--color-red);
}
.name::placeholder {
  font-weight: 500;
  color: var(--color-ink-3);
}
.note {
  margin-top: 0.5rem;
  font-size: 0.78rem;
  color: var(--color-ink-3);
}
.note.warn {
  color: var(--color-red);
}
/* 右邊的插圖：牌一張張扇開、棋子一顆顆落下 */
.art {
  position: relative;
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  justify-content: center;
}
.fan {
  width: 80%;
  max-height: 70%;
  overflow: visible;
}
.fc {
  transform-box: view-box;
  transform-origin: 100px 140px;
  rotate: var(--a);
  animation: fan-in 700ms var(--ease-back) calc(500ms + var(--i) * 110ms) both;
}
@keyframes fan-in {
  from {
    rotate: 0deg;
    translate: 0 1.2rem;
    opacity: 0;
  }
}
.board {
  position: absolute;
  right: 4%;
  bottom: 6%;
  width: 34%;
  rotate: 8deg;
  animation: rise 600ms var(--ease-out) 700ms both;
}
.st {
  transform-box: fill-box;
  transform-origin: center;
  animation: drop 380ms var(--ease-back) calc(1000ms + var(--i) * 140ms) both;
}
@keyframes drop {
  from {
    scale: 1.8;
    opacity: 0;
  }
}
.foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 1rem;
}
.skip {
  margin-right: auto;
}
.hint {
  font-size: 0.8rem;
  color: var(--color-ink-3);
}
/* 收場：元件依序往下沉、淡掉，整片紙往上捲走，露出底下重新進場的主畫面 */
.leaving .left > *,
.leaving .art,
.leaving .foot {
  transition:
    transform 320ms var(--ease-in-out),
    opacity 280ms ease;
  transform: translateY(1.2rem);
  opacity: 0;
}
.leaving .left > :nth-child(n + 4) {
  transition-delay: 60ms;
}
.leaving .art {
  transition-delay: 90ms;
}
.leaving .sheet {
  animation: roll-up 560ms var(--ease-in-out) 330ms both;
}
@keyframes roll-up {
  to {
    clip-path: inset(0 0 100% 0);
  }
}
@media (max-height: 430px) {
  .hello {
    font-size: 2.7rem;
  }
  .lead {
    font-size: 0.95rem;
    line-height: 1.55;
  }
  .ask {
    margin-top: 0.7rem;
  }
}
@media (prefers-reduced-motion: reduce) {
  .fc,
  .board,
  .st {
    animation: none;
  }
}
</style>
