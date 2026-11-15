<script setup lang="ts">
// 對局中的選單：繼續、規則說明、重新開始、保存進度並退出、離開
import { computed, onBeforeUnmount, ref, watch } from 'vue'
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
</script>

<template>
  <Dialog :open="open" :title="showRules ? S.rules.title : showOptions ? S.gameSettings.title : S.common.paused" :label="game.name" wide cover @close="emit('close')">
    <RulesBody v-if="showRules" :game="game" :options="options" />
    <div v-else-if="showOptions">
      <p class="mb-[0.3rem] text-[0.78rem] text-ink-2">{{ S.gameSettings.liveNote }}</p>
      <RuleOptions :game="game" :values="options" lock-unsafe @set="setOption" />
    </div>
    <div v-else class="menu pt-[0.3rem]">
      <Btn class="rise wide-row" tone="red" icon="play" block arrow @click="emit('close')">{{ S.common.resume }}</Btn>
      <Btn class="rise" style="--i: 1" icon="book" block arrow @click="showRules = true">{{ S.lobby.rules }}</Btn>
      <Btn v-if="hasOptions" class="rise" style="--i: 1" icon="pencil" block arrow @click="showOptions = true">{{ S.lobby.settings }}</Btn>
      <Btn class="rise" style="--i: 1" icon="gear" block arrow @click="settingsOpen = true">{{ S.appSettings.title }}</Btn>
      <Btn class="rise" style="--i: 2" icon="again" block arrow @click="emit('restart')">{{ S.common.restart }}</Btn>
      <Btn class="rise" :class="{ 'wide-row': hasOptions }" style="--i: 2" icon="exit" block arrow :tone="quitArmed ? 'yellow' : 'plain'" @click="quit">{{ quitArmed ? S.common.quitConfirm : canSave ? S.common.quitNoSave : S.common.quit }}</Btn>
      <Btn v-if="canSave" class="rise wide-row" style="--i: 3" tone="yellow" icon="check" block arrow @click="emit('saveExit')">{{ S.common.saveExit }}</Btn>
    </div>
    <template v-if="showRules || showOptions" #actions>
      <Btn icon="back" size="sm" @click="(showRules = false), (showOptions = false)">{{ S.common.back }}</Btn>
    </template>
  </Dialog>
  <AppSettings :open="settingsOpen" @close="settingsOpen = false" />
</template>

<style scoped>
/* 選單按鈕排成兩欄，最常用的「繼續」和「保存進度並退出」佔整排 */
.menu {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.55rem 0.7rem;
}
.menu > .wide-row {
  grid-column: 1 / -1;
}
</style>
