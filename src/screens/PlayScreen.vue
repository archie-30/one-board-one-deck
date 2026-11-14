<script setup lang="ts">
// 對局外框：開始前先看有沒有「保存進度並退出」留下的存檔。
// 有的話先問要不要接著玩；遊戲要保存時，把它給的資料存起來再離開。
import { onMounted, ref } from 'vue'
import { revealLaunch } from '@/core/launch'
import { back } from '@/core/nav'
import { clearResume, getResume, setResume } from '@/core/resume'
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
// 對局畫面（或「要不要接著玩」的對話框）出現後，揭開進入遊戲的過場
onMounted(() => requestAnimationFrame(() => requestAnimationFrame(revealLaunch)))

function onSave(data: unknown) {
  setResume(props.gameId, data, options.value)
  back()
}
</script>

<template>
  <component :is="game.component" v-if="ready" :game="game" :options="options" :resume="resume" @exit="back()" @save="onSave" />
  <Dialog v-else open :title="S.common.resumeTitle" :label="game.name" tone="yellow" @close="back()">
    <p class="text-ink-2">{{ S.common.resumeLead(when) }}</p>
    <p class="mt-[0.3rem] text-[0.8rem] text-ink-3">{{ S.common.resumeNewNote }}</p>
    <template #actions>
      <Btn icon="again" size="sm" @click="startNew">{{ S.common.resumeNew }}</Btn>
      <Btn tone="red" icon="play" arrow @click="continueSaved">{{ S.common.resumeContinue }}</Btn>
    </template>
  </Dialog>
</template>
