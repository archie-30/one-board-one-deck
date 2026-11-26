<script setup lang="ts">
// 軍棋棋盤（橫放）：自己的陣地在左、對方在右；中間一條山界，只有上、中、下三條鐵路接過去。
// 鐵路是粗黑線上一段段米白（像鐵軌），公路是細線；兵站是小方框、行營是圓圈、大本營是雙框。
// 子是方塊：先手朱紅、後手鈷藍，上面一個字（司、軍、師…）；看不到的子只有底色＋一顆小星星。
// 純畫面：點了哪一點往外丟，規則由外面決定。
import { computed } from 'vue'
import { S } from '@/data/strings'
import { CAMPS, CELLS, colOf, HQS, RAIL, RAIL_ADJ, ROAD_ADJ, rowOf, UNKNOWN } from '@/engine/junqi/rules'

export interface JunqiFx {
  /** 每一步換一個，動畫才會重播 */
  key: number
  from: number
  to: number
  out: 'move' | 'win' | 'lose' | 'tie'
  /** 攻方、守方長什麼樣子（陣亡的要畫一個淡掉的影子） */
  att: { side: number; rank: number }
  def: { side: number; rank: number } | null
}

const props = defineProps<{
  /** 每一點上的子（-1＝空） */
  board: readonly number[]
  /** 每顆子是什麼（-1＝看不到） */
  rank: readonly number[]
  /** 自己是 1 號（整盤轉過來，讓自己在左邊） */
  flip?: boolean
  interactive?: boolean
  selected?: number
  targets?: readonly number[]
  /** 上一步（動畫） */
  fx?: JunqiFx | null
  /** 教學、佈陣：要亮起來的點 */
  hints?: readonly number[]
  /** 佈陣中：只有自己這半邊能點，對方那半邊淡一點 */
  deploying?: boolean
}>()
const emit = defineEmits<{ pick: [at: number] }>()
const T = S.junqi
const NAMES = T.short

/** 畫面上第幾欄（左到右 0～11）、第幾列（上到下 0～4） */
const gx = (at: number) => (props.flip ? rowOf(at) : 11 - rowOf(at))
const gy = (at: number) => (props.flip ? 4 - colOf(at) : colOf(at))
const STEP = 10
const GAP = 6
const M = 7
const x = (at: number) => M + gx(at) * STEP + (gx(at) >= 6 ? GAP : 0)
const y = (at: number) => M + gy(at) * STEP
const W = M * 2 + 11 * STEP + GAP
const H = M * 2 + 4 * STEP
const TW = 8.4
const TH = 6.8

const all = Array.from({ length: CELLS }, (_, i) => i)
const sideOf = (id: number) => (id < 25 ? 0 : 1)
/** 線：鐵路（兩點都在鐵路上而且鐵路相連）、公路 */
const rails: [number, number][] = []
const roads: [number, number][] = []
for (let a = 0; a < CELLS; a++) {
  for (const b of RAIL_ADJ[a]) if (a < b) rails.push([a, b])
  for (const b of ROAD_ADJ[a]) if (a < b && !RAIL_ADJ[a].includes(b)) roads.push([a, b])
}
/** 我這半邊（佈陣時亮的那一半）：畫面左半 */
const leftHalf = (at: number) => gx(at) < 6
const tset = computed(() => new Set(props.targets ?? []))
const hset = computed(() => new Set(props.hints ?? []))
/** 走過來的子：從原位滑過來 */
const slide = (at: number) => {
  const f = props.fx
  if (!f || f.to !== at || f.out === 'lose' || f.out === 'tie') return undefined
  return { '--dx': `${x(f.from) - x(at)}px`, '--dy': `${y(f.from) - y(at)}px` }
}
const fxFrom = computed(() => (props.fx ? { '--dx': `${x(props.fx.from) - x(props.fx.to)}px`, '--dy': `${y(props.fx.from) - y(props.fx.to)}px` } : undefined))

function pick(at: number) {
  if (props.interactive) emit('pick', at)
}
</script>

