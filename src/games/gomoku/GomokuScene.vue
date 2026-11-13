<script setup lang="ts">
// 五子棋大廳的色塊插圖：你和一位對手對下，一顆一顆落子，連成五顆就劃線、清盤、換對手再來
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { OPPONENTS, PLAYER_LOOK } from '@/data/names'
import Avatar from '@/ui/art/Avatar.vue'
import Stone from '@/ui/art/Stone.vue'

const N = 9
const S = 150
const step = S / (N - 1)
const p = (i: number) => 10 + i * step
const MOVES: [number, number][] = [
  [4, 4], [5, 4], [3, 5], [5, 5], [5, 3], [4, 5], [2, 6], [6, 2], [3, 3], [6, 5], [6, 2], [1, 7],
]
const SEQ = MOVES.filter((m, i) => MOVES.findIndex((x) => x[0] === m[0] && x[1] === m[1]) === i)
const shown = ref(0)
const opp = ref(13)
const won = computed(() => shown.value >= SEQ.length)
let timer = 0
onMounted(() => {
  timer = window.setInterval(() => {
    if (shown.value >= SEQ.length + 3) {
      shown.value = 0
      opp.value = (opp.value + 7) % OPPONENTS.length
    } else shown.value++
  }, 750)
})
onBeforeUnmount(() => window.clearInterval(timer))
</script>

<template>
  <div class="gm">
    <span class="av left"><Avatar :look="PLAYER_LOOK" :mood="won ? 'happy' : shown % 2 === 0 ? 'think' : 'idle'" /></span>
    <svg viewBox="0 0 170 170" class="board" aria-hidden="true">
      <rect x="6" y="6" width="164" height="164" fill="var(--color-ink)" />
      <rect x="0" y="0" width="164" height="164" fill="var(--color-card)" stroke="var(--color-ink)" stroke-width="2.4" />
      <g stroke="var(--color-ink)" stroke-width="1">
        <line v-for="i in N" :key="`h${i}`" :x1="p(0) + 2" :x2="p(N - 1) + 2" :y1="p(i - 1) + 2" :y2="p(i - 1) + 2" />
        <line v-for="i in N" :key="`v${i}`" :y1="p(0) + 2" :y2="p(N - 1) + 2" :x1="p(i - 1) + 2" :x2="p(i - 1) + 2" />
      </g>
      <g v-for="(m, i) in SEQ.slice(0, Math.min(shown, SEQ.length))" :key="`${opp}-${i}`" class="drop">
        <Stone :cx="p(m[0]) + 2" :cy="p(m[1]) + 2" :r="7.5" :black="i % 2 === 0" />
      </g>
      <line v-if="won" :key="`w${opp}`" class="win" :x1="p(1) - 4" :y1="p(7) + 8" :x2="p(6) + 8" :y2="p(2) - 4" />
    </svg>
    <span :key="opp" class="av right pop"><Avatar :look="OPPONENTS[opp].look" flip :mood="won ? 'sad' : shown % 2 === 1 ? 'think' : 'idle'" /></span>
  </div>
</template>

<style scoped>
.gm {
  display: flex;
  height: 100%;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
}
.board {
  width: 58%;
  max-height: 90%;
  overflow: visible;
}
.av {
  display: block;
  width: 3rem;
  height: 3rem;
  flex-shrink: 0;
}
.av :deep(svg) {
  width: 100%;
  height: 100%;
}
.left {
  align-self: flex-end;
  margin-bottom: 2rem;
}
.right {
  align-self: flex-start;
  margin-top: 2rem;
}
.drop {
  transform-box: fill-box;
  transform-origin: center;
  animation: drop 320ms var(--ease-back) both;
}
@keyframes drop {
  from {
    opacity: 0;
    transform: translateY(-14px) scale(1.35);
  }
}
.win {
  stroke: var(--color-red);
  stroke-width: 6;
  stroke-linecap: square;
  stroke-dasharray: 220;
  animation: draw 500ms var(--ease-in-out) both;
}
@keyframes draw {
  from {
    stroke-dashoffset: 220;
  }
  to {
    stroke-dashoffset: 0;
  }
}
</style>
