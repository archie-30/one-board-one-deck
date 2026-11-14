<script setup lang="ts">
// 象棋互動教學（棋子樣式跟著規則設定）
import { gamePrefs } from '@/core/settings'
import { xiangqiAdapter } from '../classic/adapters'
import ClassicTutorial from '../classic/ClassicTutorial.vue'
import { XIANGQI_LESSONS } from '../classic/tutorialData'

const emit = defineEmits<{ exit: []; play: [] }>()
const style = gamePrefs('xiangqi').options.pieceStyle === 'icon' ? 'icon' : 'text'
</script>

<template>
  <ClassicTutorial :adapter="xiangqiAdapter" :lessons="XIANGQI_LESSONS" :piece-style="style" @exit="emit('exit')" @play="emit('play')" />
</template>
