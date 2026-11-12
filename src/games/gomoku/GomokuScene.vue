<script setup lang="ts">
// 五子棋大廳的場景：你和一位對手對下，一顆一顆落子，有人連成五顆就劃紅線、清盤再來。
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { OPPONENTS, PLAYER_LOOK } from '@/data/names'
import ArtKid from '@/ui/art/ArtKid.vue'
import ArtStone from '@/ui/art/ArtStone.vue'
import { inkPath } from '@/ui/art/ink'
import Sketch from '@/ui/art/Sketch.vue'
import { boardPrims } from './boardArt'

const N = 9
const PAD = 14
const SIDE = 180
const step = (SIDE - PAD * 2) / (N - 1)
const art = boardPrims(110, 40, SIDE, N, PAD, 1.1)
const px = (i: number) => 110 + PAD + i * step
const py = (i: number) => 40 + PAD + i * step

// 一盤固定的棋：黑棋最後斜向連成五顆
const SCRIPT: [number, number][] = [
  [4, 4], [5, 4], [3, 5], [5, 5], [5, 3], [4, 5], [2, 6], [6, 2], [3, 3], [1, 7], [6, 6], [2, 2], [1, 7],
]
const MOVES = (() => {
  const seen = new Set<string>()
  return SCRIPT.filter(([x, y]) => !seen.has(`${x},${y}`) && seen.add(`${x},${y}`))
})()
const shown = ref(0)
const opp = ref(13)
const won = computed(() => shown.value >= MOVES.length)
const turnBlack = computed(() => shown.value % 2 === 0)
const winD = [0, 4099, 8191].map((k) => inkPath([[px(1) - 8, py(7) + 8], [px(4), py(4)], [px(6) + 8, py(2) - 8]], { width: 7, seed: 5 + k, taper: 0.25, pressure: 0.5 }))
let timer = 0
onMounted(() => {
  timer = window.setInterval(() => {
    if (shown.value >= MOVES.length + 3) {
      shown.value = 0
      opp.value = (opp.value + 7) % OPPONENTS.length
    } else shown.value++
  }, 800)
})
onBeforeUnmount(() => window.clearInterval(timer))
</script>

<template>
  <div class="gm-scene">
    <svg viewBox="0 0 400 290" class="stage" aria-hidden="true">
      <Sketch :prims="art.under" :seed="3" still />
      <Sketch :prims="art.edge" :seed="8" />
      <template v-for="(m, i) in MOVES.slice(0, Math.min(shown, MOVES.length))" :key="`${opp}-${i}`">
        <g class="drop"><ArtStone :cx="px(m[0])" :cy="py(m[1])" :r="8.5" :black="i % 2 === 0" :seed="i" /></g>
      </template>
      <g v-if="won" :key="`w${opp}`" class="swipe">
        <path v-for="(d, i) in winD" :key="i" :d="d" fill="var(--color-red)" opacity=".9" :class="`bv${i}`" />
      </g>
      <ArtKid :look="PLAYER_LOOK" :seed="7" :mood="won ? 'happy' : turnBlack ? 'think' : 'idle'" x="8" y="120" width="92" height="132" />
      <g :key="opp" class="opp">
        <ArtKid :look="OPPONENTS[opp].look" :seed="opp" flip :mood="won ? 'sad' : !turnBlack ? 'think' : 'idle'" x="300" y="120" width="92" height="132" />
        <text x="346" y="116" text-anchor="middle" class="font-display nm">{{ OPPONENTS[opp].name }}</text>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.gm-scene {
  display: grid;
  height: 100%;
  place-items: center;
}
.stage {
  width: 100%;
  max-width: 31rem;
  max-height: 90%;
  overflow: visible;
  animation: pop 420ms var(--ease-back) both;
}
.nm {
  font-size: 12px;
  font-weight: 800;
}
.drop {
  transform-box: fill-box;
  transform-origin: center;
  animation: stone-drop 280ms var(--ease-back) both;
}
@keyframes stone-drop {
  from {
    opacity: 0;
    transform: translateY(-12px) scale(1.3);
  }
}
.opp {
  transform-box: fill-box;
  transform-origin: center bottom;
  animation: pop 380ms var(--ease-back) both;
}
</style>
