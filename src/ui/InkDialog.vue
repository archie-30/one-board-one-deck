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
        <SketchBox fill="var(--color-card)" :variant="1" :weight="2.6" shadow shade="var(--color-far)" />
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
  background: rgb(26 26 26 / 0.45);
}
.sheet {
  max-width: 94vw;
}
/* 把紙貼在桌上的兩段紙膠帶 */
.tape {
  position: absolute;
  top: -0.55rem;
  width: 3.4rem;
  height: 1.1rem;
  background: repeating-linear-gradient(-52deg, var(--color-far) 0 0.28rem, var(--color-paper-deep) 0.28rem 0.5rem);
  opacity: 0.92;
  box-shadow: 0 0 0 0.06rem var(--color-mid);
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
  transition: transform 260ms var(--ease-back);
}
.dialog-leave-active {
  transition: opacity 120ms ease;
}
.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}
.dialog-enter-from .sheet {
  transform: scale(0.9);
}
</style>
