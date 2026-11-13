<script setup lang="ts">
// 大老二大廳的色塊插圖：三個座位上的對手每隔一陣子換人（每局隨機入座），中間一手攤開的牌
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { OPPONENTS } from '@/data/names'
import { S } from '@/data/strings'
import Avatar from '@/ui/art/Avatar.vue'
import Burst from '@/ui/art/Burst.vue'
import Card from '@/ui/art/Card.vue'

const seats = ref([0, 6, 11])
const swap = ref(-1)
let n = 0
let timer = 0
onMounted(() => {
  timer = window.setInterval(() => {
    const seat = n++ % 3
    const used = new Set(seats.value)
    const free = OPPONENTS.map((_, i) => i).filter((i) => !used.has(i))
    seats.value[seat] = free[Math.floor(Math.random() * free.length)]
    swap.value = seat
  }, 1500)
})
onBeforeUnmount(() => window.clearInterval(timer))
const fan = [
  { rank: '3', suit: 0 },
  { rank: '9', suit: 2 },
  { rank: 'J', suit: 3 },
  { rank: 'A', suit: 1 },
  { rank: '2', suit: 3 },
]
</script>

<template>
  <div class="bt">
    <div class="seats">
      <div v-for="(id, s) in seats" :key="`${s}-${id}`" class="seat" :class="{ swap: swap === s }">
        <span class="av"><Avatar :look="OPPONENTS[id].look" :mood="swap === s ? 'happy' : 'idle'" /></span>
        <span class="nm t-black">{{ OPPONENTS[id].name }}</span>
        <span class="t-label tg">{{ OPPONENTS[id].tag }}</span>
      </div>
    </div>
    <svg viewBox="0 0 260 140" class="fan" aria-hidden="true">
      <g v-for="(c, i) in fan" :key="i" class="fc" :style="{ '--a': `${(i - 2) * 12}deg` }">
        <Card :rank="c.rank" :suit="c.suit" transform="translate(95 20)" />
      </g>
    </svg>
    <Burst class="burst pop" tone="yellow" size="4.2rem" style="--i: 6"><span class="whitespace-pre-line">{{ S.lobby.random }}</span></Burst>
  </div>
</template>

<style scoped>
.bt {
  position: relative;
  display: flex;
  height: 100%;
  flex-direction: column;
  justify-content: center;
  gap: 0.6rem;
}
.seats {
  display: flex;
  justify-content: space-around;
}
.seat {
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1.2;
}
.swap {
  animation: pop 420ms var(--ease-back) both;
}
.av {
  display: block;
  width: 3.4rem;
  height: 3.4rem;
}
.av :deep(svg) {
  width: 100%;
  height: 100%;
}
.nm {
  margin-top: 0.3rem;
  font-size: 0.95rem;
}
.tg {
  font-size: 0.5rem;
  opacity: 0.8;
}
.fan {
  width: 100%;
  height: 40%;
  overflow: visible;
}
.fc {
  transform-box: view-box;
  transform-origin: 130px 150px;
  transform: rotate(var(--a));
  animation: fan-in 600ms var(--ease-back) both 200ms;
}
@keyframes fan-in {
  from {
    transform: rotate(0deg) translateY(20px);
  }
}
.burst {
  position: absolute;
  right: 0.4rem;
  bottom: 0.6rem;
  rotate: 10deg;
}
</style>
