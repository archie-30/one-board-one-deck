<script setup lang="ts">
// 對局外框：開始前先看有沒有「保存進度並退出」留下的存檔。
// 有的話先問要不要接著玩；遊戲要保存時，把它給的資料存起來再離開。
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { revealLaunch, startExit } from '@/core/launch'
import { reducedMotion } from '@/core/motion'
import { back } from '@/core/nav'
import { clearResume, flushResume, getResume, setResume } from '@/core/resume'
import { S } from '@/data/strings'
import { resolveOptions } from '@/games/options'
import { getGame } from '@/games/registry'
import Btn from '@/ui/Btn.vue'
import Dialog from '@/ui/Dialog.vue'

const props = defineProps<{ gameId: string }>()
const game = getGame(props.gameId)
const saved = getResume(props.gameId)

const options = ref(resolveOptions(game))
const resume = ref<unknown>(null)
const ready = ref(!saved)

const when = saved ? new Date(saved.savedAt).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''

function continueSaved() {
  if (!saved) return
  options.value = { ...options.value, ...saved.options }
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
  if (!g || leaving) return
  g.pause?.()
  const data = g.snapshot?.() ?? null
  if (data) setResume(props.gameId, data, options.value)
  else clearResume(props.gameId)
  flushResume()
}
function onVisibility() {
  if (document.visibilityState === 'hidden') autoPause()
}
onMounted(() => {
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('blur', autoPause)
  window.addEventListener('pagehide', autoPause)
})
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibility)
  window.removeEventListener('blur', autoPause)
  window.removeEventListener('pagehide', autoPause)
})

// 對局畫面（或「要不要接著玩」的對話框）出現後，揭開進入遊戲的過場
onMounted(() => requestAnimationFrame(() => requestAnimationFrame(revealLaunch)))

function onSave(data: unknown) {
  setResume(props.gameId, data, options.value)
  void leave(true)
}

/** 離開遊戲：色塊蓋住畫面 → 回到模式選單 → 卡片翻回去、飛回卡片堆（跟進場的翻卡片呼應） */
let leaving = false
async function leave(saved = false) {
  if (leaving) return
  leaving = true
  // 不保存直接離開：把自動存下的進度也刪掉
  if (!saved) clearResume(props.gameId)
  if (reducedMotion()) return back()
  const css = getComputedStyle(document.documentElement)
  const color = css.getPropertyValue(game.category === 'cards' ? '--color-red' : '--color-blue').trim()
  await startExit(game.id, color, game.name, game.players)
  back()
}
</script>

<template>
  <component :is="game.component" v-if="ready" ref="gameRef" :game="game" :options="options" :resume="resume" @exit="leave()" @save="onSave" />
  <Dialog v-else open :title="S.common.resumeTitle" :label="game.name" tone="yellow" @close="back()">
    <p class="text-ink-2">{{ S.common.resumeLead(when) }}</p>
    <p class="mt-[0.3rem] text-[0.8rem] text-ink-3">{{ S.common.resumeNewNote }}</p>
    <template #actions>
      <Btn icon="again" size="sm" @click="startNew">{{ S.common.resumeNew }}</Btn>
      <Btn tone="red" icon="play" arrow @click="continueSaved">{{ S.common.resumeContinue }}</Btn>
    </template>
  </Dialog>
</template>
