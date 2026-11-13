<script setup lang="ts">
import { OPPONENTS, PLAYER_LOOK } from '@/data/names'
import Avatar from '@/ui/art/Avatar.vue'
import Card from '@/ui/art/Card.vue'
const moods = ['idle', 'think', 'happy', 'sad', 'smug', 'shock'] as const
</script>
<template>
  <div style="padding: 10px; display: flex; flex-wrap: wrap; gap: 8px; height: 100%; overflow: auto">
    <div v-for="m in moods" :key="m" style="width: 56px; text-align: center; font-size: 10px"><Avatar :look="PLAYER_LOOK" :mood="m" style="width: 52px; height: 52px" />{{ m }}</div>
    <div v-for="(o, i) in OPPONENTS" :key="i" style="width: 56px; text-align: center; font-size: 10px"><Avatar :look="o.look" style="width: 52px; height: 52px" />{{ o.name }}</div>
    <svg viewBox="-5 -5 330 115" style="width: 480px; height: 165px">
      <Card rank="10" :suit="2" />
      <Card rank="K" :suit="3" transform="translate(80 0)" />
      <Card rank="2" :suit="1" transform="translate(160 0)" />
      <Card back transform="translate(240 0)" />
    </svg>
  </div>
</template>
