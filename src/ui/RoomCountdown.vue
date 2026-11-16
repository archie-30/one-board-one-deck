<script setup lang="ts">
// 連線房間的開局倒數（放在 App 最上層，換頁時不會消失）：
//   大家都準備好 → 畫面正中間大大的 3、2、1、開始！疊在所有東西上面（連換頁、過場都看得到）。
//   倒數開始時不在房間頁的人，直接換頁回到房間。
//   倒數完：房間中間那張模式卡片拿起來、翻面、展開（跟一般開始遊戲一樣的過場），進入對局。
//   倒數中有人取消準備、改觀戰、換模式就停下來。
// 現在還沒接連線：在這台機器上開局，空位由電腦補；之後由伺服器通知大家一起開局。
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { playSound } from '@/core/audio'
import { startLaunch } from '@/core/launch'
import { reducedMotion } from '@/core/motion'
import { go, resetTo, route } from '@/core/nav'
import { beginMatch, online, roomCountdown, startState } from '@/core/online'
import { S } from '@/data/strings'
import { getGame, seatsOf } from '@/games/registry'

const T = S.online.status
const game = computed(() => (online.room?.gameId ? getGame(online.room.gameId) : null))
const canStart = computed(() => !!game.value && startState(seatsOf(game.value)).canStart)
/** 畫面上顯示的字：3、2、1、開始！（空字串＝不顯示） */
const shown = ref('')
let timer = 0
let hideTimer = 0

function stop() {
  window.clearInterval(timer)
  roomCountdown.value = 0
  shown.value = ''
}
function tick(n: number) {
  roomCountdown.value = n
  shown.value = String(n)
  playSound('tap')
}

watch(canStart, (ok) => {
  window.clearTimeout(hideTimer)
  stop()
  if (!ok) return
  // 不在房間頁：直接換頁回到房間（倒數照樣在最上層）
  if (route.value.name !== 'room') resetTo([{ name: 'title' }, { name: 'room' }])
  tick(3)
  timer = window.setInterval(() => {
    const n = roomCountdown.value - 1
    if (n > 0) return tick(n)
    window.clearInterval(timer)
    roomCountdown.value = 0
    shown.value = T.startNow
    playSound('shuffle')
    hideTimer = window.setTimeout(() => (shown.value = ''), 700)
    void launch()
  }, 1000)
})
onBeforeUnmount(() => {
  stop()
  window.clearTimeout(hideTimer)
})

/** 開局：房間中間那張卡片翻面展開（跟模式選單開始遊戲一樣），同時先把遊戲載好 */
async function launch() {
  const g = game.value
  if (!g || !canStart.value) return
  beginMatch()
  const el = document.getElementById(`mode-${g.id}`)
  if (!el || reducedMotion() || route.value.name !== 'room') return go({ name: 'play', gameId: g.id })
  const color = getComputedStyle(el.querySelector('.cv') ?? el).backgroundColor
  const loader = (g.component as { __asyncLoader?: () => Promise<unknown> }).__asyncLoader
  await Promise.all([startLaunch(el, color, g.name, g.players), loader?.().catch(() => {})])
  go({ name: 'play', gameId: g.id })
}
</script>

<template>
  <Transition name="cd">
    <div v-if="shown" class="cd" aria-live="assertive">
      <p class="t-label lab">{{ T.starting }}</p>
      <span :key="shown" class="t-slab num" :class="{ go: shown === T.startNow }">{{ shown }}</span>
    </div>
  </Transition>
</template>

<style scoped>
/* 疊在所有東西上面（過場層 3000 之上），不擋操作 */
.cd {
  position: fixed;
  inset: 0;
  z-index: 5000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.lab {
  border: 0.13rem solid var(--color-ink);
  background: var(--color-card);
  padding: 0.1rem 0.6rem;
  box-shadow: 0.15rem 0.15rem 0 var(--color-ink);
}
.num {
  margin-top: 0.4rem;
  font-size: 9rem;
  line-height: 1;
  color: var(--color-red);
  /* 紙色描邊＋黑色實心陰影：疊在什麼上面都看得清楚 */
  -webkit-text-stroke: 0.12em var(--color-ink);
  paint-order: stroke fill;
  text-shadow: 0.08em 0.08em 0 var(--color-ink);
  animation: cd-pop 900ms var(--ease-out) both;
}
.num.go {
  font-size: 5rem;
  font-family: 'Noto Sans TC', 'Noto Sans TC Full', sans-serif;
  font-weight: 900;
  color: var(--color-yellow);
}
@keyframes cd-pop {
  0% {
    opacity: 0;
    transform: scale(1.8);
  }
  25% {
    opacity: 1;
    transform: scale(0.94);
  }
  40% {
    transform: scale(1);
  }
  85% {
    opacity: 1;
  }
  100% {
    opacity: 0.85;
    transform: scale(0.96);
  }
}
.cd-enter-active,
.cd-leave-active {
  transition: opacity 200ms ease;
}
.cd-enter-from,
.cd-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .num {
    animation: none;
  }
}
</style>
