<script setup lang="ts">
// 西洋棋與象棋共用的棋盤：
//   西洋棋：8 × 8 格子，棋子放在格子中間；米白與亮黃相間。
//   象棋：9 × 10 交叉點，中間楚河漢界、兩邊九宮畫斜線；棋子是圓形木子寫中文字（或圖示）。
// 只負責畫：選起的棋子、能走的位置（圓點）、上一步、被將軍的王、教學提示、滑鼠預覽的半透明棋子；
// 點了哪裡回報給上層。走子動畫：上一步走過去的棋子從原位滑過來、落地壓扁一下。
import { computed } from 'vue'
import { S } from '@/data/strings'
import PieceIcon from '@/ui/art/PieceIcon.vue'

const props = withDefaults(
  defineProps<{
    kind: 'chess' | 'xiangqi'
    board: readonly string[]
    /** 玩家拿黑方時把棋盤轉 180 度，自己永遠在下面 */
    flip?: boolean
    selected?: number
    targets?: readonly number[]
    lastMove?: { from: number; to: number } | null
    /** 被將軍的王（將帥）在哪一格 */
    checkSq?: number
    /** 教學：要亮起來的位置 */
    hints?: readonly number[]
    /** 滑鼠預覽：在某一格畫一顆半透明的棋子 */
    ghost?: { index: number; piece: string } | null
    pieceStyle?: 'text' | 'icon'
    interactive?: boolean
    /** 換了一個數字就重播走子動畫（同一步不重播） */
    moveKey?: number
  }>(),
  { flip: false, selected: -1, targets: () => [], lastMove: null, checkSq: -1, hints: () => [], ghost: null, pieceStyle: 'text', interactive: true, moveKey: 0 },
)
const emit = defineEmits<{ pick: [index: number]; hover: [index: number] }>()

const chess = computed(() => props.kind === 'chess')
const COLS = computed(() => (chess.value ? 8 : 9))
const ROWS = computed(() => (chess.value ? 8 : 10))
const CELL = 10
const PAD = computed(() => (chess.value ? 5 : 7))
const W = computed(() => (chess.value ? COLS.value * CELL : (COLS.value - 1) * CELL) + PAD.value * 2)
const H = computed(() => (chess.value ? ROWS.value * CELL : (ROWS.value - 1) * CELL) + PAD.value * 2)

/** 畫面上的行、列（翻轉後） */
const vr = (i: number) => {
  const r = Math.floor(i / COLS.value)
  return props.flip ? ROWS.value - 1 - r : r
}
const vc = (i: number) => {
  const c = i % COLS.value
  return props.flip ? COLS.value - 1 - c : c
}
const px = (i: number) => PAD.value + vc(i) * CELL + (chess.value ? CELL / 2 : 0)
const py = (i: number) => PAD.value + vr(i) * CELL + (chess.value ? CELL / 2 : 0)

const pieces = computed(() => props.board.map((p, i) => ({ p, i })).filter((x) => x.p))
const isUpper = (p: string) => p === p.toUpperCase()
const lastTo = computed(() => props.lastMove?.to ?? -1)
const moveFrom = computed(() => {
  const m = props.lastMove
  if (!m) return { dx: 0, dy: 0 }
  return { dx: px(m.from) - px(m.to), dy: py(m.from) - py(m.to) }
})

const xqName = (p: string) => S.xiangqi.names[isUpper(p) ? 'r' : 'b'][p.toUpperCase() as 'K']

function pointAt(e: MouseEvent): number {
  const rect = (e.currentTarget as SVGElement).getBoundingClientRect()
  const x = ((e.clientX - rect.left) / rect.width) * W.value - PAD.value
  const y = ((e.clientY - rect.top) / rect.height) * H.value - PAD.value
  let c = chess.value ? Math.floor(x / CELL) : Math.round(x / CELL)
  let r = chess.value ? Math.floor(y / CELL) : Math.round(y / CELL)
  if (c < 0 || r < 0 || c >= COLS.value || r >= ROWS.value) return -1
  if (props.flip) {
    c = COLS.value - 1 - c
    r = ROWS.value - 1 - r
  }
  return r * COLS.value + c
}
function onClick(e: MouseEvent) {
  if (!props.interactive) return
  const i = pointAt(e)
  if (i >= 0) emit('pick', i)
}
function onMove(e: PointerEvent) {
  emit('hover', e.pointerType === 'mouse' ? pointAt(e) : -1)
}

const files = 'abcdefgh'
const lightSq = (r: number, c: number) => (r + c) % 2 === 0
</script>

