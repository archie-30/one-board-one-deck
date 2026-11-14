<script setup lang="ts">
// 對局中的選單：繼續、規則說明、重新開始、保存進度並退出、離開
import { ref, watch } from 'vue'
import { S } from '@/data/strings'
import type { GameDef } from '@/games/types'
import Btn from './Btn.vue'
import Dialog from './Dialog.vue'
import RulesBody from './RulesBody.vue'
import AppSettings from '@/screens/AppSettings.vue'

const props = defineProps<{ open: boolean; game: GameDef; options: Record<string, string | boolean>; canSave?: boolean }>()
const emit = defineEmits<{ close: []; restart: []; exit: []; saveExit: [] }>()
const showRules = ref(false)
const settingsOpen = ref(false)
watch(
  () => props.open,
  (open) => {
    if (open) showRules.value = false
  },
)
</script>

<template>
  <Dialog :open="open" :title="showRules ? S.rules.title : S.common.paused" :label="game.name"  wide @close="emit('close')">
    <RulesBody v-if="showRules" :game="game" :options="options" />
    <div v-else class="menu pt-[0.3rem]">
      <Btn class="rise wide-row" tone="red" icon="play" block arrow @click="emit('close')">{{ S.common.resume }}</Btn>
      <Btn class="rise" style="--i: 1" icon="book" block arrow @click="showRules = true">{{ S.lobby.rules }}</Btn>
      <Btn class="rise" style="--i: 1" icon="gear" block arrow @click="settingsOpen = true">{{ S.appSettings.title }}</Btn>
      <Btn class="rise" style="--i: 2" icon="again" block arrow @click="emit('restart')">{{ S.common.restart }}</Btn>
      <Btn class="rise" style="--i: 2" icon="exit" block arrow @click="emit('exit')">{{ canSave ? S.common.quitNoSave : S.common.quit }}</Btn>
      <Btn v-if="canSave" class="rise wide-row" style="--i: 3" tone="yellow" icon="check" block arrow @click="emit('saveExit')">{{ S.common.saveExit }}</Btn>
    </div>
    <template v-if="showRules" #actions>
      <Btn icon="back" size="sm" @click="showRules = false">{{ S.common.back }}</Btn>
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
