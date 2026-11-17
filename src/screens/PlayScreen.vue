<script setup lang="ts">
// 對局外框：開始前先看有沒有「保存進度並退出」留下的存檔。
// 有的話先問要不要接著玩；遊戲要保存時，把它給的資料存起來再離開。
import { gamePrefs, settings } from '@/core/settings'
import { onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import { revealLaunch, startExit } from '@/core/launch'
import { reducedMotion } from '@/core/motion'
import { back, resetTo } from '@/core/nav'
import { leaveRoom, online } from '@/core/online'
import { leaveMid, liveMatch, liveOver } from '@/core/onlineMatch'
import { GRACE_AFTER_MS } from '@/core/grace'
import { clearResume, flushResume, getResume, setResume } from '@/core/resume'
import { S } from '@/data/strings'
import { resolveOptions } from '@/games/options'
import { getGame } from '@/games/registry'
import Btn from '@/ui/Btn.vue'
import Dialog from '@/ui/Dialog.vue'

const props = defineProps<{ gameId: string }>()
const game = getGame(props.gameId)
/** 連線對戰（在房間裡開的局）：不讀、也不存「沒玩完的紀錄」，大家都從新的一局開始 */
const onlineMatch = !!online.room
const saved = onlineMatch ? null : getResume(props.gameId)

const options = ref(resolveOptions(game))
// 暫停選單裡改了「不影響公平」的選項（例如棋子樣式）：馬上套用到這一局；其他選項要下一局才生效
watch(
  () => gamePrefs(game.id).options,
  () => {
    const now = resolveOptions(game)
    for (const d of game.settings) if (d.live && options.value[d.key] !== now[d.key]) options.value = { ...options.value, [d.key]: now[d.key] }
  },
  { deep: true },
)
const resume = ref<unknown>(null)
const ready = ref(!saved)

const when = saved ? new Date(saved.savedAt).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''

function continueSaved() {
  if (!saved) return
  options.value = { ...options.value, ...saved.options, graceFirst: Date.now() - saved.savedAt > GRACE_AFTER_MS }
  resume.value = saved.data
  clearResume(props.gameId)
  ready.value = true
}
function startNew() {
  clearResume(props.gameId)
  ready.value = true
}
// ── 切走分頁、離開視窗、關掉分頁：自動暫停，並把進度存起來（下次開這個玩法會問要不要繼續） ──
const gameRef = ref<{ pause?: () => void; snapshot?: () => unknown } | null>(null)
function autoPause() {
  const g = gameRef.value
  if (!g || leaving || !settings.autoPause) return
  g.pause?.()
  if (onlineMatch) return
  const data = g.snapshot?.() ?? null
  if (data) setResume(props.gameId, data, keep())
  else clearResume(props.gameId)
  flushResume()
}
/** 網頁版：按 Esc 暫停（選單已經打開時由選單自己處理） */
function onEsc(e: KeyboardEvent) {
  if (e.key !== 'Escape' || !ready.value || leaving || e.repeat) return
  gameRef.value?.pause?.()
}
function onVisibility() {
  if (document.visibilityState === 'hidden') autoPause()
}
onMounted(() => {
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('keydown', onEsc)
  window.addEventListener('blur', autoPause)
  window.addEventListener('pagehide', autoPause)
})
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibility)
  window.removeEventListener('keydown', onEsc)
  window.removeEventListener('blur', autoPause)
  window.removeEventListener('pagehide', autoPause)
})

// 對局畫面（或「要不要接著玩」的對話框）出現後，揭開進入遊戲的過場
onMounted(() => requestAnimationFrame(() => requestAnimationFrame(revealLaunch)))

/** 存檔時不留「第一步不限時」的記號（下次接著玩再依存檔時間決定） */
function keep() {
  const { graceFirst: _, ...rest } = options.value
  return rest
}
function onSave(data: unknown) {
  if (!onlineMatch) setResume(props.gameId, data, keep())
  void leave(true)
}

// ── 連線對局的離開 ──
//   遊戲裡的「離開」（暫停選單、結算後的按鈕）＝離開房間、回到自己的主畫面：
//     還沒打完先跳視窗確認（位子由電腦代打）；打完了直接離開。
//   「回到房間」（結算後「再玩一次」底下的小按鈕）＝照一般離開遊戲的過場回到房間頁。
//   確認視窗放在 App 層（RoomCountdown.vue），這裡只交出「確定離開」要做的事。
function onExit() {
  if (!onlineMatch) return void leave()
  if (liveMatch.value && !liveOver.value) leaveMid.value = () => void leaveRoomHome()
  else void leaveRoomHome()
}
onBeforeUnmount(() => (leaveMid.value = null))
async function leaveRoomHome() {
  leaveMid.value = null
  if (leaving) return
  leaving = true
  await leaveRoom()
  resetTo([{ name: 'title' }])
}
provide('onlineExits', { toRoom: () => void leave() })
/** 再玩一次：伺服器開了新的一局（編號換了）→ 遊戲畫面整個換成新的一局 */
const matchKey = () => (onlineMatch ? (liveMatch.value?.n ?? 0) : 0)

/** 離開遊戲：色塊蓋住畫面 → 回到模式選單 → 卡片翻回去、飛回卡片堆（跟進場的翻卡片呼應） */
let leaving = false
async function leave(saved = false) {
  if (leaving) return
  leaving = true
  // 不保存直接離開：把自動存下的進度也刪掉
  if (!saved && !onlineMatch) clearResume(props.gameId)
  if (reducedMotion()) return back()
  const css = getComputedStyle(document.documentElement)
  const color = css.getPropertyValue(game.category === 'cards' ? '--color-red' : '--color-blue').trim()
  await startExit(game.id, color, game.name, game.players)
  back()
}
</script>

<template>
  <component :is="game.component" v-if="ready" :key="matchKey()" ref="gameRef" :game="game" :options="options" :resume="resume" @exit="onExit" @save="onSave" />
  <Dialog v-else open :title="S.common.resumeTitle" :label="game.name" tone="yellow" @close="leave(true)">
    <p class="text-ink-2">{{ S.common.resumeLead(when) }}</p>
    <p class="mt-[0.3rem] text-[0.8rem] text-ink-3">{{ S.common.resumeNewNote }}</p>
    <template #actions>
      <!-- 回上一頁：存檔留著，回到模式選單 -->
      <Btn icon="back" size="sm" @click="leave(true)">{{ S.common.resumeBack }}</Btn>
      <Btn icon="again" size="sm" @click="startNew">{{ S.common.resumeNew }}</Btn>
      <Btn tone="red" icon="play" arrow @click="continueSaved">{{ S.common.resumeContinue }}</Btn>
    </template>
  </Dialog>
</template>
