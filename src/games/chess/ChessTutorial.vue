<script setup lang="ts">
// 西洋棋互動教學
import { chessAdapter } from '../classic/adapters'
import ClassicTutorial from '../classic/ClassicTutorial.vue'
import { CHESS_LESSONS } from '../classic/tutorialData'

const emit = defineEmits<{ exit: []; play: [] }>()
</script>

<template>
  <ClassicTutorial :adapter="chessAdapter" :lessons="CHESS_LESSONS" @exit="emit('exit')" @play="emit('play')" />
</template>
