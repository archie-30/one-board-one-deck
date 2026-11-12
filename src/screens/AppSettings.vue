<script setup lang="ts">
import { computed } from 'vue'
import { settings } from '@/core/settings'
import { playSound } from '@/core/audio'
import { S } from '@/data/strings'
import { VERSION } from '@/data/version'
import InkDialog from '@/ui/InkDialog.vue'
import InkTabs from '@/ui/InkTabs.vue'
import MenuButton from '@/ui/MenuButton.vue'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const levels = [
  { value: '0', label: S.appSettings.mute },
  { value: '0.35', label: S.appSettings.low },
  { value: '0.7', label: S.appSettings.mid },
  { value: '1', label: S.appSettings.high },
]
const current = computed(() => {
  const v = settings.volume
  return levels.reduce((a, b) => (Math.abs(Number(b.value) - v) < Math.abs(Number(a.value) - v) ? b : a)).value
})
function setVolume(v: string) {
  settings.volume = Number(v)
  playSound('stone')
}
</script>

<template>
  <InkDialog :open="open" :title="S.appSettings.title" @close="emit('close')">
    <div class="flex flex-col items-center gap-[0.4rem] py-[0.4rem]">
      <p class="font-display text-[0.95rem]">{{ S.appSettings.volume }}</p>
      <InkTabs :choices="levels" :value="current" @change="setVolume" />
    </div>
    <p class="flex justify-between pt-[0.9rem] text-[0.82rem] text-ink-soft">
      <span>{{ S.appSettings.version }} {{ VERSION.number }}</span>
      <a class="underline underline-offset-[0.2em]" href="./privacy.html" target="_blank" rel="noopener">{{ S.appSettings.privacy }}</a>
    </p>
    <template #actions>
      <div class="w-[9rem]"><MenuButton :label="S.common.close" icon="back" size="sm" :chevron="false" :seed="17" @click="emit('close')" /></div>
    </template>
  </InkDialog>
</template>
