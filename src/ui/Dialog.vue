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
        <div class="body">
          <p v-if="label" class="t-label lab"><span class="dot" :class="`b-${tone ?? 'ink'}`" />{{ label }}</p>
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
  background: rgb(23 23 26 / 0.28);
  backdrop-filter: blur(3px);
}
.sheet {
  max-width: 94vw;
  border-radius: 1.3rem;
  background: var(--color-card);
  box-shadow: 0 20px 60px rgb(23 23 26 / 0.22);
}
.body {
  display: flex;
  min-height: 0;
  flex-direction: column;
  padding: 1.1rem 1.4rem 1.2rem;
}
.lab {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}
.dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
}
.b-ink {
  background: var(--color-ink);
}
.b-red {
  background: var(--color-red);
}
.b-blue {
  background: var(--color-blue);
}
.b-yellow {
  background: var(--color-yellow);
}
.title {
  font-size: 1.8rem;
  line-height: 1.2;
  padding: 0.15rem 0 0.4rem;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.7rem;
  padding-top: 1rem;
}
.dialog-enter-active {
  transition: opacity 180ms ease;
}
.dialog-enter-active .sheet {
  transition: transform 380ms var(--ease-out);
}
.dialog-leave-active {
  transition: opacity 120ms ease;
}
.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}
.dialog-enter-from .sheet {
  transform: translateY(1.2rem) scale(0.97);
}
</style>
