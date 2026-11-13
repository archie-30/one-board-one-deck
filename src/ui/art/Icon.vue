<script setup lang="ts">
// 線條小圖示（24×24，跟著文字顏色）
import type { IconName } from './icons'
defineProps<{ name: IconName }>()
</script>

<template>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">
    <path v-if="name === 'back'" d="M10 5 3 12l7 7M3.5 12H21" />
    <path v-else-if="name === 'arrow'" d="M14 5l7 7-7 7M20.5 12H3" />
    <path v-else-if="name === 'menu'" d="M3 6h18M3 12h18M3 18h12" />
    <path v-else-if="name === 'close'" d="M5 5l14 14M19 5 5 19" />
    <path v-else-if="name === 'check'" d="M4 12.5 9.5 18 20 6" />
    <path v-else-if="name === 'play'" d="M7 4.5v15l12-7.5z" fill="currentColor" />
    <path v-else-if="name === 'again'" d="M19.5 9A8 8 0 1 0 20 14M20 3.5V9h-5.5" />
    <path v-else-if="name === 'exit'" d="M10 4H4v16h6M9 12h12M16 7l5 5-5 5" />
    <path v-else-if="name === 'pass'" d="M4 12h10M10 7l5 5-5 5M19 5v14" />
    <path v-else-if="name === 'book'" d="M12 6C10 4.5 6.5 4 3 4.5v14c3.5-.5 7 0 9 1.5 2-1.5 5.5-2 9-1.5v-14C17.5 4 14 4.5 12 6zM12 6v14" />
    <path v-else-if="name === 'pencil'" d="M4 20l1-5L16 4l4 4L9 19zM13.5 6.5l4 4" />
    <path v-else-if="name === 'bulb'" d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c1 1 1.5 2 1.5 3.5h5c0-1.5.5-2.5 1.5-3.5A6 6 0 0 0 12 3z" />
    <path v-else-if="name === 'sound'" d="M4 9h4l5-4v14l-5-4H4zM16.5 9a4 4 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11" />
    <g v-else-if="name === 'gear'"><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></g>
    <path v-else-if="name === 'rock'" d="M4 15c-1-4 1.5-8.5 6-9.5 4-1 9 1 10 5.5 1 4-2 8-7 8.5S5 18.5 4 15z" fill="currentColor" />
    <g v-else-if="name === 'paper'"><path d="M5 3h10l4 4v14H5z" /><path d="M8 11h8M8 15h8" /></g>
    <g v-else-if="name === 'scissors'"><circle cx="7" cy="18" r="3" /><circle cx="17" cy="18" r="3" /><path d="M8.5 15.5 17 3M15.5 15.5 7 3" /></g>
  </svg>
</template>