<template>
  <svg :viewBox="`0 0 ${W} ${H}`" class="jb" :class="{ live: interactive, deploying }">
    <rect x="0.9" y="1.1" :width="W" :height="H" fill="var(--color-ink)" />
    <rect x="0" y="0" :width="W" :height="H" fill="var(--color-card)" stroke="var(--color-ink)" stroke-width="0.6" />
    <!-- 中間的山界 -->
    <rect :x="M + 5 * STEP + 1.2" y="0.3" :width="STEP + GAP - 2.4" :height="H - 0.6" class="front" />
    <g v-for="r in [1, 3]" :key="`mt${r}`" class="mt">
      <path :d="`M ${M + 5.5 * STEP + GAP / 2 - 3.6} ${M + r * STEP + 2.2} l 2.3 -4 l 1.3 2 l 1.1 -1.6 l 2.5 3.6 z`" />
    </g>
    <!-- 公路 -->
    <line v-for="([a, b], k) in roads" :key="`r${k}`" :x1="x(a)" :y1="y(a)" :x2="x(b)" :y2="y(b)" class="road" />
    <!-- 鐵路 -->
    <line v-for="([a, b], k) in rails" :key="`rl${k}`" :x1="x(a)" :y1="y(a)" :x2="x(b)" :y2="y(b)" class="rail" />
    <line v-for="([a, b], k) in rails" :key="`rt${k}`" :x1="x(a)" :y1="y(a)" :x2="x(b)" :y2="y(b)" class="tie" />
    <!-- 點：兵站、行營、大本營 -->
    <template v-for="at in all" :key="`p${at}`">
      <circle v-if="CAMPS.has(at)" :cx="x(at)" :cy="y(at)" r="4.1" class="camp" />
      <g v-else-if="HQS.has(at)">
        <rect :x="x(at) - 5" :y="y(at) - 4.2" width="10" height="8.4" rx="1.6" class="hq" />
        <rect :x="x(at) - 3.9" :y="y(at) - 3.1" width="7.8" height="6.2" rx="1" class="hq2" />
      </g>
      <rect v-else :x="x(at) - 3.4" :y="y(at) - 2.6" width="6.8" height="5.2" rx="0.8" class="post" :class="{ onrail: RAIL.has(at) }" />
    </template>
    <!-- 教學、佈陣提示 -->
    <rect v-for="at in hints ?? []" :key="`h${at}`" :x="x(at) - TW / 2 - 1" :y="y(at) - TH / 2 - 1" :width="TW + 2" :height="TH + 2" rx="1.6" class="hint" :class="{ dim: hset.size === 0 }" />
    <!-- 陣亡的影子 -->
    <template v-if="fx && fx.out !== 'move' && fx.out !== 'win'">
      <g :key="`ga${fx.key}`" class="ghost att" :style="fxFrom">
        <rect :x="x(fx.to) - TW / 2" :y="y(fx.to) - TH / 2" :width="TW" :height="TH" rx="1.2" class="tile" :class="`s${fx.att.side}`" />
        <text v-if="fx.att.rank !== UNKNOWN" :x="x(fx.to)" :y="y(fx.to) + 0.2" class="ch">{{ NAMES[fx.att.rank] }}</text>
      </g>
    </template>
    <template v-if="fx && fx.def && (fx.out === 'win' || fx.out === 'tie')">
      <g :key="`gd${fx.key}`" class="ghost def">
        <rect :x="x(fx.to) - TW / 2" :y="y(fx.to) - TH / 2" :width="TW" :height="TH" rx="1.2" class="tile" :class="`s${fx.def.side}`" />
        <text v-if="fx.def.rank !== UNKNOWN" :x="x(fx.to)" :y="y(fx.to) + 0.2" class="ch">{{ NAMES[fx.def.rank] }}</text>
        <path v-else :d="`M ${x(fx.to)} ${y(fx.to) - 1.6} l 0.5 1.1 1.2 0.1 -0.9 0.8 0.3 1.2 -1.1 -0.6 -1.1 0.6 0.3 -1.2 -0.9 -0.8 1.2 -0.1 z`" class="star" />
      </g>
    </template>
    <!-- 子 -->
    <template v-for="at in all" :key="`s${at}-${board[at]}-${fx && fx.to === at ? fx.key : 0}`">
      <g v-if="board[at] >= 0" class="pc" :class="{ slide: !!slide(at), sel: selected === at, away: deploying && !leftHalf(at) }" :style="slide(at)">
        <rect :x="x(at) - TW / 2 + 0.6" :y="y(at) - TH / 2 + 0.7" :width="TW" :height="TH" rx="1.2" fill="var(--color-ink)" />
        <rect :x="x(at) - TW / 2" :y="y(at) - TH / 2" :width="TW" :height="TH" rx="1.2" class="tile" :class="`s${sideOf(board[at])}`" />
        <text v-if="rank[board[at]] !== UNKNOWN" :x="x(at)" :y="y(at) + 0.2" class="ch">{{ NAMES[rank[board[at]]] }}</text>
        <path v-else :d="`M ${x(at)} ${y(at) - 1.6} l 0.5 1.1 1.2 0.1 -0.9 0.8 0.3 1.2 -1.1 -0.6 -1.1 0.6 0.3 -1.2 -0.9 -0.8 1.2 -0.1 z`" class="star" />
        <rect v-if="selected === at" :x="x(at) - TW / 2 - 1" :y="y(at) - TH / 2 - 1" :width="TW + 2" :height="TH + 2" rx="1.8" class="selring" />
      </g>
    </template>
    <!-- 碰子的火花 -->
    <g v-if="fx && fx.out !== 'move'" :key="`b${fx.key}`" class="burst" :style="{ transformOrigin: `${x(fx.to)}px ${y(fx.to)}px` }">
      <path :d="`M ${x(fx.to)} ${y(fx.to) - 6} l 1.4 3.6 3.8 -1 -2.4 3 3.2 2.2 -3.8 0.4 0.2 3.8 -2.4 -3 -2.4 3 0.2 -3.8 -3.8 -0.4 3.2 -2.2 -2.4 -3 3.8 1 z`" />
    </g>
    <!-- 能走到的點 -->
    <circle v-for="at in targets ?? []" :key="`t${at}`" :cx="x(at)" :cy="y(at)" :r="board[at] >= 0 ? 4.6 : 1.7" class="tgt" :class="{ hit: board[at] >= 0 }" />
    <!-- 點擊範圍 -->
    <template v-if="interactive">
      <rect v-for="at in all" :key="`c${at}`" :x="x(at) - STEP / 2" :y="y(at) - STEP / 2" :width="STEP" :height="STEP" class="hitbox" :class="{ on: tset.has(at) }" @click="pick(at)" />
    </template>
  </svg>
