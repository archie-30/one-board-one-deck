<script setup lang="ts">
// 整個遊戲的設定：音效開關、全螢幕、減少動畫、清除戰績。主畫面、模式選單、暫停選單都可以打開。
import { nextTick, ref } from 'vue'
import { fullscreenSupported, isFullscreen, setFullscreen } from '@/core/fullscreen'
import { resetStats, settings } from '@/core/settings'
import { S } from '@/data/strings'
import { VERSION } from '@/data/version'
import Btn from '@/ui/Btn.vue'
import Dialog from '@/ui/Dialog.vue'
import Switch from '@/ui/Switch.vue'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const T = S.appSettings

function setSound(on: boolean) {
  settings.volume = on ? 0.8 : 0
}

// 清除戰績：按「清除」→ 按「確定清除？」→ 跳出最後說明的視窗再確認 → 清除並重新啟動
const confirmReset = ref(false)
const finalOpen = ref(false)
function doReset() {
  if (!confirmReset.value) {
    confirmReset.value = true
    return
  }
  confirmReset.value = false
  finalOpen.value = true
}
async function resetAndRestart() {
  resetStats()
  await nextTick()
  window.setTimeout(() => window.location.reload(), 150)
}
function close() {
  confirmReset.value = false
  emit('close')
}
</script>

<template>
  <Dialog :open="open" :title="T.title" label="SETTINGS" tone="yellow" wide @close="close">
    <div class="rows">
      <div class="row">
        <div><p class="t-black lb">{{ T.sound }}</p></div>
        <Switch :on="settings.volume > 0" :label="T.sound" @change="setSound" />
      </div>
      <div class="row">
        <div>
          <p class="t-black lb">{{ T.fullscreen }}</p>
          <p class="help">{{ fullscreenSupported ? T.fullscreenHelp : T.fullscreenNo }}</p>
        </div>
        <Switch :on="isFullscreen" :label="T.fullscreen" :disabled="!fullscreenSupported" @change="(v) => setFullscreen(v)" />
      </div>
      <div class="row">
        <div>
          <p class="t-black lb">{{ T.motion }}</p>
          <p class="help">{{ T.motionHelp }}</p>
        </div>
        <Switch :on="settings.reduceMotion" :label="T.motion" @change="(v) => (settings.reduceMotion = v)" />
      </div>
      <div class="row">
        <div>
          <p class="t-black lb">{{ T.reset }}</p>
          <p class="help">{{ T.resetHelp }}</p>
        </div>
        <Btn size="sm" :tone="confirmReset ? 'yellow' : 'plain'" @click="doReset">{{ confirmReset ? T.resetConfirm : T.resetBtn }}</Btn>
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

  <!-- 清除戰績的最後確認 -->
  <Dialog :open="finalOpen" :title="T.resetFinalTitle" label="SETTINGS" tone="red" @close="finalOpen = false">
    <p class="text-[0.95rem]">{{ T.resetFinalLead }}</p>
    <template #actions>
      <Btn size="sm" icon="close" @click="finalOpen = false">{{ S.common.cancel }}</Btn>
      <Btn tone="red" icon="again" @click="resetAndRestart">{{ T.resetFinalGo }}</Btn>
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
