<script setup lang="ts">
// 連線房間的開局倒數（放在 App 最上層，換頁時不會消失）。倒數與開局都聽伺服器的：
//   伺服器說開始倒數（房間的 countdownEnd）→ 畫面正中間大大的 3、2、1，疊在所有東西上面（連換頁、過場都看得到）；
//   倒數開始時不在房間頁的人，直接換頁回到房間。
//   伺服器說開局（matchStart）→「開始！」，房間中間那張模式卡片拿起來、翻面、展開（跟一般開始遊戲一樣的過場），大家同時進入對局。
//   倒數中有人取消準備、改觀戰、換模式、斷線，伺服器就把倒數取消。
//   打完離開對局回到房間：告訴伺服器（backToRoom）。
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { playSound } from '@/core/audio'
import { startLaunch } from '@/core/launch'
import { reducedMotion } from '@/core/motion'
import { go, resetTo, route } from '@/core/nav'
import { backToRoom, giveUpReconnect, imHere, matchStart, online, onlineAlert, roomCountdown } from '@/core/online'
import { leaveMid, rejoinMatch } from '@/core/onlineMatch'
import { S } from '@/data/strings'
import { getGame } from '@/games/registry'
import Btn from '@/ui/Btn.vue'
import Dialog from '@/ui/Dialog.vue'

const T = S.online.status
/**
 * 連線出問題的說明視窗（在哪一頁都看得到）：進房失敗、被請出、房間解散、斷線太久、回不到房間、動作太快。
 * 每一種都有標題＋白話說明，按「知道了」關掉。
 */
const alertKind = ref('')
// 開 App 時就發生的（重新整理後回不到原本的房間）：這個元件掛上來時已經有了
if (onlineAlert.n) alertKind.value = onlineAlert.kind
watch(
  () => onlineAlert.n,
  () => {
    alertKind.value = onlineAlert.kind
    playSound('error')
  },
)
const alertText = computed(() => {
  const k = alertKind.value
  if (k === 'kicked') return { title: S.online.kickedTitle, lead: S.online.kickedLead }
  if (k === 'idle') return { title: S.online.idleOutTitle, lead: S.online.idleOutLead }
  const a = S.online.alerts as Record<string, { title: string; lead: string }>
  return a[k] ?? a.closed
})
/**
 * 斷線、正在重新連線：斷超過 1.2 秒才跳（回到 App、網路小抖動一下就連回來的不用跳），
 * 連回來就自動收起來；可以按「離開房間」不等了。
 */
const retryShown = ref(false)
let retryDelay = 0
watch(
  () => online.retry,
  (n) => {
    window.clearTimeout(retryDelay)
    if (!n) {
      retryShown.value = false
      return
    }
    if (!retryShown.value) retryDelay = window.setTimeout(() => online.retry && (retryShown.value = true), 1200)
  },
)
function leaveNow() {
  retryShown.value = false
  void giveUpReconnect()
  if (route.value.name === 'room' || route.value.name === 'play') resetTo([{ name: 'title' }])
}
/** 房間太久沒開始遊戲：伺服器問「還在嗎」，每個人都跳視窗，10 秒內要按「我還在」 */
const askHere = computed(() => !!online.room?.checkEnd && !online.room.checked)
const hereMs = computed(() => Math.max(0, (online.room?.checkEnd ?? 0) - Date.now() - 1500))
watch(askHere, (on) => on && playSound('tap'))
const end = computed(() => online.room?.countdownEnd ?? 0)
/** 畫面上顯示的字：3、2、1、開始！（空字串＝不顯示） */
const shown = ref('')
let timer = 0
let hideTimer = 0

function stop() {
  window.clearInterval(timer)
  roomCountdown.value = 0
  if (shown.value !== T.startNow) shown.value = ''
}
/** 照倒數結束的時間算現在顯示幾（每 0.1 秒檢查一次，換數字時響一聲） */
function update() {
  const n = Math.max(1, Math.ceil((end.value - Date.now()) / 1000))
  if (n === roomCountdown.value) return
  roomCountdown.value = n
  shown.value = String(n)
  playSound('tap')
}

