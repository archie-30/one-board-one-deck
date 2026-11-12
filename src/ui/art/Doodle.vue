<script setup lang="ts">
// 大的手繪圖示
import { ICONS, type IconName } from './icons'
import Sketch from './Sketch.vue'

defineProps<{ name: IconName; still?: boolean }>()
</script>

<template>
  <svg viewBox="0 0 64 64" class="doodle" aria-hidden="true"><Sketch :prims="ICONS[name]" :seed="name.length * 13" :still="still" /></svg>
</template>

<style scoped>
.doodle {
  display: block;
  overflow: visible;
}
</style>
