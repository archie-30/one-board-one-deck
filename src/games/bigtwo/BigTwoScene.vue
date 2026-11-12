<script setup lang="ts">
// 大老二大廳的場景：一張牌桌，三個座位上的對手每隔一陣子換人（每局都是隨機入座），
// 桌子中間有人在洗牌，你的小人站在桌邊。
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { OPPONENTS, PLAYER_LOOK } from '@/data/names'
import { S } from '@/data/strings'
import ArtCard from '@/ui/art/ArtCard.vue'
import ArtKid from '@/ui/art/ArtKid.vue'
import { TONE, hatch, roundRectPts, type Prim } from '@/ui/art/ink'
import Sketch from '@/ui/art/Sketch.vue'

const table = roundRectPts(60, 70, 280, 170, 34, 6)
const tablePrims: Prim[] = [
  { k: 'fill', pts: roundRectPts(68, 80, 280, 170, 34, 6), tone: TONE.shadow },
  { k: 'fill', pts: table, tone: TONE.kraftL },
  { k: 'hatch', pts: roundRectPts(60, 190, 280, 50, 20, 4), tone: TONE.kraftM, spacing: 4.2, width: 1 },
  { k: 'loop', pts: table, w: 3 },
  { k: 'loop', pts: roundRectPts(76, 86, 248, 138, 24, 6), w: 1.4, tone: TONE.kraftM },
]
void hatch

const seats = ref([0, 6, 11])
const swapping = ref(-1)
let n = 0
let timer = 0
onMounted(() => {
  const pool = OPPONENTS.map((_, i) => i)
  timer = window.setInterval(() => {
    const seat = n++ % 3
    const used = new Set(seats.value)
    const free = pool.filter((i) => !used.has(i))
    seats.value[seat] = free[Math.floor(Math.random() * free.length)]
    swapping.value = seat
  }, 1700)
})
onBeforeUnmount(() => window.clearInterval(timer))

const seatPos = [
  { x: 6, y: 92, w: 62, flip: false },
  { x: 168, y: 2, w: 62, flip: false },
  { x: 332, y: 92, w: 62, flip: true },
]
</script>

<template>
  <div class="bt-scene">
    <svg viewBox="0 -14 400 330" class="stage" aria-hidden="true">
      <!-- 對手：站在桌子後面，桌子會蓋住他們的腳 -->
      <template v-for="(id, s) in seats" :key="`${s}-${id}`">
        <g class="seat" :class="{ swap: swapping === s }">
          <ArtKid :look="OPPONENTS[id].look" :seed="id" :flip="seatPos[s].flip" :x="seatPos[s].x" :y="seatPos[s].y" :width="seatPos[s].w" :height="seatPos[s].w * 1.42" />
          <text :x="seatPos[s].x + seatPos[s].w / 2" :y="seatPos[s].y - 4" text-anchor="middle" class="font-display nm">{{ OPPONENTS[id].name }}</text>
        </g>
      </template>
      <Sketch :prims="tablePrims" :seed="4" />
      <!-- 發好的牌 -->
      <g v-for="i in 4" :key="`l${i}`"><ArtCard back still :seed="i" :transform="`translate(${92 + i * 3} ${118 + i * 4}) rotate(-80) scale(.42)`" /></g>
      <g v-for="i in 4" :key="`t${i}`"><ArtCard back still :seed="i + 9" :transform="`translate(${170 + i * 7} ${92}) scale(.42)`" /></g>
      <g v-for="i in 4" :key="`r${i}`"><ArtCard back still :seed="i + 19" :transform="`translate(${300 - i * 3} ${118 + i * 4}) rotate(80) scale(.42)`" /></g>
      <!-- 洗牌 -->
      <g class="deck"><ArtCard back :seed="31" transform="translate(178 148) scale(.55)" /></g>
      <g class="cut"><ArtCard back :seed="32" transform="translate(178 146) scale(.55)" /></g>
      <g class="cut c2"><ArtCard back :seed="33" transform="translate(178 144) scale(.55)" /></g>
      <!-- 你 -->
      <ArtKid :look="PLAYER_LOOK" :seed="7" :x="40" :y="200" :width="74" :height="105" />
      <g class="hand">
        <ArtCard rank="2" :suit="3" :seed="51" transform="translate(126 238) rotate(-12) scale(.5)" />
        <ArtCard rank="A" :suit="2" :seed="52" transform="translate(146 234) rotate(2) scale(.5)" />
      </g>
    </svg>
    <p class="caption font-display">{{ S.lobby.seats }}</p>
  </div>
</template>

<style scoped>
.bt-scene {
  position: relative;
  display: flex;
  height: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.stage {
  width: 100%;
  max-width: 30rem;
  max-height: 88%;
  overflow: visible;
  animation: pop 420ms var(--ease-back) both;
}
.nm {
  font-size: 11px;
  font-weight: 800;
}
.seat.swap {
  transform-box: fill-box;
  transform-origin: center bottom;
  animation: seat-in 380ms var(--ease-back) both;
}
@keyframes seat-in {
  from {
    opacity: 0;
    transform: translateY(14px) scale(0.85);
  }
}
.cut {
  transform-box: view-box;
  animation: cut 2.4s var(--ease-in-out) infinite;
}
.c2 {
  animation-delay: 0.25s;
}
@keyframes cut {
  0%,
  20%,
  100% {
    transform: none;
  }
  35% {
    transform: translate(30px, -4px) rotate(8deg);
  }
  55% {
    transform: translate(30px, -4px) rotate(8deg);
  }
  70% {
    transform: translate(0, -6px);
  }
}
.hand {
  transform-box: view-box;
  transform-origin: 140px 280px;
  animation: hand-sway 3s ease-in-out infinite alternate;
}
@keyframes hand-sway {
  to {
    transform: rotate(4deg);
  }
}
.caption {
  position: absolute;
  top: 0.4rem;
  right: 0.6rem;
  font-size: 0.72rem;
  color: var(--color-mid);
}
</style>
