<script setup lang="ts">
// 西洋棋對局：用共用的對局畫面，接上西洋棋的引擎
import type { GameDef } from '@/games/types'
import { chessAdapter } from '../classic/adapters'
import ClassicGame from '../classic/ClassicGame.vue'

defineProps<{ game: GameDef; options: Record<string, string | boolean>; resume?: unknown }>()
const emit = defineEmits<{ exit: []; save: [data: unknown] }>()
</script>

<template>
  <ClassicGame :game="game" :options="options" :resume="resume" :adapter="chessAdapter" @exit="emit('exit')" @save="(d) => emit('save', d)" />
</template>
