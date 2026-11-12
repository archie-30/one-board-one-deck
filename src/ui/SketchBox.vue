<script setup lang="ts">
// 舊名稱保留給各處使用，實際畫法交給 InkFrame
import InkFrame from './art/InkFrame.vue'

withDefaults(defineProps<{ fill?: string; variant?: number; weight?: number; dashed?: boolean; shadow?: boolean; shade?: string; tone?: string; boil?: boolean }>(), {
  variant: 0,
  weight: 2.2,
})
</script>

<template>
  <InkFrame :fill="fill" :seed="variant * 37 + 3" :weight="weight" :dashed="dashed" :shadow="shadow" :shade="shade" :tone="tone" :boil="boil" />
</template>
