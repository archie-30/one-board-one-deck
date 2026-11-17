<script setup lang="ts">
// 規則設定：畫面完全由註冊表的 settings 產生（依分組排；難度在模式選單上選，不列在這裡）
// 連線房間裡不是房主：會影響對局的規則反灰（照房主的），只影響自己畫面的（live）照樣能改。
import { computed } from 'vue'
import { isHost, online } from '@/core/online'
import { sendRules } from '@/core/onlineMatch'
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
/** 不是房主：會影響對局的規則照房主送上來的（還沒送過就是預設），只影響自己畫面的照自己的 */
const values = computed(() => {
  const mine = resolveOptions(game.value)
  if (!guest.value) return mine
  const host = online.room?.rules?.gameId === props.gameId ? online.room.rules.options : {}
  const out = { ...mine }
  for (const d of game.value.settings) if (!d.live && d.key !== 'difficulty') out[d.key] = host[d.key] ?? d.default
  return out
})
const shown = computed(() => game.value.settings.filter((d) => d.key !== 'difficulty'))
/** 在房間裡、不是房主：只能改自己畫面的選項 */
const guest = computed(() => !!online.room && !isHost.value)
const editable = computed(() => shown.value.filter((d) => !guest.value || d.live))
const dirty = computed(() => editable.value.some((d) => values.value[d.key] !== d.default))
function set(key: string, value: string | boolean) {
  if (!editable.value.some((d) => d.key === key)) return
  prefs.value.options[key] = value
  hostSync()
}
/** 房主改了房間目前模式的規則：馬上送給伺服器（大家看得到、開局照這份） */
function hostSync() {
  if (online.room && isHost.value && online.room.gameId === props.gameId) sendRules(props.gameId)
}
/** 恢復預設：只動這一頁上能改的選項（難度保留） */
function reset() {
  for (const d of editable.value) delete prefs.value.options[d.key]
  hostSync()
}
</script>

<template>
  <Page :title="S.gameSettings.title" :label="game.name" num="04" :back-label="S.gameSettings.backApply">
    <div class="scroll-y h-full pr-[0.8rem]">
      <RuleOptions :game="game" :values="values" :lock-unsafe="guest" :lock-note="S.gameSettings.hostOnly" @set="set" />
    </div>
    <template #foot>
      <p class="text-[0.75rem] text-ink-2">{{ S.gameSettings.note }}</p>
      <Btn icon="again" size="sm" :disabled="!dirty" @click="reset">{{ S.gameSettings.reset }}</Btn>
    </template>
  </Page>
</template>
