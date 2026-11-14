<script setup lang="ts">
// 西洋棋封面：一角黃白相間的棋盤，白馬與黑兵；選起時白馬跳「日」字過去
import PieceIcon from '@/ui/art/PieceIcon.vue'
defineProps<{ active?: boolean }>()
const S = 26
</script>

<template>
  <svg viewBox="0 0 200 130" class="cover" :class="{ active }" aria-hidden="true">
    <rect x="30" y="7" :width="S * 6" :height="S * 4.6" fill="var(--color-ink)" />
    <g>
      <template v-for="r in 5" :key="r">
        <rect v-for="c in 6" :key="c" :x="25 + (c - 1) * S" :y="2 + (r - 1) * S" :width="S" :height="S" :fill="(r + c) % 2 ? 'var(--color-yellow)' : 'var(--color-card)'" />
      </template>
      <rect x="25" y="2" :width="S * 6" :height="S * 4.6" fill="none" stroke="var(--color-ink)" stroke-width="2.4" />
    </g>
    <PieceIcon kind="P" :light="false" :x="25 + S * 3.5" :y="2 + S * 1.5" :size="24" />
    <PieceIcon kind="K" :light="false" :x="25 + S * 4.5" :y="2 + S * 0.5" :size="24" />
    <PieceIcon kind="R" :x="25 + S * 0.5" :y="2 + S * 3.5" :size="24" />
    <g class="hop"><PieceIcon kind="N" :x="0" :y="0" :size="26" /></g>
  </svg>
</template>

<style scoped>
.cover {
  width: 100%;
  height: 100%;
  overflow: hidden;
}
.hop {
  transform-box: view-box;
  transform: translate(103px, 93px);
  transition: transform 560ms var(--ease-back);
}
.active .hop {
  transform: translate(129px, 41px);
}
</style>
