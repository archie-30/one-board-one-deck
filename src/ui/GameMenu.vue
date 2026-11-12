<script setup lang="ts">
// 對局中的選單：繼續、規則說明（含本局規則）、重新開始、離開
import { ref, watch } from 'vue'
import { S } from '@/data/strings'
import type { GameDef } from '@/games/types'
import Doodle from './art/Doodle.vue'
import DoodleButton from './DoodleButton.vue'
import InkButton from './InkButton.vue'
import InkDialog from './InkDialog.vue'
import RulesBody from './RulesBody.vue'

const props = defineProps<{ open: boolean; game: GameDef; options: Record<string, string | boolean> }>()
const emit = defineEmits<{ close: []; restart: []; exit: [] }>()

const showRules = ref(false)
watch(
  () => props.open,
  (open) => {
    if (open) showRules.value = false
  },
)
</script>

<template>
  <InkDialog :open="open" :title="showRules ? S.rules.title : game.name" wide @close="emit('close')">
    <RulesBody v-if="showRules" :game="game" :options="options" />
    <div v-else class="flex justify-center gap-[1.6rem] px-[0.5rem] pt-[0.8rem] pb-[0.2rem]">
      <DoodleButton :label="S.common.resume" @click="emit('close')"><Doodle name="resume" /></DoodleButton>
      <DoodleButton :label="S.lobby.rulesShort" @click="showRules = true"><Doodle name="book" /></DoodleButton>
      <DoodleButton :label="S.common.restart" @click="emit('restart')"><Doodle name="again" /></DoodleButton>
      <DoodleButton :label="S.common.quit" @click="emit('exit')"><Doodle name="exit" /></DoodleButton>
    </div>
    <template v-if="showRules" #actions>
      <InkButton @click="showRules = false">{{ S.common.back }}</InkButton>
    </template>
  </InkDialog>
</template>