<template>
  <svg class="board" :class="{ interactive }" :viewBox="`0 0 ${W} ${H}`" @click="onClick" @pointermove="onMove" @pointerleave="emit('hover', -1)">
    <!-- 底板：黑色實心陰影＋黑框 -->
    <rect x="1.7" y="2.1" :width="W - 1" :height="H - 1" fill="var(--color-ink)" />
    <rect x="0.5" y="0.5" :width="W - 1.6" :height="H - 1.6" :fill="chess ? 'var(--color-card)' : 'var(--color-yellow)'" stroke="var(--color-ink)" stroke-width="0.9" />

    <!-- 西洋棋：格子與座標 -->
    <template v-if="chess">
      <template v-for="r in 8" :key="`r${r}`">
        <rect v-for="c in 8" :key="`c${c}`" :x="PAD + (c - 1) * CELL" :y="PAD + (r - 1) * CELL" :width="CELL" :height="CELL" :fill="lightSq(r - 1, c - 1) ? 'var(--color-card)' : 'var(--color-yellow)'" />
      </template>
      <rect :x="PAD" :y="PAD" :width="CELL * 8" :height="CELL * 8" fill="none" stroke="var(--color-ink)" stroke-width="0.6" />
      <text v-for="c in 8" :key="`f${c}`" :x="PAD + (c - 0.5) * CELL" :y="H - 1.6" class="coord">{{ files[flip ? 8 - c : c - 1] }}</text>
      <text v-for="r in 8" :key="`n${r}`" :x="2.4" :y="PAD + (r - 0.5) * CELL + 1" class="coord">{{ flip ? r : 9 - r }}</text>
    </template>

    <!-- 象棋：格線、楚河漢界、九宮 -->
    <template v-else>
      <g stroke="var(--color-ink)" stroke-width="0.4">
        <line v-for="r in 10" :key="`h${r}`" :x1="PAD" :x2="PAD + 80" :y1="PAD + (r - 1) * CELL" :y2="PAD + (r - 1) * CELL" />
        <template v-for="c in 9" :key="`v${c}`">
          <line v-if="c === 1 || c === 9" :x1="PAD + (c - 1) * CELL" :x2="PAD + (c - 1) * CELL" :y1="PAD" :y2="PAD + 90" />
          <template v-else>
            <line :x1="PAD + (c - 1) * CELL" :x2="PAD + (c - 1) * CELL" :y1="PAD" :y2="PAD + 40" />
            <line :x1="PAD + (c - 1) * CELL" :x2="PAD + (c - 1) * CELL" :y1="PAD + 50" :y2="PAD + 90" />
          </template>
        </template>
        <path :d="`M${PAD + 30} ${PAD}l20 20M${PAD + 50} ${PAD}l-20 20M${PAD + 30} ${PAD + 70}l20 20M${PAD + 50} ${PAD + 70}l-20 20`" />
      </g>
      <rect :x="PAD" :y="PAD" width="80" height="90" fill="none" stroke="var(--color-ink)" stroke-width="0.8" />
      <text :x="PAD + 20" :y="PAD + 46.6" class="river">{{ S.xiangqi.river[flip ? 1 : 0] }}</text>
      <text :x="PAD + 60" :y="PAD + 46.6" class="river">{{ S.xiangqi.river[flip ? 0 : 1] }}</text>
    </template>

    <!-- 上一步：起點與終點淡淡標出 -->
    <template v-if="lastMove">
      <rect v-for="i in [lastMove.from, lastMove.to]" :key="`lm${i}`" :x="px(i) - 4.6" :y="py(i) - 4.6" width="9.2" height="9.2" rx="1" class="last" />
    </template>
    <!-- 教學提示、選起的子、被將軍 -->
    <circle v-for="h in hints" :key="`h${h}`" :cx="px(h)" :cy="py(h)" r="4.9" class="hint" />
    <rect v-if="selected >= 0" :x="px(selected) - 4.8" :y="py(selected) - 4.8" width="9.6" height="9.6" rx="1.2" class="sel" />
    <circle v-if="checkSq >= 0" :cx="px(checkSq)" :cy="py(checkSq)" r="4.8" class="check" />

    <!-- 棋子 -->
    <g v-for="{ p, i } in pieces" :key="i === lastTo ? `${i}-${moveKey}` : `${i}`" class="piece" :class="{ moved: i === lastTo }" :style="i === lastTo ? { '--dx': `${moveFrom.dx}px`, '--dy': `${moveFrom.dy}px` } : undefined">
      <PieceIcon v-if="chess" :kind="p" :light="isUpper(p)" :x="px(i)" :y="py(i) + 0.2" :size="9.2" />
      <template v-else>
        <circle :cx="px(i) + 0.5" :cy="py(i) + 0.6" r="4.4" fill="var(--color-ink)" />
        <circle :cx="px(i)" :cy="py(i)" r="4.4" fill="var(--color-card)" stroke="var(--color-ink)" stroke-width="0.6" />
        <circle :cx="px(i)" :cy="py(i)" r="3.5" fill="none" :stroke="isUpper(p) ? 'var(--color-red)' : 'var(--color-ink)'" stroke-width="0.35" />
        <text v-if="pieceStyle === 'text'" :x="px(i)" :y="py(i) + 1.75" class="xq" :fill="isUpper(p) ? 'var(--color-red)' : 'var(--color-ink)'">{{ xqName(p) }}</text>
        <PieceIcon v-else :kind="p" :color="isUpper(p) ? 'var(--color-red)' : 'var(--color-ink)'" :x="px(i)" :y="py(i) + 0.1" :size="5.6" />
      </template>
    </g>

    <!-- 滑鼠預覽：半透明的棋子 -->
    <g v-if="ghost && ghost.index >= 0" class="ghost">
      <PieceIcon v-if="chess" :kind="ghost.piece" :light="isUpper(ghost.piece)" :x="px(ghost.index)" :y="py(ghost.index) + 0.2" :size="9.2" />
      <template v-else>
        <circle :cx="px(ghost.index)" :cy="py(ghost.index)" r="4.4" fill="var(--color-card)" stroke="var(--color-ink)" stroke-width="0.6" />
        <text v-if="pieceStyle === 'text'" :x="px(ghost.index)" :y="py(ghost.index) + 1.75" class="xq" :fill="isUpper(ghost.piece) ? 'var(--color-red)' : 'var(--color-ink)'">{{ xqName(ghost.piece) }}</text>
        <PieceIcon v-else :kind="ghost.piece" :color="isUpper(ghost.piece) ? 'var(--color-red)' : 'var(--color-ink)'" :x="px(ghost.index)" :y="py(ghost.index) + 0.1" :size="5.6" />
      </template>
    </g>

    <!-- 能走的位置：空格是小圓點，能吃子是圓圈 -->
    <template v-for="t in targets" :key="`t${t}`">
      <circle v-if="!board[t]" :cx="px(t)" :cy="py(t)" r="1.5" class="dot" />
      <circle v-else :cx="px(t)" :cy="py(t)" r="4.9" class="ring" />
    </template>
  </svg>
