<script setup lang="ts">
// 步步為營棋盤：9 × 9 米白格子，格子之間留溝放牆（亮黃色、長兩格）。兩顆棋子：先手朱紅、後手鈷藍。
// 自己那一方永遠在下面（後手時整盤轉 180 度）；最上面一列淡淡塗上自己的顏色（終點），最下面一列塗對方的。
// 走棋：能走的格子出現圓點，點一下就走（棋子滑過去）。放牆模式：點格子之間的溝，出現牆的預覽；再點同一個地方（或按「放這裡」）才放下去。
// 純畫面：點了什麼往外丟，規則由外面決定。
import { computed, ref } from 'vue'
import { colOf, N, rowOf, W, type Orient } from '@/engine/quoridor/rules'

const props = defineProps<{
  pawns: [number, number]
  h: boolean[]
  v: boolean[]
  /** 後手：整盤轉 180 度 */
  flip?: boolean
  /** 能走的格子 */
  targets?: readonly number[]
  /** 放牆模式（點溝就預覽牆） */
  wallMode?: boolean
  /** 牆的預覽（ok = 放得下去） */
  preview?: { at: number; o: Orient; ok: boolean } | null
  interactive?: boolean
  /** 選好要走到哪、還沒確定：那一格畫一顆淡淡的棋子 */
  ghost?: { cell: number; side: 0 | 1 } | null
  /** 教學：要亮起來的格子、要亮起來的牆 */
  hints?: readonly number[]
  hintWall?: { at: number; o: Orient } | null
  /** 上一步（走棋：從哪格；放牆：哪一道） */
  last?: { type: 'move'; from: number; to: number } | { type: 'wall'; at: number; o: Orient } | null
}>()
const emit = defineEmits<{ pick: [cell: number]; wall: [at: number, o: Orient]; hover: [wall: { at: number; o: Orient } | null] }>()

const S = 10
const svg = ref<SVGSVGElement>()
/** 引擎的格子／牆 → 畫面上的位置（後手轉 180 度） */
const cv = (i: number) => (props.flip ? N * N - 1 - i : i)
const wv = (at: number) => (props.flip ? W * W - 1 - at : at)
const cx = (i: number) => colOf(cv(i)) * S + S / 2
const cy = (i: number) => rowOf(cv(i)) * S + S / 2
const cells = Array.from({ length: N * N }, (_, i) => i)

/** 一道牆在畫面上的矩形 */
function wallRect(at: number, o: Orient) {
  const d = wv(at)
  const r = Math.floor(d / W)
  const c = d % W
  if (o === 'h') return { x: c * S + 0.6, y: (r + 1) * S - 0.85, w: 2 * S - 1.2, h: 1.7 }
  return { x: (c + 1) * S - 0.85, y: r * S + 0.6, w: 1.7, h: 2 * S - 1.2 }
}
const walls = computed(() => {
  const out: { key: string; at: number; o: Orient }[] = []
  props.h.forEach((on, at) => on && out.push({ key: `h${at}`, at, o: 'h' }))
  props.v.forEach((on, at) => on && out.push({ key: `v${at}`, at, o: 'v' }))
  return out
})
const isLastWall = (at: number, o: Orient) => props.last?.type === 'wall' && props.last.at === at && props.last.o === o

/** 手指／滑鼠的位置 → 最近的那道牆（引擎的編號）；離溝太遠就不算 */
function wallAtPoint(e: PointerEvent | MouseEvent): { at: number; o: Orient } | null {
  const el = svg.value
  const m = el?.getScreenCTM()
  if (!el || !m) return null
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
  const x = p.x / S
  const y = p.y / S
  if (x < 0 || y < 0 || x > N || y > N) return null
  const gy = Math.round(y)
  const gx = Math.round(x)
  const dy = gy >= 1 && gy <= W ? Math.abs(y - gy) : 9
  const dx = gx >= 1 && gx <= W ? Math.abs(x - gx) : 9
  if (Math.min(dx, dy) > 0.42) return null
  const clamp = (n: number) => Math.max(0, Math.min(W - 1, n))
  let d: number
  let o: Orient
  if (dy <= dx) {
    o = 'h'
    d = (gy - 1) * W + clamp(Math.round(x) - 1)
  } else {
    o = 'v'
    d = clamp(Math.round(y) - 1) * W + (gx - 1)
  }
  return { at: wv(d), o }
}
function onClick(e: MouseEvent) {
  if (!props.interactive || !props.wallMode) return
  const w = wallAtPoint(e)
  if (w) emit('wall', w.at, w.o)
}
function onMove(e: PointerEvent) {
  if (e.pointerType !== 'mouse' || !props.interactive || !props.wallMode) return
  emit('hover', wallAtPoint(e))
}
function pickCell(i: number) {
  if (props.interactive && !props.wallMode) emit('pick', i)
}
</script>

