<script setup lang="ts">
// 對話框：一塊有黑框與實心陰影的紙，上方一條色帶放小標籤。從下方升起並稍微過頭。
// flip：結算用——像翻一張牌一樣，從背面（分類色）翻到正面（跟進出遊戲的翻卡片呼應）。
// cover：暫停用——後面整片蓋住，看不到牌和棋（不能拿暫停來多想）。
// closeX：右上角放一顆 ✕ 關閉鈕（取代底下的「關閉」按鈕，內容可以多顯示一些）。
import { S } from '@/data/strings'
import IconBtn from './IconBtn.vue'

defineProps<{ open: boolean; title?: string; label?: string; wide?: boolean; tone?: 'red' | 'blue' | 'yellow' | 'ink'; flip?: boolean; cover?: boolean; closeX?: boolean }>()
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <!-- 明確給動畫長度：Vue 只看最外層的淡入（0.2 秒）就以為結束了，會把裡面還在轉的紙片硬切到定位（看起來像卡一下） -->
  <Transition :name="flip ? 'dialog-flip' : cover ? 'dialog-cover' : 'dialog'" :duration="flip ? { enter: 780, leave: 290 } : cover ? { enter: 330, leave: 230 } : { enter: 430, leave: 230 }">
    <div v-if="open" class="fixed inset-0 z-[900] grid place-items-center" role="dialog" aria-modal="true">
      <div class="backdrop absolute inset-0" :class="{ cover }" @click="emit('close')" />
      <div class="sheet relative flex max-h-[92vh] flex-col" :class="[wide ? 'w-[36rem]' : 'w-[22rem]', flip ? `flip back-${tone ?? 'ink'}` : '']">
        <div class="band halftone" :class="`b-${tone ?? 'ink'}`"><span class="t-label">{{ label }}</span></div>
        <div class="body">
          <IconBtn v-if="closeX" class="x" icon="close" size="2.1rem" :label="S.common.close" @click="emit('close')" />
          <h2 v-if="title" class="t-black title"><span class="mask"><span>{{ title }}</span></span></h2>
          <div class="scroll-y min-h-0"><slot /></div>
          <div v-if="$slots.actions" class="actions"><slot name="actions" /></div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* 右上角的 ✕：跟標題同一高度 */
.x {
  position: absolute;
  top: 2.35rem;
  right: 1rem;
  z-index: 2;
}
.backdrop {
  background: rgb(239 233 220 / 0.82);
}
.backdrop.cover {
  background-color: var(--color-paper);
  background-image: radial-gradient(rgb(20 20 20 / 0.07) 18%, transparent 20%);
  background-size: 0.9rem 0.9rem;
}
.sheet {
  max-width: 94vw;
  border: 0.14rem solid var(--color-ink);
  background: var(--color-card);
  box-shadow: 0.4rem 0.4rem 0 var(--color-ink);
}
.band {
  height: 1.5rem;
  padding: 0 0.9rem;
  display: flex;
  align-items: center;
  border-bottom: 0.14rem solid var(--color-ink);
  --dot: rgb(251 248 241 / 0.25);
}
.b-ink {
  background-color: var(--color-ink);
  color: var(--color-card);
}
.b-red {
  background-color: var(--color-red);
  color: var(--color-card);
}
.b-blue {
  background-color: var(--color-blue);
  color: var(--color-card);
}
.b-yellow {
  background-color: var(--color-yellow);
  --dot: rgb(20 20 20 / 0.15);
}
.body {
  display: flex;
  min-height: 0;
  flex-direction: column;
  padding: 0.8rem 1.3rem 1.1rem;
}
.title {
  font-size: 1.9rem;
  line-height: 1.15;
  padding-bottom: 0.4rem;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.8rem;
  padding-top: 0.9rem;
}
.dialog-enter-active {
  transition: opacity 160ms ease;
}
/* 暫停（整片蓋住）：遮罩很快蓋上（看不到後面的牌桌在半透明裡閃），紙片再升上來 */
.dialog-cover-enter-active {
  transition: opacity 320ms linear;
}
.dialog-cover-enter-from {
  opacity: 0.99;
}
.dialog-cover-enter-active .backdrop {
  transition: opacity 90ms ease-out;
}
.dialog-cover-enter-from .backdrop {
  opacity: 0;
}
.dialog-cover-enter-active .sheet {
  transition:
    transform 320ms var(--ease-back),
    opacity 160ms ease;
}
.dialog-cover-enter-from .sheet {
  opacity: 0;
  transform: translateY(1.6rem);
}
.dialog-cover-leave-active {
  transition: opacity 220ms ease;
}
.dialog-cover-leave-active .sheet {
  transition: transform 220ms var(--ease-in-out);
}
.dialog-cover-leave-to {
  opacity: 0;
}
.dialog-cover-leave-to .sheet {
  transform: translateY(1.8rem) scale(0.96);
}
.dialog-enter-active .sheet {
  transition: transform 420ms var(--ease-back);
}
.dialog-leave-active {
  transition: opacity 220ms ease;
}
/* 關閉：和打開反過來，紙往下沉、稍微縮小再消失 */
.dialog-leave-active .sheet {
  transition: transform 220ms var(--ease-in-out);
}
.dialog-leave-to .sheet {
  transform: translateY(1.8rem) scale(0.96);
}
.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}
.dialog-enter-from .sheet {
  transform: translateY(2.4rem);
}
/* 結算：像翻牌一樣翻過來。翻到一半前，蓋著一層分類色（牌背） */
.dialog-flip-enter-active {
  transition: opacity 200ms ease;
}
.dialog-flip-enter-active .sheet {
  will-change: transform;
  /* 一條曲線一路轉到底（以前分兩段各自減速，轉到一半會先停一下再加速，看起來像卡頓）；最後稍微轉過頭再回正 */
  animation: card-flip 760ms cubic-bezier(0.45, 0.6, 0.3, 1.04) both;
}
.dialog-flip-enter-active .sheet::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 5;
  background-color: var(--bg, var(--color-ink));
  background-image: radial-gradient(rgb(251 248 241 / 0.18) 30%, transparent 32%);
  background-size: 0.5rem 0.5rem;
  animation: card-back 760ms linear both;
  pointer-events: none;
}
.dialog-flip-leave-active {
  transition: opacity 280ms ease;
}
/* 結算關閉：像牌翻回去一樣，轉到側面再消失 */
.dialog-flip-leave-active .sheet {
  animation: card-flip-out 280ms var(--ease-in-out) both;
}
@keyframes card-flip-out {
  to {
    transform: perspective(1200px) translateY(1rem) rotateY(80deg) scale(0.85);
  }
}
.dialog-flip-enter-from,
.dialog-flip-leave-to {
  opacity: 0;
}
.sheet.flip.back-red {
  --bg: var(--color-red);
}
.sheet.flip.back-blue {
  --bg: var(--color-blue);
}
.sheet.flip.back-yellow {
  --bg: var(--color-yellow);
}
@keyframes card-flip {
  from {
    transform: perspective(1200px) translateY(2rem) rotateY(-180deg) scale(0.7);
  }
  to {
    transform: perspective(1200px) translateY(0) rotateY(0deg) scale(1);
  }
}
/* 側面朝前（轉了一半）的那一刻，牌背的顏色消失、露出正面。
   上面那條曲線在整段時間的 28.8% 轉到一半，所以在這裡切換 */
@keyframes card-back {
  0%,
  28% {
    opacity: 1;
  }
  29.5%,
  100% {
    opacity: 0;
  }
}
</style>
