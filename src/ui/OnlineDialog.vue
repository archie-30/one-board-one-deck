<script setup lang="ts">
// 連線對戰的入口彈窗：上面輸入房號加入，下面建立新房間。進了房間就換到房間頁。
// 主畫面（底下那一條）和模式選單（右上角）都用這個。
// 連線一定要有玩家名稱：個人資料還沒取名字的話，加入、建立都不能按，最上面提示先到個人資料取名字（附一顆按鈕過去）。
import { nextTick, ref, watch } from 'vue'
import { go } from '@/core/nav'
import { createRoom, isRoomCode, joinRoom, ROOM_CODE_LENGTH } from '@/core/online'
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
const input = ref<HTMLInputElement>()
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
/** 只收數字 */
function onInput(e: Event) {
  const el = e.target as HTMLInputElement
  code.value = el.value.replace(/\D/g, '').slice(0, ROOM_CODE_LENGTH)
  el.value = code.value
  error.value = ''
}
/** 進房時給伺服器的個人資料（別人點你的頭像看得到） */
const myCard = () => ({ name: profile.name, look: myLook(), level: levelOf(profile.xp), titles: profile.equipped.slice(0, 2), bots: opponentNames.names.slice() })

async function join() {
  if (busy.value || needName.value) return
  if (!isRoomCode(code.value)) {
    error.value = T.errors.format
    void nextTick(() => input.value?.focus())
    return
  }
  busy.value = true
  pending.value = 'join'
  const [r] = await Promise.all([joinRoom(code.value, myCard()), atLeast()])
  busy.value = false
  pending.value = ''
  if (typeof r === 'string') {
    error.value = T.errors[r]
    return
  }
  emit('close')
  go({ name: 'room' })
}

/** 建立房間：一開始不幫玩家選模式（「未選擇模式」） */
async function create() {
  if (busy.value || needName.value) return
  busy.value = true
  pending.value = 'create'
  const [r] = await Promise.all([createRoom(myCard()), atLeast()])
  busy.value = false
  pending.value = ''
  if (typeof r === 'string') {
    error.value = T.errors[r]
    return
  }
  emit('close')
  go({ name: 'room' })
}
</script>

<template>
  <Dialog :open="open" :title="T.dialogTitle" :label="T.tag" tone="blue" close-x @close="emit('close')">
    <!-- 還沒取名字：先去個人資料取 -->
    <div v-if="needName" class="need">
      <p class="nt">{{ T.nameNeed }}</p>
      <Btn size="sm" icon="pencil" @click="toProfile">{{ T.toProfile }}</Btn>
    </div>
    <label class="t-label lab" for="room-code">{{ T.joinLabel }}</label>
    <div class="join">
      <input
        id="room-code"
        ref="input"
        :value="code"
        class="t-slab code"
        :class="{ bad: !!error }"
        type="text"
        inputmode="numeric"
        autocomplete="off"
        enterkeyhint="go"
        :maxlength="ROOM_CODE_LENGTH"
        :placeholder="T.joinPh"
        @input="onInput"
        @keydown.enter="join"
      />
      <Btn tone="ink" :disabled="code.length !== ROOM_CODE_LENGTH || busy || needName" @click="join"><span v-if="pending === 'join'" class="wait">{{ T.joining }}<i /><i /><i /></span><template v-else>{{ T.join }}</template></Btn>
    </div>
    <p class="err" :class="{ on: !!error }">{{ error || '　' }}</p>
    <p class="or t-label"><span>{{ T.or }}</span></p>
    <div class="cwrap" :class="{ going: pending === 'create' }">
      <Btn tone="red" size="lg" icon="online" block :disabled="busy || needName" @click="create"><span v-if="pending === 'create'" class="wait">{{ T.creating }}<i /><i /><i /></span><template v-else>{{ T.create }}</template></Btn>
      <span class="run" />
    </div>
    <p class="sub">{{ T.createSub }}</p>
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
/* 輸入框跟「加入」按鈕一樣高（中號按鈕 2.4rem）、陰影一樣深，上下對齊 */
.code {
  box-sizing: border-box;
  height: 2.4rem;
  min-width: 0;
  flex: 1;
  border: 2px solid var(--color-ink);
  background: var(--color-card);
  box-shadow: 0.22rem 0.22rem 0 var(--color-ink);
  padding: 0 0.6rem;
  font-size: 1.35rem;
  line-height: 1;
  letter-spacing: 0.35em;
  outline: none;
}
.code::placeholder {
  font-family: 'Noto Sans TC', sans-serif;
  font-size: 0.9rem;
  font-weight: 500;
  letter-spacing: 0.05em;
  color: var(--color-ink-3);
}
.code:focus {
  border-color: var(--color-blue);
  box-shadow: 0.22rem 0.22rem 0 var(--color-blue);
}
.code.bad {
  border-color: var(--color-red);
  box-shadow: 0.22rem 0.22rem 0 var(--color-red);
  animation: nope 0.3s linear 1;
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
  .code.bad {
    animation: none;
  }
}
</style>