<template>
  <svg ref="svg" :viewBox="`-1.2 -1.2 ${N * S + 2.4} ${N * S + 2.4}`" class="qb" :class="{ live: interactive, walling: interactive && wallMode }" @click="onClick" @pointermove="onMove" @pointerleave="emit('hover', null)">
    <rect :x="-1.2 + 0.9" :y="-1.2 + 1.1" :width="N * S + 2.4" :height="N * S + 2.4" fill="var(--color-ink)" />
    <rect x="-1.2" y="-1.2" :width="N * S + 2.4" :height="N * S + 2.4" fill="var(--color-blue)" stroke="var(--color-ink)" stroke-width="1" />
    <!-- 格子 -->
    <rect
      v-for="i in cells"
      :key="i"
      :x="colOf(i) * S + 0.7"
      :y="rowOf(i) * S + 0.7"
      :width="S - 1.4"
      :height="S - 1.4"
      rx="0.8"
      class="cell"
      :class="{
        g0: (rowOf(i) === 0 && !flip) || (rowOf(i) === N - 1 && flip),
        g1: (rowOf(i) === 0 && flip) || (rowOf(i) === N - 1 && !flip),
        hint: hints?.includes(cv(i)),
        from: last?.type === 'move' && cv(last.from) === i,
      }"
      @click="pickCell(cv(i))"
    />
    <!-- 牆 -->
    <TransitionGroup name="wall" tag="g">
      <rect v-for="w in walls" :key="w.key" v-bind="{ x: wallRect(w.at, w.o).x, y: wallRect(w.at, w.o).y, width: wallRect(w.at, w.o).w, height: wallRect(w.at, w.o).h }" rx="0.5" class="wall" :class="{ fresh: isLastWall(w.at, w.o) }" />
    </TransitionGroup>
    <!-- 教學要放的牆 -->
    <rect v-if="hintWall" v-bind="{ x: wallRect(hintWall.at, hintWall.o).x, y: wallRect(hintWall.at, hintWall.o).y, width: wallRect(hintWall.at, hintWall.o).w, height: wallRect(hintWall.at, hintWall.o).h }" rx="0.5" class="wall-hint" />
    <!-- 牆的預覽 -->
    <rect
      v-if="preview"
      v-bind="{ x: wallRect(preview.at, preview.o).x, y: wallRect(preview.at, preview.o).y, width: wallRect(preview.at, preview.o).w, height: wallRect(preview.at, preview.o).h }"
      rx="0.5"
      class="wall-pv"
      :class="{ bad: !preview.ok }"
    />
    <!-- 選好要走到的那一格：淡淡的棋子（再點一次才走） -->
    <g v-if="ghost" class="ghost" :style="{ transform: `translate(${cx(ghost.cell)}px, ${cy(ghost.cell)}px)` }">
      <circle r="3.2" :class="ghost.side === 0 ? 'p0' : 'p1'" stroke="var(--color-ink)" stroke-width="0.8" />
    </g>
    <!-- 能走的格子 -->
    <circle v-for="t in targets ?? []" :key="`t${t}`" :cx="cx(t)" :cy="cy(t)" r="1.6" class="dot" @click.stop="pickCell(t)" />
    <!-- 棋子 -->
    <g v-for="(p, side) in pawns" :key="`p${side}`" class="pawn" :style="{ transform: `translate(${cx(p)}px, ${cy(p)}px)` }">
      <circle cx="0.5" cy="0.7" r="3.2" fill="var(--color-ink)" />
      <circle r="3.2" :class="side === 0 ? 'p0' : 'p1'" stroke="var(--color-ink)" stroke-width="0.8" />
      <circle cx="-1" cy="-1.1" r="0.8" fill="var(--color-card)" opacity="0.7" />
    </g>
  </svg>
</template>

<style scoped>
.qb {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.qb.live {
  /* 手指在棋盤上的動作都交給遊戲（放牆要點溝） */
  touch-action: none;
}
.cell {
  fill: var(--color-card);
}
.live:not(.walling) .cell {
  cursor: pointer;
}
.walling {
  cursor: crosshair;
}
/* 終點那一列：塗上要走到那裡的人的顏色（先手朱紅、後手鈷藍） */
.cell.g0 {
  fill: color-mix(in srgb, var(--color-card) 80%, var(--color-red));
}
.cell.g1 {
  fill: color-mix(in srgb, var(--color-card) 80%, var(--color-blue));
}
.cell.from {
  fill: color-mix(in srgb, var(--color-card) 70%, var(--color-yellow));
}
.cell.hint {
  fill: color-mix(in srgb, var(--color-card) 45%, var(--color-yellow));
  animation: breathe 1.6s ease-in-out infinite;
}
.wall {
  fill: var(--color-yellow);
  stroke: var(--color-ink);
  stroke-width: 0.45;
  transform-box: fill-box;
  transform-origin: center;
}
.wall.fresh {
  animation: drop 360ms var(--ease-back) both;
}
@keyframes drop {
  from {
    transform: scale(1.35);
    opacity: 0;
  }
}
.wall-leave-active {
  transition:
    transform 260ms var(--ease-out),
    opacity 260ms;
}
.wall-leave-to {
  transform: scale(1.3);
  opacity: 0;
}
.wall-pv {
  fill: rgb(255 210 0 / 0.55);
  stroke: var(--color-ink);
  stroke-width: 0.35;
  stroke-dasharray: 1 0.6;
  pointer-events: none;
}
.wall-pv.bad {
  fill: rgb(230 60 40 / 0.4);
}
.wall-hint {
  fill: rgb(255 210 0 / 0.5);
  stroke: var(--color-ink);
  stroke-width: 0.35;
  pointer-events: none;
  animation: breathe 1.6s ease-in-out infinite;
  transform-box: fill-box;
  transform-origin: center;
}
.dot {
  fill: var(--color-yellow);
  stroke: var(--color-ink);
  stroke-width: 0.4;
  cursor: pointer;
}
.ghost {
  opacity: 0.45;
  pointer-events: none;
  animation: breathe 1.6s ease-in-out infinite;
}
.pawn {
  pointer-events: none;
  transition: transform 300ms var(--ease-out);
}
.p0 {
  fill: var(--color-red);
}
.p1 {
  fill: var(--color-blue);
}
@keyframes breathe {
  50% {
    opacity: 0.6;
  }
}
@media (prefers-reduced-motion: reduce) {
  .pawn {
    transition: none;
  }
  .wall.fresh,
  .cell.hint,
  .wall-hint {
    animation: none;
  }
}
</style>
