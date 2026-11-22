<script setup lang="ts">
// 對話框：一塊有黑框與實心陰影的紙，上方一條色帶放小標籤。從下方升起並稍微過頭。
// flip：結算用——從下面彈上來、輕輕晃一下停住（使用者要的，所有玩法一樣）；關掉時往下沉。
// cover：暫停用——後面整片蓋住，看不到牌和棋（不能拿暫停來多想）。
// closeX：右上角放一顆 ✕ 關閉鈕（取代底下的「關閉」按鈕，內容可以多顯示一些）。
import { S } from '@/data/strings'
import IconBtn from './IconBtn.vue'

defineProps<{ open: boolean; title?: string; label?: string; wide?: boolean; tone?: 'red' | 'blue' | 'yellow' | 'ink'; flip?: boolean; cover?: boolean; closeX?: boolean }>()
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <!-- 明確給動畫長度：Vue 只看最外層的淡入（0.2 秒）就以為結束了，會把裡面還在轉的紙片硬切到定位（看起來像卡一下） -->
  <Transition :name="flip ? 'dialog-flip' : cover ? 'dialog-cover' : 'dialog'" :duration="flip ? { enter: 660, leave: 270 } : cover ? { enter: 330, leave: 230 } : { enter: 430, leave: 230 }">
    <div v-if="open" class="fixed inset-0 z-[900] grid place-items-center" role="dialog" aria-modal="true">
      <!-- 暫停選單（cover）：點旁邊空白不會關，只能按「繼續」（或 Esc、返回鍵） -->
      <div class="backdrop absolute inset-0" :class="{ cover }" @click="!cover && emit('close')" />
      <div class="sheet relative flex max-h-[92vh] flex-col" :class="[flip ? (wide ? 'w-[46rem]' : 'w-[33rem]') : wide ? 'w-[36rem]' : 'w-[22rem]', flip ? `flip back-${tone ?? 'ink'}` : '']">
        <div class="band halftone" :class="`b-${tone ?? 'ink'}`"><span class="t-label">{{ label }}</span></div>
        <!-- 結算（flip）：按鈕排在右邊一欄，橫的畫面高度省下來，內容不用上下滑 -->
        <div class="body" :class="{ side: flip && $slots.actions }">
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
/* 結算：左邊標題＋內容、右邊一欄按鈕（由下往上排） */
.body.side {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-rows: auto minmax(0, 1fr);
  column-gap: 1.2rem;
  padding-top: 0.6rem;
}
.body.side > .title {
  grid-column: 1;
  font-size: 1.7rem;
}
.body.side > .scroll-y {
  grid-column: 1;
}
.body.side > .actions {
  grid-column: 2;
  grid-row: 1 / span 2;
  flex-direction: column;
  flex-wrap: nowrap;
  justify-content: flex-end;
  align-items: stretch;
  gap: 0.55rem;
  width: 9.5rem;
  padding: 0 0.25rem 0.2rem 1.2rem;
  border-left: 0.07rem dashed var(--color-ink-3);
}
.body.side > .actions :deep(.btn) {
  display: block;
  width: 100%;
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
  transition: opacity 180ms ease;
}
/* 結算進場（使用者要的，所有玩法一樣）：從下面彈上來、稍微衝過頭、輕輕晃一下停住 */
.dialog-flip-enter-active .sheet {
  will-change: transform;
  animation: result-pop 640ms both;
}
@keyframes result-pop {
  0% {
    transform: translateY(70vh) rotate(4deg) scale(0.92);
    animation-timing-function: cubic-bezier(0.2, 0.75, 0.3, 1);
  }
  55% {
    transform: translateY(-1.1rem) rotate(-1.6deg) scale(1.02);
    animation-timing-function: ease-in-out;
  }
  75% {
    transform: translateY(0.35rem) rotate(0.9deg) scale(1);
    animation-timing-function: ease-in-out;
  }
  90% {
    transform: translateY(-0.1rem) rotate(-0.3deg);
  }
  100% {
    transform: none;
  }
}
.dialog-flip-leave-active {
  transition: opacity 260ms ease;
}
/* 結算關閉：反過來往下沉掉 */
.dialog-flip-leave-active .sheet {
  animation: result-drop 260ms var(--ease-in-out) both;
}
@keyframes result-drop {
  to {
    transform: translateY(50vh) rotate(3deg) scale(0.94);
  }
}
.dialog-flip-enter-from,
.dialog-flip-leave-to {
  opacity: 0;
}
</style>