</template>

<style scoped>
.board {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
  touch-action: manipulation;
}
.board.interactive {
  cursor: pointer;
}
.coord {
  font-size: 2.4px;
  font-weight: 900;
  fill: var(--color-ink-2);
  text-anchor: middle;
}
.river {
  font-size: 4.2px;
  font-weight: 900;
  fill: var(--color-ink);
  opacity: 0.55;
  text-anchor: middle;
  letter-spacing: 0.6px;
}
.xq {
  font-size: 5px;
  font-weight: 900;
  text-anchor: middle;
  pointer-events: none;
}
.last {
  fill: rgb(255 74 28 / 0.16);
}
.sel {
  fill: none;
  stroke: var(--color-red);
  stroke-width: 0.8;
}
.check {
  fill: rgb(255 74 28 / 0.4);
  stroke: var(--color-red);
  stroke-width: 0.6;
  animation: pulse 1s ease-in-out infinite;
  transform-box: fill-box;
  transform-origin: center;
}
@keyframes pulse {
  50% {
    transform: scale(1.12);
  }
}
.hint {
  fill: rgb(255 194 26 / 0.55);
  stroke: var(--color-ink);
  stroke-width: 0.5;
  stroke-dasharray: 1.6 1.2;
  animation: spin 3s linear infinite;
  transform-box: fill-box;
  transform-origin: center;
}
@keyframes spin {
  to {
    rotate: 360deg;
  }
}
.dot {
  fill: var(--color-ink);
  opacity: 0.45;
  pointer-events: none;
}
.ring {
  fill: none;
  stroke: var(--color-red);
  stroke-width: 0.7;
  pointer-events: none;
}
.piece {
  pointer-events: none;
}
/* 剛走過來的棋子：從原位滑過來，落地壓扁一下 */
.piece.moved {
  transform-box: fill-box;
  transform-origin: center;
  animation: slide 360ms var(--ease-out) both;
}
@keyframes slide {
  0% {
    transform: translate(var(--dx), var(--dy)) scale(1.18);
  }
  80% {
    transform: translate(0, 0) scale(1.04);
  }
  90% {
    transform: translate(0, 0) scale(1.08, 0.94);
  }
  100% {
    transform: translate(0, 0) scale(1);
  }
}
.ghost {
  opacity: 0.35;
  pointer-events: none;
}
</style>
