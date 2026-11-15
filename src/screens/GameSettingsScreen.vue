<script setup lang="ts">
// 規則設定：畫面完全由註冊表的 settings 產生（依分組排；難度在模式選單上選，不列在這裡）
import { computed } from 'vue'
import { gamePrefs } from '@/core/settings'
import { S } from '@/data/strings'
import { resolveOptions } from '@/games/options'
import { getGame } from '@/games/registry'
import Btn from '@/ui/Btn.vue'
import Page from '@/ui/Page.vue'
import RuleOptions from '@/ui/RuleOptions.vue'

const props = defineProps<{ gameId: string }>()
const game = computed(() => getGame(props.gameId))
const prefs = computed(() => gamePrefs(props.gameId))
const values = computed(() => resolveOptions(game.value))
const shown = computed(() => game.value.settings.filter((d) => d.key !== 'difficulty'))
const dirty = computed(() => shown.value.some((d) => values.value[d.key] !== d.default))
function set(key: string, value: string | boolean) {
  prefs.value.options[key] = value
}
/** 恢復預設：只動這一頁上的選項（難度保留） */
function reset() {
  for (const d of shown.value) delete prefs.value.options[d.key]
}
</script>

<template>
  <Page :title="S.gameSettings.title" :label="game.name" num="04" :back-label="S.gameSettings.backApply">
    <div class="scroll-y h-full pr-[0.8rem]">
      <RuleOptions :game="game" :values="values" @set="set" />
    </div>
    <template #foot>
      <p class="text-[0.75rem] text-ink-2">{{ S.gameSettings.note }}</p>
      <Btn icon="again" size="sm" :disabled="!dirty" @click="reset">{{ S.gameSettings.reset }}</Btn>
    </template>
  </Page>
</template>
