<script setup lang="ts">
// 桌面中央的牌堆：每一手牌都疊在前一手上面，位置和角度略有不同，像真的丟在桌上。
// 新的牌從出牌者的方向飛進來；上一輪留下的牌會變淡。
import type { Card } from '@/engine/bigtwo/cards'
import PlayingCard from './PlayingCard.vue'

export interface PilePlay {
  id: number
  cards: readonly Card[]
  /** 出牌者的座位：0 下、1 右、2 上、3 左 */
  from: number
  /** 是否屬於目前這一輪 */
  live: boolean
}

defineProps<{ plays: readonly PilePlay[]; caption?: string }>()

/** 用編號算出固定的偏移與角度（同一手牌每次畫都在同一個位置） */
function rest(id: number) {
  const h = (n: number) => {
    const x = Math.sin(id * 127.1 + n * 311.7) * 43758.5453
    return x - Math.floor(x) - 0.5
  }
  return { '--ox': `${h(1) * 2.6}rem`, '--oy': `${h(2) * 1.1}rem`, '--rot': `${h(3) * 16}deg` }
}
</script>

<template>
  <div class="table-play">
    <TransitionGroup name="play" tag="div" class="pile">
      <div v-for="play in plays" :key="play.id" class="slot" :class="{ old: !play.live }" :style="rest(play.id)">
        <div class="spread" :class="`from-${play.from}`">
          <PlayingCard v-for="card in play.cards" :key="card" :card="card" />
        </div>
      </div>
    </TransitionGroup>
    <p class="caption font-display">{{ caption }}</p>
  </div>
</template>

<style scoped>
.table-play {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}
.pile {
  position: relative;
  width: 100%;
  height: 5.6rem;
}
.slot {
  --cw: 3.3rem;
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(calc(-50% + var(--ox)), calc(-50% + var(--oy))) rotate(var(--rot));
  transition: filter 260ms ease;
}
/* 上一輪的牌：褪色但不透明，才不會互相透出來 */
.slot.old {
  filter: saturate(0.25) contrast(0.42) brightness(1.22);
}
.spread {
  display: flex;
}
.spread :deep(.card) {
  margin-left: calc(var(--cw) * -0.34);
}
.spread :deep(.card:first-child) {
  margin-left: 0;
}
.caption {
  min-height: 1.4rem;
  padding-top: 0.5rem;
  font-size: 0.85rem;
  line-height: 1.4;
  color: var(--color-near);
}
.from-0 {
  --fx: 0rem;
  --fy: 6rem;
}
.from-1 {
  --fx: 12rem;
  --fy: -1rem;
}
.from-2 {
  --fx: 0rem;
  --fy: -6rem;
}
.from-3 {
  --fx: -12rem;
  --fy: -1rem;
}
/* 飛進來、落在牌堆上：落點稍微過頭再回來 */
@keyframes throw {
  from {
    opacity: 0;
    transform: translate(var(--fx), var(--fy)) rotate(-14deg) scale(1.12);
  }
  30% {
    opacity: 1;
  }
}
.play-enter-active .spread {
  animation: throw 420ms var(--ease-back) both;
}
.play-leave-active {
  transition: opacity 240ms ease;
}
.play-leave-to {
  opacity: 0;
}
</style>
