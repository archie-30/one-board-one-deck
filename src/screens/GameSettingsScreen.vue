<script setup lang="ts">
// 規則設定頁：畫面完全由註冊表的 settings 產生
import { computed } from 'vue'
import { gamePrefs } from '@/core/settings'
import { playSound } from '@/core/audio'
import { S } from '@/data/strings'
import { resolveOptions } from '@/games/options'
import { getGame } from '@/games/registry'
import InkButton from '@/ui/InkButton.vue'
import ScreenFrame from '@/ui/ScreenFrame.vue'
import SegChoice from '@/ui/SegChoice.vue'

const props = defineProps<{ gameId: string }>()
const game = computed(() => getGame(props.gameId))
const prefs = computed(() => gamePrefs(props.gameId))
const values = computed(() => resolveOptions(game.value))
const dirty = computed(() => game.value.settings.some((d) => values.value[d.key] !== d.default))

function set(key: string, value: string | boolean) {
  prefs.value.options[key] = value
  playSound('tap')
}
function reset() {
  prefs.value.options = {}
}
</script>

<template>
  <ScreenFrame :title="game.name" :lead="S.gameSettings.title">
    <template #actions>
      <InkButton size="sm" :disabled="!dirty" @click="reset">{{ S.gameSettings.reset }}</InkButton>
    </template>
    <div class="scroll-y h-full pr-[1rem]">
      <ul class="max-w-[40rem]">
        <li v-for="def in game.settings" :key="def.key" class="item">
          <div class="min-w-0 flex-1">
            <p class="text-[1.08rem] leading-snug">{{ def.label }}</p>
            <p class="text-[0.85rem] leading-snug text-ink-soft">{{ def.help }}</p>
          </div>
          <SegChoice v-if="def.type === 'choice'" class="shrink-0 justify-end" :choices="def.choices" :value="String(values[def.key])" @change="(v) => set(def.key, v)" />
          <button v-else class="switch" :class="{ on: values[def.key] }" role="switch" :aria-checked="!!values[def.key]" :aria-label="def.label" @click="set(def.key, !values[def.key])">
            <span class="knob" />
          </button>
        </li>
      </ul>
      <p class="pt-[0.6rem] pb-[0.4rem] text-[0.85rem] text-ink-soft">{{ S.gameSettings.note }}</p>
    </div>
  </ScreenFrame>
</template>

<style scoped>
.item {
  display: flex;
  align-items: center;
  gap: 1.400rem;
  padding: 0.650rem 0;
  border-bottom: 0.080rem dashed var(--color-ink-soft);
}
.item :deep(.seg) {
  max-width: 21rem;
}
.switch {
  position: relative;
  flex-shrink: 0;
  width: 3.300rem;
  height: 1.800rem;
  border: 0.140rem solid var(--color-ink);
  border-radius: 1rem 0.850rem 1rem 0.900rem;
  background: var(--color-card);
  transition: background-color 180ms ease;
}
.switch.on {
  background: var(--color-leaf);
}
.knob {
  position: absolute;
  top: 0.160rem;
  left: 0.200rem;
  width: 1.200rem;
  height: 1.200rem;
  border: 0.140rem solid var(--color-ink);
  border-radius: 50%;
  background: var(--color-card);
  transition: transform 200ms var(--ease-out);
}
.switch.on .knob {
  transform: translateX(1.450rem);
}
</style>
