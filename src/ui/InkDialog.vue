<script setup lang="ts">
// 對話框：紙片從略小的狀態浮出（不是從 0 放大）
import SketchBox from './SketchBox.vue'

defineProps<{ open: boolean; title?: string; wide?: boolean }>()
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <Transition name="dialog">
    <div v-if="open" class="fixed inset-0 z-40 grid place-items-center" role="dialog" aria-modal="true" @click.self="emit('close')">
      <div class="backdrop absolute inset-0" @click="emit('close')" />
      <div class="sheet relative flex max-h-[94vh] flex-col px-[1.6rem] py-[0.9rem]" :class="wide ? 'w-[34rem]' : 'w-[22rem]'">
        <span class="hatch" />
        <SketchBox fill="var(--color-paper)" :variant="1" />
        <span class="tape tape-l" /><span class="tape tape-r" />
        <h2 v-if="title" class="font-display relative pb-[0.35rem] text-center text-[1.6rem] leading-tight">{{ title }}</h2>
        <div class="scroll-y relative min-h-0"><slot /></div>
        <div v-if="$slots.actions" class="relative flex flex-wrap justify-center gap-[0.8rem] pt-[0.7rem]"><slot name="actions" /></div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.backdrop {
  background: oklch(23% 0.012 60 / 0.42);
}
.sheet {
  max-width: 94vw;
}
.hatch {
  position: absolute;
  inset: 0.55rem -0.55rem -0.55rem 0.55rem;
  background-image: repeating-linear-gradient(-52deg, var(--color-ink) 0 0.07rem, transparent 0.07rem 0.32rem);
  opacity: 0.5;
}
/* 把紙貼在桌上的兩段紙膠帶 */
.tape {
  position: absolute;
  top: -0.55rem;
  width: 3.4rem;
  height: 1.1rem;
  background: var(--color-sun);
  opacity: 0.85;
  border-left: 0.1rem dashed var(--color-ink-faint);
  border-right: 0.1rem dashed var(--color-ink-faint);
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
  transition: opacity 180ms ease;
}
.dialog-enter-active .sheet {
  transition: transform 240ms var(--ease-out);
}
.dialog-leave-active {
  transition: opacity 120ms ease;
}
.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}
.dialog-enter-from .sheet {
  transform: scale(0.95) translateY(0.5rem) rotate(-0.6deg);
}
</style>
