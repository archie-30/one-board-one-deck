<script setup lang="ts">
// 象棋對局：用共用的對局畫面，接上象棋的引擎
import type { GameDef } from '@/games/types'
import { xiangqiAdapter } from '../classic/adapters'
import ClassicGame from '../classic/ClassicGame.vue'

defineProps<{ game: GameDef; options: Record<string, string | boolean>; resume?: unknown }>()
const emit = defineEmits<{ exit: []; save: [data: unknown] }>()
</script>

<template>
  <ClassicGame :game="game" :options="options" :resume="resume" :adapter="xiangqiAdapter" @exit="emit('exit')" @save="(d) => emit('save', d)" />
</template>
