<script setup lang="ts">
// 對局中的選單：繼續、規則說明、重新開始、保存進度並退出、離開
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { gamePrefs } from '@/core/settings'
import { S } from '@/data/strings'
import type { GameDef } from '@/games/types'
import Btn from './Btn.vue'
import Dialog from './Dialog.vue'
import RulesBody from './RulesBody.vue'
import RuleOptions from './RuleOptions.vue'
import AppSettings from '@/screens/AppSettings.vue'

const props = defineProps<{ open: boolean; game: GameDef; options: Record<string, string | boolean>; canSave?: boolean }>()
const emit = defineEmits<{ close: []; restart: []; exit: []; saveExit: [] }>()
const showRules = ref(false)
/** 暫停選單裡的規則設定：會影響這一局公平的選項反灰；不影響的（例如棋子樣式）可以當場改 */
const showOptions = ref(false)
const hasOptions = computed(() => props.game.settings.some((d) => d.key !== 'difficulty'))
function setOption(key: string, value: string | boolean) {
  // 存進偏好；對局畫面（PlayScreen）會把「不影響公平」的選項馬上套用到這一局
  gamePrefs(props.game.id).options[key] = value
}
const settingsOpen = ref(false)
watch(
  () => props.open,
  (open) => {
    if (open) {
      showRules.value = false
      showOptions.value = false
    }
    quitArmed.value = false
    restartArmed.value = false
  },
)

// 「離開並認輸」要按兩次：第一次變成「再按一次認輸離開」，2.5 秒內再按才離開
const quitArmed = ref(false)
let quitTimer = 0
function quit() {
  if (!props.canSave || quitArmed.value) {
    window.clearTimeout(quitTimer)
    emit('exit')
    return
  }
  quitArmed.value = true
  window.clearTimeout(quitTimer)
  quitTimer = window.setTimeout(() => (quitArmed.value = false), 2500)
}
onBeforeUnmount(() => window.clearTimeout(quitTimer))

// 「投降並重新開始」也要按兩次；還沒動過（或已經結束）時就是一般的「重新開始」，按一下就重來
const restartArmed = ref(false)
let restartTimer = 0
function restart() {
  if (!props.canSave || restartArmed.value) {
    window.clearTimeout(restartTimer)
    restartArmed.value = false
    emit('restart')
    return
  }
  restartArmed.value = true
  window.clearTimeout(restartTimer)
  restartTimer = window.setTimeout(() => (restartArmed.value = false), 2500)
}
onBeforeUnmount(() => window.clearTimeout(restartTimer))

// 網頁版：選單打開時按 Esc——在規則說明／規則設定裡就回到選單，在選單就繼續遊戲
// （比對局畫面「按 Esc 暫停」先收到，並攔下來，免得關掉又馬上打開）
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' || !props.open) return
  e.stopImmediatePropagation()
  if (settingsOpen.value) settingsOpen.value = false
  else if (showRules.value || showOptions.value) ((showRules.value = false), (showOptions.value = false))
  else emit('close')
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
/** 選單、規則說明、規則設定之間切換：舊的往下沉淡出、新的往上浮 */
const view = computed(() => (showRules.value ? 'rules' : showOptions.value ? 'options' : 'menu'))
</script>

<template>
  <Dialog :open="open" :title="showRules ? S.rules.title : showOptions ? S.gameSettings.title : S.common.paused" :label="game.name" wide cover @close="emit('close')">
    <Transition name="view" mode="out-in">
    <RulesBody v-if="view === 'rules'" key="rules" :game="game" :options="options" />
    <div v-else-if="view === 'options'" key="options">
      <p class="mb-[0.3rem] text-[0.78rem] text-ink-2">{{ S.gameSettings.liveNote }}</p>
      <RuleOptions :game="game" :values="options" lock-unsafe @set="setOption" />
    </div>
    <div v-else key="menu" class="menu pt-[0.3rem]">
      <Btn class="wide-row" tone="red" icon="play" block arrow @click="emit('close')">{{ S.common.resume }}</Btn>
      <Btn icon="book" block arrow @click="showRules = true">{{ S.lobby.rules }}</Btn>
      <Btn v-if="hasOptions" class="" icon="pencil" block arrow @click="showOptions = true">{{ S.lobby.settings }}</Btn>
      <Btn icon="gear" block arrow @click="settingsOpen = true">{{ S.appSettings.title }}</Btn>
      <Btn icon="again" block arrow :tone="restartArmed ? 'yellow' : 'plain'" @click="restart">{{ restartArmed ? S.common.quitConfirm : canSave ? S.common.restartGiveUp : S.common.restart }}</Btn>
      <Btn icon="exit" block arrow :tone="quitArmed ? 'yellow' : 'plain'" @click="quit">{{ quitArmed ? S.common.quitConfirm : canSave ? S.common.quitNoSave : S.common.quit }}</Btn>
      <Btn v-if="canSave" tone="yellow" icon="check" block arrow @click="emit('saveExit')">{{ S.common.saveExit }}</Btn>
    </div>
    </Transition>
    <template v-if="showRules || showOptions" #actions>
      <Btn icon="back" size="sm" @click="(showRules = false), (showOptions = false)">{{ S.common.back }}</Btn>
    </template>
  </Dialog>
  <AppSettings :open="settingsOpen" @close="settingsOpen = false" />
</template>

<style scoped>
/* 選單按鈕排成兩欄：「繼續」佔整排，其餘兩兩並排；剩一顆落單時才佔整排 */
.menu {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.55rem 0.7rem;
}
.menu > .wide-row,
.menu > :last-child:nth-child(even) {
  grid-column: 1 / -1;
}
.view-enter-active {
  transition:
    opacity 200ms var(--ease-out),
    transform 260ms var(--ease-out);
}
.view-leave-active {
  transition:
    opacity 120ms ease-in,
    transform 120ms ease-in;
}
.view-enter-from {
  opacity: 0;
  transform: translateY(0.7rem);
}
.view-leave-to {
  opacity: 0;
  transform: translateY(0.4rem);
}
@media (prefers-reduced-motion: reduce) {
  .view-enter-active,
  .view-leave-active {
    transition: none;
  }
}
</style>
