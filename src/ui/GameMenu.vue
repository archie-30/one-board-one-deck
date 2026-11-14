<script setup lang="ts">
// 對局中的選單：繼續、規則說明、重新開始、保存進度並退出、離開
import { ref, watch } from 'vue'
import { S } from '@/data/strings'
import type { GameDef } from '@/games/types'
import Btn from './Btn.vue'
import Dialog from './Dialog.vue'
import RulesBody from './RulesBody.vue'

const props = defineProps<{ open: boolean; game: GameDef; options: Record<string, string | boolean>; canSave?: boolean }>()
const emit = defineEmits<{ close: []; restart: []; exit: []; saveExit: [] }>()
const showRules = ref(false)
watch(
  () => props.open,
  (open) => {
    if (open) showRules.value = false
  },
)
</script>

<template>
  <Dialog :open="open" :title="showRules ? S.rules.title : S.common.paused" :label="game.name" :wide="showRules" @close="emit('close')">
    <RulesBody v-if="showRules" :game="game" :options="options" />
    <div v-else class="flex flex-col gap-[0.55rem] pt-[0.3rem]">
      <Btn class="rise" tone="red" icon="play" block arrow @click="emit('close')">{{ S.common.resume }}</Btn>
      <Btn class="rise" style="--i: 1" icon="book" block arrow @click="showRules = true">{{ S.lobby.rules }}</Btn>
      <Btn class="rise" style="--i: 2" icon="again" block arrow @click="emit('restart')">{{ S.common.restart }}</Btn>
      <Btn v-if="canSave" class="rise" style="--i: 3" tone="yellow" icon="check" block arrow @click="emit('saveExit')">{{ S.common.saveExit }}</Btn>
      <Btn class="rise" style="--i: 4" icon="exit" block arrow @click="emit('exit')">{{ canSave ? S.common.quitNoSave : S.common.quit }}</Btn>
    </div>
    <template v-if="showRules" #actions>
      <Btn icon="back" size="sm" @click="showRules = false">{{ S.common.back }}</Btn>
    </template>
  </Dialog>
</template>
