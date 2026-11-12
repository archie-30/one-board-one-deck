<script setup lang="ts">
// 對局中的選單（INKRAGE 的暫停畫面）：繼續、規則說明、重新開始、離開
import { ref, watch } from 'vue'
import { S } from '@/data/strings'
import type { GameDef } from '@/games/types'
import InkDialog from './InkDialog.vue'
import MenuButton from './MenuButton.vue'
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
  <InkDialog :open="open" :title="showRules ? S.rules.title : S.common.paused" :wide="showRules" @close="emit('close')">
    <RulesBody v-if="showRules" :game="game" :options="options" />
    <div v-else class="flex flex-col gap-[0.6rem] px-[0.4rem] py-[0.3rem]">
      <MenuButton class="slide-in" primary icon="play" :label="S.common.resume" :seed="2" @click="emit('close')" />
      <MenuButton class="slide-in" style="--i: 1" icon="book" :label="S.lobby.rules" :seed="4" @click="showRules = true" />
      <MenuButton class="slide-in" style="--i: 2" icon="again" :label="S.common.restart" :seed="6" @click="emit('restart')" />
      <MenuButton class="slide-in" style="--i: 3" icon="exit" :label="S.common.quit" :seed="8" @click="emit('exit')" />
    </div>
    <template v-if="showRules" #actions>
      <div class="w-[9rem]"><MenuButton :label="S.common.back" icon="back" size="sm" :chevron="false" :seed="10" @click="showRules = false" /></div>
    </template>
  </InkDialog>
</template>
