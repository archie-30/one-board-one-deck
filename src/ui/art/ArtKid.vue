<script setup lang="ts">
// 塗鴉小人：玩家與 20 位對手共用。心情會換表情與姿勢，並帶一個循環小動作：
//   idle 呼吸＋眨眼、think 歪頭＋頭上三個點、happy 小跳、sad 垮下來、smug 抬頭、shock 抖一下
import { computed } from 'vue'
import { kidParts, type KidLook, type KidMood } from './kid'
import Sketch from './Sketch.vue'

const props = withDefaults(defineProps<{ look: KidLook; mood?: KidMood; seed?: number; flip?: boolean }>(), { mood: 'idle', seed: 1 })
const parts = computed(() => kidParts(props.look, props.mood))
</script>

<template>
  <svg class="kid" :class="[`m-${mood}`, { flip }]" viewBox="0 -14 80 114" aria-hidden="true">
    <g class="all">
      <Sketch :prims="parts.legs" :seed="seed" />
      <g class="torso">
        <g class="arm-l"><Sketch :prims="parts.armL" :seed="seed + 11" /></g>
        <Sketch :prims="parts.body" :seed="seed + 3" />
        <g class="arm-r"><Sketch :prims="parts.armR" :seed="seed + 13" /></g>
        <g class="head">
          <Sketch :prims="parts.head" :seed="seed + 5" />
          <g class="face"><Sketch :prims="parts.face" :seed="seed + 7" /></g>
        </g>
      </g>
    </g>
    <g v-if="mood === 'think'" class="dots">
      <circle cx="58" cy="-2" r="2.4" />
      <circle cx="65" cy="-6" r="2.4" />
      <circle cx="72" cy="-10" r="2.4" />
    </g>
  </svg>
</template>

<style scoped>
.kid {
  display: block;
  overflow: visible;
}
.flip .all {
  transform: scaleX(-1);
  transform-origin: 40px 0;
}
.all,
.torso,
.head,
.face {
  transform-box: view-box;
}
/* 呼吸：身體以腳底為支點微微伸縮 */
.torso {
  transform-origin: 40px 82px;
  animation: breathe 2.6s ease-in-out infinite;
}
@keyframes breathe {
  50% {
    transform: scaleY(1.025) translateY(-0.6px);
  }
}
/* 眨眼 */
.face {
  transform-origin: 40px 34px;
  animation: blink 4.2s infinite;
}
@keyframes blink {
  0%,
  92%,
  100% {
    transform: scaleY(1);
  }
  95% {
    transform: scaleY(0.12);
  }
}
.head {
  transform-origin: 40px 50px;
}
/* 思考：歪頭左右擺 */
.m-think .head {
  animation: ponder 1.8s ease-in-out infinite alternate;
}
@keyframes ponder {
  from {
    transform: rotate(-7deg);
  }
  to {
    transform: rotate(4deg);
  }
}
.dots circle {
  fill: var(--color-ink);
  animation: dot 1.1s ease-in-out infinite;
}
.dots circle:nth-child(2) {
  animation-delay: 0.15s;
}
.dots circle:nth-child(3) {
  animation-delay: 0.3s;
}
@keyframes dot {
  0%,
  60%,
  100% {
    opacity: 0.25;
    transform: translateY(0);
  }
  30% {
    opacity: 1;
    transform: translateY(-3px);
  }
}
/* 開心：小跳＋落地壓扁 */
.m-happy .all {
  transform-origin: 40px 96px;
  animation: hop 1.1s var(--ease-out) infinite;
}
.flip.m-happy .all {
  animation-name: hop-flip;
}
@keyframes hop {
  0%,
  100% {
    transform: none;
  }
  12% {
    transform: scale(1.06, 0.92);
  }
  38% {
    transform: translateY(-13px) scale(0.96, 1.05);
  }
  62% {
    transform: none;
  }
  70% {
    transform: scale(1.05, 0.94);
  }
}
@keyframes hop-flip {
  0%,
  100% {
    transform: scaleX(-1);
  }
  12% {
    transform: scale(-1.06, 0.92);
  }
  38% {
    transform: translateY(-13px) scale(-0.96, 1.05);
  }
  62% {
    transform: scaleX(-1);
  }
  70% {
    transform: scale(-1.05, 0.94);
  }
}
/* 難過：頭垂下來 */
.m-sad .head {
  animation: droop 3s ease-in-out infinite alternate;
}
@keyframes droop {
  from {
    transform: translateY(3px) rotate(6deg);
  }
  to {
    transform: translateY(4px) rotate(9deg);
  }
}
.m-smug .head {
  transform: rotate(-6deg);
}
/* 嚇一跳：抖一下 */
.m-shock .all {
  animation: shiver 0.42s linear 1;
}
@keyframes shiver {
  20% {
    transform: translateX(-2px);
  }
  40% {
    transform: translateX(2px);
  }
  60% {
    transform: translateX(-1.5px);
  }
  80% {
    transform: translateX(1px);
  }
}
.flip.m-shock .all {
  animation: none;
}
</style>