watch(end, (t) => {
  window.clearInterval(timer)
  if (!t) return stop()
  window.clearTimeout(hideTimer)
  // 不在房間頁：直接換頁回到房間（倒數照樣在最上層）
  if (route.value.name !== 'room') resetTo([{ name: 'title' }, { name: 'room' }])
  roomCountdown.value = 0
  update()
  timer = window.setInterval(update, 100)
})
// 伺服器說開局
watch(
  () => matchStart.value.n,
  () => {
    window.clearInterval(timer)
    roomCountdown.value = 0
    shown.value = T.startNow
    playSound('shuffle')
    window.clearTimeout(hideTimer)
    hideTimer = window.setTimeout(() => (shown.value = ''), 700)
    void launch(matchStart.value.gameId)
  },
)
// 對局中離開又用房號加回來：伺服器送來這一局 → 等換到房間頁（加入視窗會先換頁），跟開局一樣用房間那張模式卡片翻面進場（接著打）
let rejoinGame = ''
watch(rejoinMatch, (r) => {
  if (!r) return
  rejoinGame = r.gameId
  if (route.value.name === 'room') rejoinLaunch()
})
watch(
  () => route.value.name,
  (now) => now === 'room' && rejoinGame && rejoinLaunch(),
)
function rejoinLaunch() {
  const id = rejoinGame
  rejoinGame = ''
  // 等房間頁的卡片出現再起飛
  window.setTimeout(() => void launch(id), 350)
}
// 打完從對局回到房間
watch(
  () => route.value.name,
  (now, before) => {
    if (before === 'play' && now !== 'play') backToRoom()
  },
)
onBeforeUnmount(() => {
  stop()
  window.clearTimeout(hideTimer)
})

/** 開局：房間中間那張卡片翻面展開（跟模式選單開始遊戲一樣），同時先把遊戲載好 */
async function launch(gameId: string) {
  if (!online.room || !gameId) return
  const g = getGame(gameId)
  // 觀戰：撲克牌先不支援（留在房間等大家打完）
  if (g.category === 'cards' && online.room.players.find((p) => p.me)?.spectator) return
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
  <!-- 斷線、正在重新連線（連回來自動收起） -->
  <Dialog :open="retryShown && !!online.retry" :title="S.online.retryTitle" label="ONLINE" tone="ink">
    <p class="text-[0.9rem] text-ink-2">{{ S.online.retryLead }}</p>
    <p class="retry t-label"><span class="dots"><i /><i /><i /></span>{{ S.online.retryTry(online.retry) }}</p>
    <template #actions>
      <Btn tone="red" icon="exit" block @click="leaveNow">{{ S.online.retryLeave }}</Btn>
    </template>
  </Dialog>
  <!-- 連線出問題的說明（放在重新連線視窗後面，兩個都有時疊在上面） -->
  <Dialog :open="!!alertKind" :title="alertText.title" label="ONLINE" tone="ink" @close="alertKind = ''">
    <p class="text-[0.9rem] text-ink-2">{{ alertText.lead }}</p>
    <template #actions>
      <Btn tone="ink" block data-back @click="alertKind = ''">{{ S.online.ok }}</Btn>
    </template>
  </Dialog>
 <!-- 連線對局還沒打完就要離開：確認（離開房間、位子由電腦代打） -->
  <Dialog :open="!!leaveMid" :title="S.online.leaveMidAsk" label="ONLINE" tone="ink" @close="leaveMid = null">
    <p class="text-[0.9rem] text-ink-2">{{ S.online.leaveMidLead }}</p>
    <template #actions>
      <div class="grid w-full grid-cols-2 gap-[0.8rem]">
        <Btn block @click="leaveMid = null">{{ S.online.stayHere }}</Btn>
        <Btn tone="red" block icon="exit" @click="leaveMid?.()">{{ S.online.leaveRoom }}</Btn>
      </div>
    </template>
  </Dialog>
  <Dialog :open="askHere" :title="S.online.idleTitle" label="ROOM" tone="ink" @close="imHere">
    <p class="text-[0.9rem] text-ink-2">{{ S.online.idleLead }}</p>
    <span :key="online.room?.checkEnd" class="here-bar" :style="{ '--ms': `${hereMs}ms` }" />
    <template #actions>
      <Btn tone="red" icon="check" block @click="imHere">{{ S.online.idleHere }}</Btn>
    </template>
  </Dialog>
</template>

<style scoped>
/* 「還在嗎」的 10 秒倒數條 */
.here-bar {
  display: block;
  height: 0.25rem;
  margin-top: 0.7rem;
  background: var(--color-red);
  transform-origin: left;
  animation: here-drain var(--ms) linear forwards;
}
@keyframes here-drain {
  to {
    transform: scaleX(0);
  }
}
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
.retry {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.7rem;
  color: var(--color-ink-3);
}
/* 跳動的三個點：還在試 */
.dots {
  display: inline-flex;
  gap: 0.18rem;
}
.dots i {
  width: 0.36rem;
  height: 0.36rem;
  border-radius: 50%;
  background: var(--color-red);
  animation: dot 0.9s ease-in-out infinite;
}
.dots i:nth-child(2) {
  animation-delay: 0.15s;
}
.dots i:nth-child(3) {
  animation-delay: 0.3s;
}
@keyframes dot {
  0%,
  60%,
  100% {
    transform: none;
    opacity: 0.4;
  }
  30% {
    transform: translateY(-0.25rem);
    opacity: 1;
  }
}
</style>
