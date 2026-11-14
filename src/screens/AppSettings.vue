<script setup lang="ts">
import { computed } from 'vue'
import { settings } from '@/core/settings'
import { playSound } from '@/core/audio'
import { S } from '@/data/strings'
import { VERSION } from '@/data/version'
import Btn from '@/ui/Btn.vue'
import Dialog from '@/ui/Dialog.vue'
import Tabs from '@/ui/Tabs.vue'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const levels = [
  { value: '0', label: S.appSettings.mute },
  { value: '0.35', label: S.appSettings.low },
  { value: '0.7', label: S.appSettings.mid },
  { value: '1', label: S.appSettings.high },
]
const current = computed(() => levels.reduce((a, b) => (Math.abs(Number(b.value) - settings.volume) < Math.abs(Number(a.value) - settings.volume) ? b : a)).value)
function setVolume(v: string) {
  settings.volume = Number(v)
  playSound('tap')
}
</script>

<template>
  <Dialog :open="open" :title="S.appSettings.title" label="SETTINGS" tone="yellow" @close="emit('close')">
    <p class="t-black pb-[0.3rem] text-[0.9rem]">{{ S.appSettings.volume }}</p>
    <Tabs :choices="levels" :value="current" @change="setVolume" />
    <p class="flex justify-between pt-[1rem] text-[0.75rem] text-ink-2">
      <span>{{ S.appSettings.version }} {{ VERSION.number }}</span>
      <a class="underline underline-offset-[0.2em]" href="./privacy.html" target="_blank" rel="noopener">{{ S.appSettings.privacy }}</a>
    </p>
    <template #actions>
      <Btn icon="close" size="sm" @click="emit('close')">{{ S.common.close }}</Btn>
    </template>
  </Dialog>
</template>
