<script setup lang="ts">
// 「落子」：一顆大棋子當按鈕
import ArtStone from '@/ui/art/ArtStone.vue'
import DoodleButton from '@/ui/DoodleButton.vue'

defineProps<{ label: string; black?: boolean; disabled?: boolean }>()
const emit = defineEmits<{ click: [] }>()
</script>

<template>
  <DoodleButton :label="label" :disabled="disabled" size="5.4rem" @click="emit('click')">
    <svg viewBox="0 0 64 64" style="overflow: visible"><ArtStone :cx="31" :cy="31" :r="26" :black="black" :seed="9" /></svg>
  </DoodleButton>
</template>