</template>

<style scoped>
.jb {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.jb.live {
  touch-action: manipulation;
}
.front {
  fill: color-mix(in srgb, var(--color-yellow) 26%, var(--color-card));
}
.mt path {
  fill: color-mix(in srgb, var(--color-ink) 22%, transparent);
}
.road {
  stroke: var(--color-ink);
  stroke-width: 0.35;
  opacity: 0.55;
}
.rail {
  stroke: var(--color-ink);
  stroke-width: 1.5;
  stroke-linecap: square;
}
.tie {
  stroke: var(--color-card);
  stroke-width: 0.55;
  stroke-dasharray: 1.4 1.4;
}
.post {
  fill: var(--color-card);
  stroke: var(--color-ink);
  stroke-width: 0.4;
}
.camp {
  fill: color-mix(in srgb, var(--color-yellow) 30%, var(--color-card));
  stroke: var(--color-ink);
  stroke-width: 0.45;
}
.hq {
  fill: var(--color-card);
  stroke: var(--color-ink);
  stroke-width: 0.5;
}
.hq2 {
  fill: color-mix(in srgb, var(--color-ink) 7%, var(--color-card));
  stroke: var(--color-ink);
  stroke-width: 0.3;
}
.hint {
  fill: color-mix(in srgb, var(--color-yellow) 75%, transparent);
  stroke: var(--color-ink);
  stroke-width: 0.4;
  pointer-events: none;
  animation: breathe 1.3s ease-in-out infinite;
}
.pc {
  pointer-events: none;
  transition: opacity 300ms;
}
.pc.away {
  opacity: 0.55;
}
.tile {
  stroke: var(--color-ink);
  stroke-width: 0.45;
}
.tile.s0 {
  fill: var(--color-red);
}
.tile.s1 {
  fill: var(--color-blue);
}
.ch {
  fill: var(--color-paper);
  font-size: 5px;
  font-weight: 900;
  text-anchor: middle;
  dominant-baseline: central;
}
.star {
  fill: var(--color-paper);
  opacity: 0.85;
}
.selring {
  fill: none;
  stroke: var(--color-yellow);
  stroke-width: 0.9;
  animation: breathe 1.1s ease-in-out infinite;
}
.tgt {
  fill: var(--color-blue);
  opacity: 0.6;
  pointer-events: none;
  animation: breathe 1.2s ease-in-out infinite;
}
.tgt.hit {
  fill: none;
  stroke: var(--color-yellow);
  stroke-width: 0.9;
  opacity: 1;
}
.hitbox {
  fill: transparent;
  cursor: pointer;
}
/* 走過來：從原位滑過去 */
.pc.slide {
  animation: slide 420ms var(--ease-out) both;
}
@keyframes slide {
  from {
    transform: translate(var(--dx), var(--dy));
  }
}
/* 陣亡：攻方滑過去再淡掉；守方晚一點淡掉 */
.ghost {
  pointer-events: none;
}
.ghost.att {
  animation: ghostAtt 900ms var(--ease-out) both;
}
@keyframes ghostAtt {
  from {
    transform: translate(var(--dx), var(--dy));
  }
  45% {
    transform: none;
    opacity: 1;
  }
  to {
    transform: translateY(-3px);
    opacity: 0;
  }
}
.ghost.def {
  animation: ghostDef 900ms ease-in both;
}
@keyframes ghostDef {
  0%,
  45% {
    opacity: 1;
  }
  to {
    transform: translateY(-3px);
    opacity: 0;
  }
}
.burst path {
  fill: var(--color-yellow);
  stroke: var(--color-ink);
  stroke-width: 0.4;
}
.burst {
  pointer-events: none;
  opacity: 0;
  animation: burst 700ms 260ms ease-out both;
}
@keyframes burst {
  0% {
    opacity: 0;
    transform: scale(0.4);
  }
  30% {
    opacity: 1;
    transform: scale(1.1);
  }
  to {
    opacity: 0;
    transform: scale(1.3);
  }
}
@keyframes breathe {
  50% {
    opacity: 0.4;
  }
}
@media (prefers-reduced-motion: reduce) {
  .pc.slide,
  .ghost,
  .burst,
  .hint,
  .tgt,
  .selring {
    animation: none;
  }
  .ghost,
  .burst {
    opacity: 0;
  }
}
</style>
