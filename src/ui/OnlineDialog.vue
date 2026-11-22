<script setup lang="ts">
// 連線對戰的入口彈窗：上面輸入房號加入，下面建立新房間。進了房間就換到房間頁。
// 主畫面（底下那一條）和模式選單（右上角）都用這個。
// 連線一定要有玩家名稱：個人資料還沒取名字的話，加入、建立都不能按，最上面提示先到個人資料取名字（附一顆按鈕過去）。
// 房號：左邊一格四條底線（數字一個個彈上來），右邊直接一個數字盤（1～9、0、倒退），手機不會跳出內建鍵盤；
// 電腦上照樣可以直接打數字、倒退、Enter 加入（視窗開著時聽鍵盤）。
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { playSound } from '@/core/audio'
import { go } from '@/core/nav'
import { createRoom, isRoomCode, joinRoom, ROOM_CODE_LENGTH, showOnlineAlert, type JoinError } from '@/core/online'
import { opponentNames } from '@/core/names'
import { levelOf, myLook, profile } from '@/core/profile'
import { S } from '@/data/strings'
import type { GameCategory } from '@/games/types'
import Btn from './Btn.vue'
import Dialog from './Dialog.vue'

const props = defineProps<{ open: boolean; category?: GameCategory }>()
const emit = defineEmits<{ close: [] }>()
const T = S.online

