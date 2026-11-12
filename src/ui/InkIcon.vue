<script setup lang="ts">
// 自己畫的小圖示，筆畫粗細與外框一致
defineProps<{ name: 'back' | 'gear' | 'menu' | 'chevron' | 'check' | 'sound' | 'mute' }>()
</script>

<template>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path v-if="name === 'back'" d="M14.5 5 7.6 11.8l7.2 7.3M8 12h12.2" />
    <path v-else-if="name === 'chevron'" d="m9 5 7.2 6.8L9.2 19" />
    <path v-else-if="name === 'menu'" d="M4 6.6h16.2M3.8 12.2h16M4.2 17.6h15.6" />
    <path v-else-if="name === 'check'" d="m4.5 12.6 5 5L19.8 6.4" />
    <template v-else-if="name === 'gear'">
      <circle cx="12" cy="12" r="3.4" />
      <path d="M12 2.6v3M12 18.4v3M2.6 12h3M18.4 12h3M5.3 5.3l2.2 2.2M16.5 16.5l2.2 2.2M5.3 18.7l2.2-2.2M16.5 7.5l2.2-2.2" />
    </template>
    <template v-else>
      <path d="M4 9.6v5h3.4l4.8 4V5.4l-4.8 4.2z" />
      <path v-if="name === 'sound'" d="M15.8 9.2c1.4 1.6 1.4 4 0 5.6M18.6 6.6c2.8 3 2.8 7.8 0 10.8" />
      <path v-else d="m16 9.6 4.8 4.8M20.8 9.6 16 14.4" />
    </template>
  </svg>
</template>
