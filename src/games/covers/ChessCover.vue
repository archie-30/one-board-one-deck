<script setup lang="ts">
// 西洋棋封面：6×4 的棋盤一角，白車、白馬、黑兵、黑王都在格子正中間。
// 停在這張卡片上時循環播放：白馬跳「日」字（左右一格、上下兩格）吃掉黑兵 → 停一下 → 跳回原位，黑兵回來
import PieceIcon from '@/ui/art/PieceIcon.vue'
defineProps<{ active?: boolean }>()
const S = 26
const X0 = 22
const Y0 = 12
const cx = (c: number) => X0 + S * (c + 0.5)
const cy = (r: number) => Y0 + S * (r + 0.5)
</script>

<template>
  <svg viewBox="0 0 200 130" class="cover" :class="{ active }" aria-hidden="true">
    <rect :x="X0 + 4" :y="Y0 + 4" :width="S * 6" :height="S * 4" fill="var(--color-ink)" />
    <template v-for="r in 4" :key="r">
      <rect v-for="c in 6" :key="c" :x="X0 + (c - 1) * S" :y="Y0 + (r - 1) * S" :width="S" :height="S" :fill="(r + c) % 2 ? 'var(--color-yellow)' : 'var(--color-card)'" />
    </template>
    <rect :x="X0" :y="Y0" :width="S * 6" :height="S * 4" fill="none" stroke="var(--color-ink)" stroke-width="2.4" />
    <PieceIcon kind="K" :light="false" :x="cx(5)" :y="cy(0)" :size="22" />
    <PieceIcon kind="R" :x="cx(0)" :y="cy(3)" :size="22" />
    <g class="pawn"><PieceIcon kind="P" :light="false" :x="cx(2)" :y="cy(1)" :size="22" /></g>
    <g class="hop" :style="{ '--x0': `${cx(1)}px`, '--y0': `${cy(3)}px`, '--x1': `${cx(2)}px`, '--y1': `${cy(1)}px` }">
      <PieceIcon kind="N" :x="0" :y="0" :size="24" />
    </g>
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
  transform: translate(var(--x0), var(--y0));
}
.pawn {
  transform-box: fill-box;
  transform-origin: center;
}
.active .hop {
  animation: hop 3s var(--ease-in-out) infinite;
}
.active .pawn {
  animation: taken 3s ease-out infinite;
}
/* 跳過去：中間抬高放大一點（拋物線），落地壓一下；停一下再跳回來 */
@keyframes hop {
  0%,
  10% {
    transform: translate(var(--x0), var(--y0));
  }
  21% {
    transform: translate(calc((var(--x0) + var(--x1)) / 2), calc((var(--y0) + var(--y1)) / 2 - 8px)) scale(1.18);
  }
  31% {
    transform: translate(var(--x1), var(--y1)) scale(1.06, 0.94);
  }
  35%,
  62% {
    transform: translate(var(--x1), var(--y1));
  }
  73% {
    transform: translate(calc((var(--x0) + var(--x1)) / 2), calc((var(--y0) + var(--y1)) / 2 - 8px)) scale(1.18);
  }
  83% {
    transform: translate(var(--x0), var(--y0)) scale(1.06, 0.94);
  }
  87%,
  100% {
    transform: translate(var(--x0), var(--y0));
  }
}
/* 黑兵：馬落地時被吃掉（縮小淡出），馬跳回去後再出現 */
@keyframes taken {
  0%,
  29% {
    opacity: 1;
    transform: none;
  }
  36%,
  84% {
    opacity: 0;
    transform: scale(0.5) translateY(-6px);
  }
  94%,
  100% {
    opacity: 1;
    transform: none;
  }
}
</style>
