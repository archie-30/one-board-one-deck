<script setup lang="ts">
// 規則設定：畫面完全由註冊表的 settings 產生。開關與選項都用 INKRAGE 的分頁框。
import { computed } from 'vue'
import { gamePrefs } from '@/core/settings'
import { S } from '@/data/strings'
import { resolveOptions } from '@/games/options'
import { getGame } from '@/games/registry'
import InkPanel from '@/ui/InkPanel.vue'
import InkTabs from '@/ui/InkTabs.vue'
import MenuButton from '@/ui/MenuButton.vue'

const props = defineProps<{ gameId: string }>()
const game = computed(() => getGame(props.gameId))
const prefs = computed(() => gamePrefs(props.gameId))
const values = computed(() => resolveOptions(game.value))
const dirty = computed(() => game.value.settings.some((d) => values.value[d.key] !== d.default))
const onOff = [
  { value: 'on', label: S.common.on },
  { value: 'off', label: S.common.off },
]

function set(key: string, value: string | boolean) {
  prefs.value.options[key] = value
}
</script>

<template>
  <InkPanel :title="S.gameSettings.title" :sub="game.name">
    <div class="scroll-y h-full pr-[0.8rem]">
      <ul class="list">
        <li v-for="(def, i) in game.settings" :key="def.key" class="item slide-in" :style="{ '--i': i * 0.6 }">
          <div class="min-w-0 flex-1">
            <p class="font-display text-[1.02rem] leading-snug">
              {{ def.label }}
              <span v-if="values[def.key] !== def.default" class="dot" />
            </p>
            <p class="text-[0.85rem] leading-snug text-ink-soft">{{ def.help }}</p>
          </div>
          <InkTabs v-if="def.type === 'choice'" :choices="def.choices" :value="String(values[def.key])" class="shrink-0" @change="(v) => set(def.key, v)" />
          <InkTabs v-else :choices="onOff" :value="values[def.key] ? 'on' : 'off'" class="shrink-0" @change="(v) => set(def.key, v === 'on')" />
        </li>
      </ul>
    </div>
    <template #foot>
      <p class="pb-[0.5rem] text-[0.82rem] text-ink-soft">{{ S.gameSettings.note }}</p>
      <div class="w-[10rem]"><MenuButton :label="S.gameSettings.reset" icon="again" size="sm" :chevron="false" :disabled="!dirty" :seed="13" @click="prefs.options = {}" /></div>
    </template>
  </InkPanel>
</template>

<style scoped>
.list {
  columns: 1;
}
.item {
  display: flex;
  align-items: center;
  gap: 1.4rem;
  padding: 0.55rem 0;
  border-bottom: 0.08rem dashed var(--color-mid);
}
.item :deep(.tabs) {
  flex-wrap: wrap;
  max-width: 27rem;
  justify-content: flex-end;
}
.dot {
  display: inline-block;
  width: 0.45rem;
  height: 0.45rem;
  margin-left: 0.3rem;
  border-radius: 50%;
  background: var(--color-red);
  vertical-align: middle;
}
</style>
