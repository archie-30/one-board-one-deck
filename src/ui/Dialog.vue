<script setup lang="ts">
// 對話框：一塊有黑框與實心陰影的紙，上方一條色帶放小標籤。從下方升起並稍微過頭。
// flip：結算用——像翻一張牌一樣，從背面（分類色）翻到正面（跟進出遊戲的翻卡片呼應）。
// cover：暫停用——後面整片蓋住，看不到牌和棋（不能拿暫停來多想）。
defineProps<{ open: boolean; title?: string; label?: string; wide?: boolean; tone?: 'red' | 'blue' | 'yellow' | 'ink'; flip?: boolean; cover?: boolean }>()
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <Transition :name="flip ? 'dialog-flip' : 'dialog'">
    <div v-if="open" class="fixed inset-0 z-[900] grid place-items-center" role="dialog" aria-modal="true">
      <div class="backdrop absolute inset-0" :class="{ cover }" @click="emit('close')" />
      <div class="sheet relative flex max-h-[92vh] flex-col" :class="[wide ? 'w-[36rem]' : 'w-[22rem]', flip ? `flip b-${tone ?? 'ink'}` : '']">
        <div class="band halftone" :class="`b-${tone ?? 'ink'}`"><span class="t-label">{{ label }}</span></div>
        <div class="body">
          <h2 v-if="title" class="t-black title"><span class="mask"><span>{{ title }}</span></span></h2>
          <div class="scroll-y min-h-0"><slot /></div>
          <div v-if="$slots.actions" class="actions"><slot name="actions" /></div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
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
.dialog-enter-active .sheet {
  transition: transform 420ms var(--ease-back);
}
.dialog-leave-active {
  transition: opacity 120ms ease;
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
  animation: card-flip 720ms var(--ease-out) both;
}
.dialog-flip-enter-active .sheet::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 5;
  background-color: var(--bg, var(--color-ink));
  background-image: radial-gradient(rgb(251 248 241 / 0.18) 30%, transparent 32%);
  background-size: 0.5rem 0.5rem;
  animation: card-back 720ms linear both;
  pointer-events: none;
}
.dialog-flip-leave-active {
  transition: opacity 140ms ease;
}
.dialog-flip-enter-from,
.dialog-flip-leave-to {
  opacity: 0;
}
.sheet.flip.b-red {
  --bg: var(--color-red);
}
.sheet.flip.b-blue {
  --bg: var(--color-blue);
}
.sheet.flip.b-yellow {
  --bg: var(--color-yellow);
}
@keyframes card-flip {
  0% {
    transform: perspective(1200px) translateY(2rem) rotateY(-180deg) scale(0.7);
  }
  55% {
    transform: perspective(1200px) translateY(-0.3rem) rotateY(-80deg) scale(1.02);
  }
  100% {
    transform: perspective(1200px) translateY(0) rotateY(0deg) scale(1);
  }
}
/* 翻過一半（側面朝前）時，牌背的顏色消失、露出正面 */
@keyframes card-back {
  0%,
  44% {
    opacity: 1;
  }
  46%,
  100% {
    opacity: 0;
  }
}
</style>
