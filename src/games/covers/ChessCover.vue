<script setup lang="ts">
// 西洋棋封面：一角黃白相間的棋盤，白馬與黑兵。停在這張卡片上時循環播放：白馬跳「日」字過去（拋物線、落地壓一下）→ 停一下 → 跳回來
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
}
.active .hop {
  animation: hop 3s var(--ease-in-out) infinite;
}
@keyframes hop {
  0%,
  10% {
    transform: translate(103px, 93px);
  }
  22% {
    transform: translate(116px, 52px) scale(1.18);
  }
  32% {
    transform: translate(129px, 41px) scale(1.06, 0.94);
  }
  36%,
  60% {
    transform: translate(129px, 41px);
  }
  72% {
    transform: translate(116px, 52px) scale(1.18);
  }
  82% {
    transform: translate(103px, 93px) scale(1.06, 0.94);
  }
  86%,
  100% {
    transform: translate(103px, 93px);
  }
}
</style>
