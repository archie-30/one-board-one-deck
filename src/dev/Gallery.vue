<script setup lang="ts">
import { OPPONENTS, PLAYER_LOOK } from '@/data/names'
import ArtCard from '@/ui/art/ArtCard.vue'
import ArtKid from '@/ui/art/ArtKid.vue'
const moods = ['idle', 'think', 'happy', 'sad', 'smug', 'shock'] as const
</script>
<template>
  <div style="padding: 10px; display: flex; flex-wrap: wrap; gap: 6px; height: 100%; overflow: auto">
    <div v-for="m in moods" :key="m" style="width: 70px; text-align: center; font-size: 10px">
      <ArtKid :look="PLAYER_LOOK" :mood="m" style="width: 70px; height: 96px" />{{ m }}
    </div>
    <div v-for="(o, i) in OPPONENTS" :key="i" style="width: 62px; text-align: center; font-size: 10px">
      <ArtKid :look="o.look" :seed="i" style="width: 62px; height: 86px" />{{ o.name }}
    </div>
    <svg viewBox="-5 -5 330 115" style="width: 520px; height: 180px">
      <ArtCard rank="10" :suit="2" transform="translate(0 0)" />
      <ArtCard rank="K" :suit="3" transform="translate(80 0)" />
      <ArtCard rank="2" :suit="1" transform="translate(160 0)" />
      <ArtCard back transform="translate(240 0)" />
    </svg>
  </div>
</template>