const code = ref('')
const error = ref('')
const busy = ref(false)
/** 建立／加入的動畫至少播一下（連線很快時不要一閃而過） */
const atLeast = () => new Promise<void>((ok) => window.setTimeout(ok, 700))
/** 正在建立／加入：那一顆按鈕換成「＿中」＋跳動的三個點、底下一條來回跑的線 */
const pending = ref<'' | 'create' | 'join'>('')
/** 打錯格式時晃一下：換個 key 重播 */
const shake = ref(0)
/** 還沒取名字：連線要先到個人資料取名字（這裡不能填） */
const needName = ref(!profile.name)
watch(
  () => props.open,
  (on) => {
    if (!on) return
    code.value = ''
    error.value = ''
    busy.value = false
    needName.value = !profile.name
  },
)
/** 去個人資料取名字 */
function toProfile() {
  emit('close')
  go({ name: 'profile' })
}
/** 數字盤／鍵盤：加一個數字 */
function press(d: string) {
  if (busy.value || code.value.length >= ROOM_CODE_LENGTH) return
  code.value += d
  error.value = ''
  playSound('tap')
}
/** 倒退一格 */
function erase() {
  if (busy.value || !code.value) return
  code.value = code.value.slice(0, -1)
  error.value = ''
  playSound('tap')
}
/** 電腦：視窗開著時直接打數字、倒退、Enter（不用先點輸入框） */
function onKey(e: KeyboardEvent) {
  if (!props.open || e.ctrlKey || e.metaKey || e.altKey) return
  if (/^[0-9]$/.test(e.key)) press(e.key)
  else if (e.key === 'Backspace') erase()
  else if (e.key === 'Enter' && code.value.length === ROOM_CODE_LENGTH) void join()
  else return
  e.preventDefault()
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del']
/** 進房失敗：房號格式不對就在輸入框下面提示；其他（找不到、滿了、連不上…）跳說明視窗 */
function fail(r: JoinError) {
  if (r === 'format') {
    error.value = T.errors.format
    return
  }
  error.value = ''
  showOnlineAlert(r)
}
/** 裝置沒連上網路：不用等逾時，直接跟玩家說 */
const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false

/** 進房時給伺服器的個人資料（別人點你的頭像看得到） */
const myCard = () => ({ name: profile.name, look: myLook(), level: levelOf(profile.xp), titles: profile.equipped.slice(0, 2), bots: opponentNames.names.slice() })

async function join() {
  if (busy.value || needName.value) return
  if (!isRoomCode(code.value)) {
    error.value = T.errors.format
    shake.value++
    return
  }
  if (offline()) return showOnlineAlert('offline')
  busy.value = true
  pending.value = 'join'
  const [r] = await Promise.all([joinRoom(code.value, myCard()), atLeast()])
  busy.value = false
  pending.value = ''
  if (typeof r === 'string') return fail(r)
  emit('close')
  go({ name: 'room' })
}

/** 建立房間：一開始不幫玩家選模式（「未選擇模式」） */
async function create() {
  if (busy.value || needName.value) return
  if (offline()) return showOnlineAlert('offline')
  busy.value = true
  pending.value = 'create'
  const [r] = await Promise.all([createRoom(myCard()), atLeast()])
  busy.value = false
  pending.value = ''
  if (typeof r === 'string') return fail(r)
  emit('close')
  go({ name: 'room' })
}
</script>

<template>
  <Dialog :open="open" :title="T.dialogTitle" :label="T.tag" tone="blue" wide close-x @close="emit('close')">
    <!-- 還沒取名字：先去個人資料取 -->
    <div v-if="needName" class="need">
      <p class="nt">{{ T.nameNeed }}</p>
      <Btn size="sm" icon="pencil" @click="toProfile">{{ T.toProfile }}</Btn>
    </div>
    <div class="cols">
      <div class="left">
        <p class="t-label lab">{{ T.joinLabel }}</p>
        <div class="join">
          <!-- 四條底線：打進去的數字一個個彈上來，下一個要打的那格底線變藍、閃一下 -->
          <div :key="shake" class="code" :class="{ bad: !!error }" role="textbox" :aria-label="T.joinLabel" :aria-placeholder="T.joinPh">
            <span v-for="k in ROOM_CODE_LENGTH" :key="k" class="slot" :class="{ next: k - 1 === code.length && !busy }">
              <Transition name="dig">
                <span v-if="code[k - 1]" :key="code[k - 1]" class="d t-slab">{{ code[k - 1] }}</span>
              </Transition>
            </span>
          </div>
          <Btn tone="ink" :disabled="code.length !== ROOM_CODE_LENGTH || busy || needName" @click="join"><span v-if="pending === 'join'" class="wait">{{ T.joining }}<i /><i /><i /></span><template v-else>{{ T.join }}</template></Btn>
        </div>
    <p class="err" :class="{ on: !!error }">{{ error || '　' }}</p>
    <p class="or t-label"><span>{{ T.or }}</span></p>
    <div class="cwrap" :class="{ going: pending === 'create' }">
      <Btn tone="red" size="lg" icon="online" block :disabled="busy || needName" @click="create"><span v-if="pending === 'create'" class="wait">{{ T.creating }}<i /><i /><i /></span><template v-else>{{ T.create }}</template></Btn>
      <span class="run" />
    </div>
    <p class="sub">{{ T.createSub }}</p>
      </div>
      <!-- 數字盤：1～9、0、倒退 -->
      <div class="pad" :aria-label="T.joinLabel">
        <template v-for="(k, i) in KEYS" :key="i">
          <span v-if="!k" />
          <button v-else-if="k === 'del'" type="button" tabindex="-1" class="key del" @pointerdown.prevent :aria-label="T.erase" :disabled="busy || !code" @click="erase">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5h12v14H8l-6-7z" /><path d="m11.5 9.5 5 5m0-5-5 5" /></svg>
          </button>
          <button v-else type="button" tabindex="-1" class="key t-slab" @pointerdown.prevent :disabled="busy || code.length >= ROOM_CODE_LENGTH" @click="press(k)">{{ k }}</button>
        </template>
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
.lab {
  display: block;
  margin-bottom: 0.3rem;
}
.join {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
}
/* 左邊：原本的加入、建立；右邊：數字盤 */
.cols {
  display: flex;
  gap: 1.4rem;
}
.left {
  min-width: 0;
  flex: 1;
}
/* 房號格：跟「加入」按鈕一樣高（中號按鈕 2.4rem）、陰影一樣深；裡面四條底線 */
.code {
  box-sizing: border-box;
  display: flex;
  height: 2.4rem;
  min-width: 0;
  flex: 1;
  align-items: flex-end;
  gap: 0.55rem;
  border: 2px solid var(--color-ink);
  background: var(--color-card);
  box-shadow: 0.22rem 0.22rem 0 var(--color-ink);
  padding: 0 0.7rem 0.35rem;
}
.slot {
  position: relative;
  display: flex;
  height: 100%;
  flex: 1;
  align-items: flex-end;
  justify-content: center;
  border-bottom: 0.16rem solid var(--color-ink-3);
  transition: border-color 160ms ease;
}
.slot.next {
  border-color: var(--color-blue);
  animation: caret 1s steps(2, jump-none) infinite;
}
@keyframes caret {
  50% {
    border-color: var(--color-ink-3);
  }
}
.d {
  position: absolute;
  bottom: 0.1rem;
  font-size: 1.45rem;
  line-height: 1;
}
/* 數字進去：從下面彈上來；倒退：往下沉掉 */
.dig-enter-active {
  transition:
    transform 260ms var(--ease-back),
    opacity 140ms ease;
}
.dig-leave-active {
  transition:
    transform 160ms ease-in,
    opacity 160ms ease-in;
}
.dig-enter-from {
  opacity: 0;
  transform: translateY(0.7rem) scale(0.6);
}
.dig-leave-to {
  opacity: 0;
  transform: translateY(0.5rem) scale(0.8);
}
.code.bad {
  border-color: var(--color-red);
  box-shadow: 0.22rem 0.22rem 0 var(--color-red);
  animation: nope 0.3s linear 1;
}
/* 數字盤：3 × 4 方鍵，黑框、實心陰影，按下去往陰影方向壓 */
.pad {
  display: grid;
  width: 11.5rem;
  flex: none;
  grid-template-columns: repeat(3, 1fr);
  grid-auto-rows: 2.45rem;
  gap: 0.45rem;
  align-self: center;
}
.key {
  position: relative;
  display: grid;
  place-items: center;
  border: 0.13rem solid var(--color-ink);
  border-radius: 0.3rem;
  background: var(--color-card);
  padding: 0;
  font-size: 1.25rem;
  box-shadow: 0.16rem 0.16rem 0 var(--color-ink);
  transition:
    transform 90ms var(--ease-out),
    box-shadow 90ms var(--ease-out),
    background-color 120ms ease;
}
.key:focus {
  /* 按了不會留住焦點框（鍵也不搶 Enter：Enter 是「加入」） */
  outline: none;
}
.key::after {
  content: '';
  position: absolute;
  inset: -0.2rem;
}
.key:active:not(:disabled) {
  transform: translate(0.16rem, 0.16rem);
  box-shadow: none;
  background: var(--color-yellow);
}
.key:disabled {
  opacity: 0.4;
}
.key.del {
  background: var(--color-paper);
}
.key svg {
  width: 1.25rem;
  height: 1.25rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
/* 還沒取名字的提示：黃底一條，右邊一顆「去取名字」 */
.need {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.8rem;
  border: 0.13rem solid var(--color-ink);
  background: var(--color-yellow);
  padding: 0.45rem 0.55rem 0.45rem 0.7rem;
}
.nt {
  flex: 1;
  font-size: 0.82rem;
  font-weight: 900;
  line-height: 1.35;
}
@keyframes nope {
  25% {
    transform: translateX(-0.25rem);
  }
  75% {
    transform: translateX(0.25rem);
  }
}
.err {
  min-height: 1.2rem;
  padding-top: 0.25rem;
  font-size: 0.75rem;
  color: var(--color-red);
  opacity: 0;
  transition: opacity 160ms ease;
}
.err.on {
  opacity: 1;
}
/* 「或是」：左右各一條細線 */
.or {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin: 0.3rem 0 0.7rem;
  color: var(--color-ink-3);
}
.or::before,
.or::after {
  content: '';
  height: 0.1rem;
  flex: 1;
  background: var(--color-line);
}
.sub {
  padding-top: 0.45rem;
  font-size: 0.75rem;
  color: var(--color-ink-2);
}
/* 建立／加入中：字後面三個點輪流跳；建立房間按鈕底下一條線來回跑 */
.wait {
  display: inline-flex;
  align-items: baseline;
  gap: 0.12rem;
}
.wait i {
  display: inline-block;
  width: 0.28rem;
  height: 0.28rem;
  border-radius: 50%;
  background: currentColor;
  animation: hop 900ms ease-in-out infinite;
}
.wait i:first-of-type {
  margin-left: 0.2rem;
}
.wait i:nth-of-type(2) {
  animation-delay: 150ms;
}
.wait i:nth-of-type(3) {
  animation-delay: 300ms;
}
@keyframes hop {
  0%,
  60%,
  100% {
    transform: translateY(0);
    opacity: 0.45;
  }
  30% {
    transform: translateY(-0.3rem);
    opacity: 1;
  }
}
.cwrap {
  position: relative;
}
.run {
  position: absolute;
  left: 0;
  right: 0;
  bottom: -0.55rem;
  height: 0.2rem;
  overflow: hidden;
  opacity: 0;
  transition: opacity 160ms ease;
}
.cwrap.going .run {
  opacity: 1;
}
.run::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  width: 35%;
  background: var(--color-red);
  animation: sweep 1100ms ease-in-out infinite alternate;
}
@keyframes sweep {
  from {
    left: 0;
  }
  to {
    left: 65%;
  }
}
@media (prefers-reduced-motion: reduce) {
  .wait i,
  .run::before {
    animation: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .code.bad,
  .slot.next {
    animation: none;
  }
  .dig-enter-active,
  .dig-leave-active {
    transition: none;
  }
}
</style>
