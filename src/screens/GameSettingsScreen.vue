<script setup lang="ts">
// 規則設定：畫面完全由註冊表的 settings 產生
import { computed } from 'vue'
import { gamePrefs } from '@/core/settings'
import { S } from '@/data/strings'
import { resolveOptions } from '@/games/options'
import { getGame } from '@/games/registry'
import Btn from '@/ui/Btn.vue'
import Page from '@/ui/Page.vue'
import Tabs from '@/ui/Tabs.vue'

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
  <Page :title="S.gameSettings.title" :label="game.name" num="04">
    <div class="scroll-y h-full pr-[0.8rem]">
      <ul>
        <li v-for="(def, i) in game.settings" :key="def.key" class="item rise" :style="{ '--i': i * 0.6 }">
          <div class="min-w-0 flex-1">
            <p class="t-black text-[1rem] leading-snug">
              {{ def.label }}<span v-if="values[def.key] !== def.default" class="dot" />
            </p>
            <p class="text-[0.78rem] leading-snug text-ink-2">{{ def.help }}</p>
          </div>
          <Tabs v-if="def.type === 'choice'" :choices="def.choices" :value="String(values[def.key])" class="ctl" @change="(v) => set(def.key, v)" />
          <Tabs v-else :choices="onOff" :value="values[def.key] ? 'on' : 'off'" class="ctl" @change="(v) => set(def.key, v === 'on')" />
        </li>
      </ul>
    </div>
    <template #foot>
      <p class="text-[0.75rem] text-ink-2">{{ S.gameSettings.note }}</p>
      <Btn icon="again" size="sm" :disabled="!dirty" @click="prefs.options = {}">{{ S.gameSettings.reset }}</Btn>
    </template>
  </Page>
</template>

<style scoped>
.item {
  display: flex;
  align-items: center;
  gap: 1.4rem;
  padding: 0.55rem 0;
  border-bottom: 1px solid var(--color-line);
}
.ctl {
  flex-shrink: 0;
  max-width: 26rem;
  justify-content: flex-end;
}
.dot {
  display: inline-block;
  width: 0.45rem;
  height: 0.45rem;
  margin-left: 0.35rem;
  background: var(--color-red);
  vertical-align: middle;
}
</style>
