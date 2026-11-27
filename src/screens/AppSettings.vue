<script setup lang="ts">
// 整個遊戲的設定：音效開關、全螢幕、恆亮、鏡頭防遮擋…、格式化。主畫面、暫停選單都可以打開。
// 整個畫面的一頁（跟規則說明等頁一樣：左上大標題、粗黑線、左下返回），蓋在原本的畫面上面，關掉就回到原本的地方（對局中打開也不會離開對局）。
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { fullscreenSupported, isFullscreen, setFullscreen } from '@/core/fullscreen'
import { resetStats, settings } from '@/core/settings'
import { clearAllResume } from '@/core/resume'
import { buzz, canVibrate } from '@/core/haptics'
import { isApp } from '@/core/native'
import { S } from '@/data/strings'
import { VERSION } from '@/data/version'
import Btn from '@/ui/Btn.vue'
import Dialog from '@/ui/Dialog.vue'
import Switch from '@/ui/Switch.vue'
import Tabs from '@/ui/Tabs.vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const T = S.appSettings

/** 震動：關／低／中（haptics 開關跟著存，舊版本讀得懂） */
function setHaptics(v: string) {
  settings.hapticsLevel = v as 'off' | 'low' | 'mid'
  settings.haptics = v !== 'off'
  // 換好後照新的強度再震一下，馬上感覺得到差多少
  window.setTimeout(() => buzz('turn'), 80)
}
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
// 網頁版按 Esc：關掉設定（格式化的最後確認開著時先關那個）
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' || !props.open) return
  e.stopImmediatePropagation()
  if (finalOpen.value) finalOpen.value = false
  else close()
}
onMounted(() => window.addEventListener('keydown', onKey, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <Transition name="sp">
    <!-- role=dialog＋backdrop：Android 返回鍵（core/native.ts）找最上面的視窗，按它的 data-back 按鈕 -->
    <section v-if="open" class="sp" role="dialog" aria-modal="true">
      <div class="backdrop" />
      <header class="head">
        <h1 class="t-black title"><span class="mask"><span>{{ T.title }}</span></span></h1>
        <p class="t-label rise" style="--i: 2">SETTINGS</p>
      </header>
      <div class="rule wipe" style="--i: 2" />
      <div class="body scroll-y">
        <div class="rows">
          <div class="row rise" style="--i: 2">
            <div><p class="t-black lb">{{ T.sound }}</p></div>
            <Switch :on="settings.volume > 0" :label="T.sound" @change="setSound" />
          </div>
          <div class="row rise" style="--i: 2">
            <div>
              <p class="t-black lb">{{ T.music }}</p>
              <p class="help">{{ T.musicHelp }}</p>
            </div>
            <Switch :on="settings.music" :label="T.music" @change="(v) => (settings.music = v)" />
          </div>
          <!-- App 本來就是全螢幕，不放這個開關 -->
          <div v-if="!isApp" class="row rise" style="--i: 3">
            <div>
              <p class="t-black lb">{{ T.fullscreen }}</p>
              <p class="help">{{ fullscreenSupported ? T.fullscreenHelp : T.fullscreenNo }}</p>
            </div>
            <Switch :on="isFullscreen" :label="T.fullscreen" :disabled="!fullscreenSupported" @change="(v) => ((settings.fullscreen = v), setFullscreen(v))" />
          </div>
          <!-- 震不了的裝置（例如 iPhone 的瀏覽器）不放這個開關 -->
          <div v-if="canVibrate" class="row rise" style="--i: 4">
            <div>
              <p class="t-black lb">{{ T.haptics }}</p>
              <p class="help">{{ T.hapticsHelp }}</p>
            </div>
            <Tabs :choices="T.hapticsLevels" :value="settings.hapticsLevel" :aria-label="T.haptics" @change="setHaptics" />
          </div>
          <div class="row rise" style="--i: 4">
            <div>
              <p class="t-black lb">{{ T.keepAwake }}</p>
              <p class="help">{{ T.keepAwakeHelp }}</p>
            </div>
            <Switch :on="settings.keepAwake" :label="T.keepAwake" @change="(v) => (settings.keepAwake = v)" />
          </div>
          <div class="row rise" style="--i: 5">
            <div>
              <p class="t-black lb">{{ T.avoidCutout }}</p>
              <p class="help">{{ T.avoidCutoutHelp }}</p>
            </div>
            <Switch :on="settings.avoidCutout" :label="T.avoidCutout" @change="(v) => (settings.avoidCutout = v)" />
          </div>
          <div class="row rise" style="--i: 6">
            <div>
              <p class="t-black lb">{{ T.cardStarts }}</p>
              <p class="help">{{ T.cardStartsHelp }}</p>
            </div>
            <Switch :on="settings.cardStarts" :label="T.cardStarts" @change="(v) => (settings.cardStarts = v)" />
          </div>
          <div class="row rise" style="--i: 7">
            <div>
              <p class="t-black lb">{{ T.autoPause }}</p>
              <p class="help">{{ T.autoPauseHelp }}</p>
            </div>
            <Switch :on="settings.autoPause" :label="T.autoPause" @change="(v) => (settings.autoPause = v)" />
          </div>
          <div class="row rise" style="--i: 8">
            <div>
              <p class="t-black lb">{{ T.reset }}</p>
              <p class="help">{{ T.resetHelp }}</p>
            </div>
            <Btn size="sm" :tone="confirmReset ? 'yellow' : 'plain'" @click="doReset">{{ confirmReset ? T.resetConfirm : T.resetBtn }}</Btn>
          </div>
        </div>
      </div>
      <!-- 最下面一排：左邊返回，右邊版本號、隱私權政策（固定在畫面底下，不跟著捲） -->
      <footer class="foot rise" style="--i: 4">
        <Btn icon="back" size="sm" data-back @click="close">{{ S.common.back }}</Btn>
        <p class="meta">
          <span>{{ T.version }} {{ VERSION.number }}</span>
          <a class="underline underline-offset-[0.2em]" href="./privacy.html" target="_blank" rel="noopener">{{ T.privacy }}</a>
        </p>
      </footer>

      <!-- 格式化的最後確認 -->
      <Dialog :open="finalOpen" :title="T.resetFinalTitle" label="SETTINGS" tone="red" @close="finalOpen = false">
        <p class="text-[0.95rem]">{{ T.resetFinalLead }}</p>
        <template #actions>
          <Btn size="sm" icon="close" @click="finalOpen = false">{{ S.common.cancel }}</Btn>
          <Btn tone="red" icon="again" @click="resetAndRestart">{{ T.resetFinalGo }}</Btn>
        </template>
      </Dialog>
    </section>
  </Transition>
</template>

<style scoped>
/* 整個畫面：蓋在所有東西上面（暫停選單也是），內縮跟 #app 一樣避開鏡頭 */
.sp {
  position: fixed;
  inset: 0;
  z-index: 950;
  display: flex;
  flex-direction: column;
  padding: calc(0.9rem + var(--cut-t)) calc(1.6rem + var(--cut-r)) calc(0.8rem + var(--cut-b)) calc(1.6rem + var(--cut-l));
}
.backdrop {
  position: absolute;
  inset: 0;
  z-index: -1;
  background: var(--color-paper);
}
.head {
  display: flex;
  align-items: baseline;
  gap: 1.2rem;
}
.title {
  font-size: 2.3rem;
  line-height: 1.1;
}
.rule {
  height: 0.22rem;
  margin: 0.35rem 0 0.5rem;
  background: var(--color-ink);
}
.body {
  min-height: 0;
  flex: 1;
}
.rows {
  /* 右邊、下面留一點空間，開關和按鈕的實心陰影才不會被捲動區切掉 */
  max-width: 46rem;
  margin-right: 0.35rem;
  padding-bottom: 0.25rem;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  padding: 0.45rem 0.1rem 0.45rem 0;
  border-bottom: 0.07rem solid var(--color-ink);
}
.row > :last-child {
  flex-shrink: 0;
}
.lb {
  font-size: 0.95rem;
}
.help {
  font-size: 0.72rem;
  color: var(--color-ink-2);
}
.foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding-top: 0.5rem;
}
.meta {
  display: flex;
  gap: 1.2rem;
  font-size: 0.75rem;
  color: var(--color-ink-2);
}
/* 打開：整頁淡入、稍微往上浮；關掉：往下沉、淡出（跟換頁一樣） */
.sp-enter-active {
  transition:
    opacity 220ms var(--ease-out),
    transform 320ms var(--ease-out);
}
.sp-leave-active {
  transition:
    opacity 200ms cubic-bezier(0.4, 0, 1, 1),
    transform 200ms cubic-bezier(0.4, 0, 1, 1);
}
.sp-enter-from {
  opacity: 0;
  transform: translateY(1rem);
}
.sp-leave-to {
  opacity: 0;
  transform: translateY(0.8rem);
}
@media (max-height: 430px) {
  .row {
    padding: 0.3rem 0;
  }
  .help {
    font-size: 0.64rem;
  }
}
@media (prefers-reduced-motion: reduce) {
  .sp-enter-active,
  .sp-leave-active {
    transition: none;
  }
}
</style>
