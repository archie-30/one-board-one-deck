<script setup lang="ts">
// 瘋狂大老二的新手教學：沿用大老二的教學畫面，換成兩副牌的關卡
import BigTwoTutorial from './BigTwoTutorial.vue'
const emit = defineEmits<{ exit: []; play: []; rules: [] }>()
</script>

<template>
  <BigTwoTutorial crazy @exit="emit('exit')" @play="emit('play')" @rules="emit('rules')" />
</template>
