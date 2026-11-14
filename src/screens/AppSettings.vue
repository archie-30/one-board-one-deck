<script setup lang="ts">
// 整個遊戲的設定：音量、全螢幕、減少動畫、清除戰績。主畫面、模式選單、暫停選單都可以打開。
import { computed, ref } from 'vue'
import { playSound } from '@/core/audio'
import { fullscreenSupported, isFullscreen, setFullscreen } from '@/core/fullscreen'
import { resetStats, settings } from '@/core/settings'
import { S } from '@/data/strings'
import { VERSION } from '@/data/version'
import Btn from '@/ui/Btn.vue'
import Dialog from '@/ui/Dialog.vue'
import Tabs from '@/ui/Tabs.vue'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const T = S.appSettings
const levels = [
  { value: '0', label: T.mute },
  { value: '0.35', label: T.low },
  { value: '0.7', label: T.mid },
  { value: '1', label: T.high },
]
const onOff = [
  { value: 'on', label: S.common.on },
  { value: 'off', label: S.common.off },
]
const current = computed(() => levels.reduce((a, b) => (Math.abs(Number(b.value) - settings.volume) < Math.abs(Number(a.value) - settings.volume) ? b : a)).value)
function setVolume(v: string) {
  settings.volume = Number(v)
  playSound('tap')
}
function setMotion(v: string) {
  settings.reduceMotion = v === 'on'
}
function setFull(v: string) {
  void setFullscreen(v === 'on')
}

// 清除戰績要再確認一次
const confirmReset = ref(false)
const resetDone = ref(false)
function doReset() {
  if (!confirmReset.value) {
    confirmReset.value = true
    return
  }
  resetStats()
  confirmReset.value = false
  resetDone.value = true
  playSound('tap')
}
function close() {
  confirmReset.value = false
  resetDone.value = false
  emit('close')
}
</script>

<template>
  <Dialog :open="open" :title="T.title" label="SETTINGS" tone="yellow" wide @close="close">
    <div class="rows">
      <div class="row">
        <div><p class="t-black lb">{{ T.volume }}</p></div>
        <Tabs :choices="levels" :value="current" @change="setVolume" />
      </div>
      <div class="row">
        <div>
          <p class="t-black lb">{{ T.fullscreen }}</p>
          <p class="help">{{ fullscreenSupported ? T.fullscreenHelp : T.fullscreenNo }}</p>
        </div>
        <Tabs v-if="fullscreenSupported" :choices="onOff" :value="isFullscreen ? 'on' : 'off'" @change="setFull" />
      </div>
      <div class="row">
        <div>
          <p class="t-black lb">{{ T.motion }}</p>
          <p class="help">{{ T.motionHelp }}</p>
        </div>
        <Tabs :choices="onOff" :value="settings.reduceMotion ? 'on' : 'off'" @change="setMotion" />
      </div>
      <div class="row">
        <div>
          <p class="t-black lb">{{ T.reset }}</p>
          <p class="help">{{ resetDone ? T.resetDone : T.resetHelp }}</p>
        </div>
        <Btn size="sm" :tone="confirmReset ? 'red' : 'plain'" @click="doReset">{{ confirmReset ? T.resetConfirm : T.resetBtn }}</Btn>
      </div>
    </div>
    <p class="foot">
      <span>{{ T.version }} {{ VERSION.number }}</span>
      <a class="underline underline-offset-[0.2em]" href="./privacy.html" target="_blank" rel="noopener">{{ T.privacy }}</a>
    </p>
    <template #actions>
      <Btn icon="close" size="sm" @click="close">{{ S.common.close }}</Btn>
    </template>
  </Dialog>
</template>

<style scoped>
.rows {
  border-top: 0.14rem solid var(--color-ink);
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.3rem 0;
  border-bottom: 0.07rem solid var(--color-ink);
}
.row > :last-child {
  flex-shrink: 0;
}
.lb {
  font-size: 0.9rem;
}
.help {
  font-size: 0.7rem;
  color: var(--color-ink-2);
}
.foot {
  display: flex;
  justify-content: space-between;
  padding-top: 0.8rem;
  font-size: 0.75rem;
  color: var(--color-ink-2);
}
</style>
