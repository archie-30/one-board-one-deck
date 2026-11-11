<script setup lang="ts">
// 對局中的選單：繼續、規則說明（含本局規則）、重新開始、離開
import { ref, watch } from 'vue'
import { S } from '@/data/strings'
import type { GameDef } from '@/games/types'
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
  <InkDialog :open="open" :title="showRules ? S.rules.title : game.name" :wide="showRules" @close="emit('close')">
    <RulesBody v-if="showRules" :game="game" :options="options" />
    <div v-else class="flex flex-col gap-[0.7rem] px-[0.5rem] py-[0.4rem]">
      <InkButton tone="red" @click="emit('close')">{{ S.common.resume }}</InkButton>
      <InkButton :variant="1" @click="showRules = true">{{ S.lobby.rules }}</InkButton>
      <InkButton :variant="2" @click="emit('restart')">{{ S.common.restart }}</InkButton>
      <InkButton :variant="1" @click="emit('exit')">{{ S.common.quit }}</InkButton>
    </div>
    <template v-if="showRules" #actions>
      <InkButton @click="showRules = false">{{ S.common.back }}</InkButton>
    </template>
  </InkDialog>
</template>
