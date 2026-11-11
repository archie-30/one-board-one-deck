<script setup lang="ts">
import { settings } from '@/core/settings'
import { playSound } from '@/core/audio'
import { S } from '@/data/strings'
import { VERSION } from '@/data/version'
import InkButton from '@/ui/InkButton.vue'
import InkDialog from '@/ui/InkDialog.vue'
import InkIcon from '@/ui/InkIcon.vue'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

function setVolume(event: Event) {
  settings.volume = Number((event.target as HTMLInputElement).value) / 100
  playSound('stone')
}
</script>

<template>
  <InkDialog :open="open" :title="S.appSettings.title" @close="emit('close')">
    <label class="flex items-center gap-[0.8rem] py-[0.6rem]">
      <InkIcon :name="settings.volume > 0 ? 'sound' : 'mute'" class="h-[1.5rem] w-[1.5rem] shrink-0" />
      <span class="shrink-0 text-[1rem]">{{ S.appSettings.volume }}</span>
      <input class="volume min-w-0 flex-1" type="range" min="0" max="100" step="10" :value="Math.round(settings.volume * 100)" @change="setVolume" />
      <span class="w-[2.2rem] text-right text-[0.9rem] tabular-nums text-ink-soft">{{ Math.round(settings.volume * 100) }}</span>
    </label>
    <p class="flex justify-between pt-[0.6rem] text-[0.85rem] text-ink-soft">
      <span>{{ S.appSettings.version }} {{ VERSION.number }}</span>
      <a class="underline underline-offset-[0.2em]" href="./privacy.html" target="_blank" rel="noopener">{{ S.appSettings.privacy }}</a>
    </p>
    <template #actions>
      <InkButton @click="emit('close')">{{ S.common.close }}</InkButton>
    </template>
  </InkDialog>
</template>

<style scoped>
.volume {
  appearance: none;
  height: 1.800rem;
  background: none;
}
.volume::-webkit-slider-runnable-track {
  height: 0.220rem;
  border-radius: 1rem;
  background: var(--color-ink);
}
.volume::-webkit-slider-thumb {
  appearance: none;
  width: 1.300rem;
  height: 1.300rem;
  margin-top: -0.540rem;
  border: 0.160rem solid var(--color-ink);
  border-radius: 50%;
  background: var(--color-red);
}
.volume::-moz-range-track {
  height: 0.220rem;
  background: var(--color-ink);
}
.volume::-moz-range-thumb {
  width: 1.100rem;
  height: 1.100rem;
  border: 0.160rem solid var(--color-ink);
  border-radius: 50%;
  background: var(--color-red);
}
</style>
