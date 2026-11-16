<script setup lang="ts">
// 整個遊戲的設定：音效開關、全螢幕、減少動畫、清除戰績。主畫面、模式選單、暫停選單都可以打開。
import { nextTick, ref } from 'vue'
import { fullscreenSupported, isFullscreen, setFullscreen } from '@/core/fullscreen'
import { resetStats, settings } from '@/core/settings'
import { clearAllResume } from '@/core/resume'
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

// 格式化遊戲進度：按「格式化」→ 按「確定格式化？」→ 跳出最後說明的視窗再確認 → 戰績歸零、刪掉保存中的對局 → 重新啟動
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
  clearAllResume()
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
        <Switch :on="isFullscreen" :label="T.fullscreen" :disabled="!fullscreenSupported" @change="(v) => ((settings.fullscreen = v), setFullscreen(v))" />
      </div>
      <div class="row">
        <div>
          <p class="t-black lb">{{ T.avoidCutout }}</p>
          <p class="help">{{ T.avoidCutoutHelp }}</p>
        </div>
        <Switch :on="settings.avoidCutout" :label="T.avoidCutout" @change="(v) => (settings.avoidCutout = v)" />
      </div>
      <div class="row">
        <div>
          <p class="t-black lb">{{ T.cardStarts }}</p>
          <p class="help">{{ T.cardStartsHelp }}</p>
        </div>
        <Switch :on="settings.cardStarts" :label="T.cardStarts" @change="(v) => (settings.cardStarts = v)" />
      </div>
      <div class="row">
        <div>
          <p class="t-black lb">{{ T.autoPause }}</p>
          <p class="help">{{ T.autoPauseHelp }}</p>
        </div>
        <Switch :on="settings.autoPause" :label="T.autoPause" @change="(v) => (settings.autoPause = v)" />
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
  /* 右邊、下面留一點空間，開關和按鈕的實心陰影才不會被捲動區切掉 */
  margin-right: 0.35rem;
  padding-bottom: 0.25rem;
  border-top: 0.14rem solid var(--color-ink);
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.3rem 0.1rem 0.3rem 0;
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
  margin-right: 0.35rem;
  padding-top: 0.5rem;
  font-size: 0.75rem;
  color: var(--color-ink-2);
}
@media (max-height: 430px) {
  .row {
    padding: 0.2rem 0;
  }
  .help {
    font-size: 0.62rem;
  }
}
</style>
