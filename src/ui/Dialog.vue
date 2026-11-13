<script setup lang="ts">
// 對話框：一塊有黑框與實心陰影的紙，上方一條色帶放小標籤。從下方升起並稍微過頭。
defineProps<{ open: boolean; title?: string; label?: string; wide?: boolean; tone?: 'red' | 'blue' | 'yellow' | 'ink' }>()
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <Transition name="dialog">
    <div v-if="open" class="fixed inset-0 z-[900] grid place-items-center" role="dialog" aria-modal="true">
      <div class="backdrop absolute inset-0" @click="emit('close')" />
      <div class="sheet relative flex max-h-[92vh] flex-col" :class="wide ? 'w-[36rem]' : 'w-[22rem]'">
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
</style>
