<script setup lang="ts">
// 象棋對局：用共用的對局畫面，接上象棋的引擎
import { ref } from 'vue'
import type { GameDef } from '@/games/types'
import { xiangqiAdapter } from '../classic/adapters'
import ClassicGame from '../classic/ClassicGame.vue'

defineProps<{ game: GameDef; options: Record<string, string | boolean>; resume?: unknown }>()
const emit = defineEmits<{ exit: []; save: [data: unknown] }>()
// 把「暫停」「目前進度」轉給裡面的對局畫面（外框切分頁時會用到）
const inner = ref<{ pause: () => void; snapshot: () => unknown } | null>(null)
defineExpose({ pause: () => inner.value?.pause(), snapshot: () => inner.value?.snapshot() ?? null })
</script>

<template>
  <ClassicGame ref="inner" :game="game" :options="options" :resume="resume" :adapter="xiangqiAdapter" @exit="emit('exit')" @save="(d) => emit('save', d)" />
</template>
