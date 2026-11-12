<script setup lang="ts">
// 把一串繪圖資料畫成 SVG。預設畫兩次（兩個 seed）輪流顯示，線條會像手繪動畫一樣微微呼吸。
import { computed } from 'vue'
import { draw, type Prim } from './ink'

const props = defineProps<{ prims: Prim[]; seed?: number; still?: boolean }>()
const a = computed(() => draw(props.prims, props.seed ?? 0))
const b = computed(() => (props.still ? null : draw(props.prims, (props.seed ?? 0) + 4099)))
</script>

<template>
  <g>
    <template v-for="(s, i) in a" :key="i">
      <path :d="s.d" :fill="s.fill" :opacity="s.opacity" :class="b && s.line ? 'boil-a' : undefined" />
      <path v-if="b && s.line" :d="b[i].d" :fill="s.fill" :opacity="s.opacity" class="boil-b" />
    </template>
  </g>
</template>
