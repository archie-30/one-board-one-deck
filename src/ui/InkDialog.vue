<script setup lang="ts">
// 對話框：一張用紙膠帶貼在桌上的紙，從略小彈出來
import InkFrame from './art/InkFrame.vue'

defineProps<{ open: boolean; title?: string; wide?: boolean }>()
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <Transition name="dialog">
    <div v-if="open" class="fixed inset-0 z-40 grid place-items-center" role="dialog" aria-modal="true">
      <div class="backdrop absolute inset-0" @click="emit('close')" />
      <div class="sheet relative flex max-h-[92vh] flex-col px-[1.6rem] pt-[1rem] pb-[1.1rem]" :class="wide ? 'w-[36rem]' : 'w-[23rem]'">
        <InkFrame block fill="var(--color-card)" :weight="2.6" :seed="21" />
        <span class="tape tape-l" /><span class="tape tape-r" />
        <h2 v-if="title" class="font-display relative pb-[0.4rem] text-center text-[1.6rem] leading-tight font-black">{{ title }}</h2>
        <div class="scroll-y relative min-h-0"><slot /></div>
        <div v-if="$slots.actions" class="relative flex flex-wrap justify-center gap-[0.8rem] pt-[0.8rem]"><slot name="actions" /></div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.backdrop {
  background: rgb(242 240 235 / 0.72);
}
.sheet {
  max-width: 94vw;
}
.tape {
  position: absolute;
  top: -0.55rem;
  width: 3.4rem;
  height: 1.1rem;
  background: repeating-linear-gradient(-52deg, var(--color-far) 0 0.28rem, var(--color-paper-deep) 0.28rem 0.5rem);
  box-shadow: 0 0 0 0.06rem var(--color-mid);
  opacity: 0.92;
}
.tape-l {
  left: 1.4rem;
  transform: rotate(-7deg);
}
.tape-r {
  right: 1.4rem;
  transform: rotate(5deg);
}
.dialog-enter-active {
  transition: opacity 160ms ease;
}
.dialog-enter-active .sheet {
  transition: transform 300ms var(--ease-back);
}
.dialog-leave-active {
  transition: opacity 110ms ease;
}
.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}
.dialog-enter-from .sheet {
  transform: scale(0.9) translateY(1rem) rotate(-1deg);
}
</style>
