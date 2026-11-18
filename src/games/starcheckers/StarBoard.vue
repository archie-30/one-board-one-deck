<script setup lang="ts">
// 星形跳棋棋盤：六角星 121 個洞，六個角都塗上顏色（出發的角是那個人的顏色、目的地的角是要去那裡的人的顏色）。彈珠：藍、紅、黃。
// view：從哪個座位看（整張棋盤轉到那個人在下面）。
// 動畫：走一步時彈珠沿著路線一格一格跳過去（連跳就連著跳）；悔棋、取消移動時倒著跳回去。
//   anim：外面指定要播的路線（一步一步跳時每跳一格播一次）；slow：電腦走的，跳慢一點讓人看清楚。
// 操作：點彈珠、點能去的地方就往外丟 pick(格子)；也可以按住自己的彈珠拖到能去的地方放開（drop），放在別處就回原位。
// 規則與輪到誰由外面決定。
import { pathMs, segLens } from './hop'
import { computed, nextTick, ref, watch } from 'vue'
import { reducedMotion } from '@/core/motion'
import { CELLS, CORNER_CELLS, HOMES, targetOf } from '@/engine/starcheckers/rules'

const props = defineProps<{
  board: readonly number[]
  /** 從哪個座位看（那個人的角轉到下面） */
  view?: number
  selected?: number
  targets?: readonly number[]
  /** 上一步的路線 */
  last?: number[] | null
  /** 換一個數字就播一次走子動畫 */
  moveKey?: number
  /** 悔棋倒帶：這幾步倒著播（先播最後一步） */
  rewind?: { key: number; paths: number[][] } | null
  interactive?: boolean
  /** 教學：要亮起來的洞 */
  hints?: readonly number[]
  /** 要播的一段跳的動畫（key 換了就播；slow：電腦走的，慢一點） */
  anim?: { key: number; path: number[]; slow?: boolean } | null
  /** 這一格的彈珠能不能拖 */
  canDrag?: ((i: number) => boolean) | null
}>()
const emit = defineEmits<{ pick: [i: number]; drop: [from: number, to: number] }>()

const R = 10
const px = (i: number) => {
  const h = CELLS[i]
  return { x: Math.sqrt(3) * (h.q + h.r / 2) * R, y: 1.5 * h.r * R }
}
const pos = CELLS.map((_, i) => px(i))
/** 座位的顏色 */
const COLORS = ['var(--color-blue)', 'var(--color-red)', 'var(--color-yellow)']
const cornerOf = new Map<number, number>()
HOMES.forEach((c, seat) => CORNER_CELLS[c].forEach((i) => cornerOf.set(i, seat)))
const targetOfCell = new Map<number, number>()
for (let seat = 0; seat < 3; seat++) CORNER_CELLS[targetOf(seat)].forEach((i) => targetOfCell.set(i, seat))
const rot = computed(() => -120 * (props.view ?? 0))
const hover = ref(-1)
const root = ref<SVGSVGElement>()

/** 沿著路線跳：位移是「從終點看」；每一段的時間照距離分，整條路線同一個速度 */
function hopFrames(path: number[]) {
  const end = pos[path[path.length - 1]]
  const n = path.length - 1
  const lens = segLens(path)
  const total = lens.reduce((a, b) => a + b, 0) || 1
  const frames: Keyframe[] = []
  let at = 0
  path.forEach((p, k) => {
    const d = pos[p]
    frames.push({ transform: `translate(${d.x - end.x}px, ${d.y - end.y}px) scale(${k === 0 || k === n ? 1 : 1.15})`, offset: n ? at / total : 1 })
    if (k < n) {
      const e = pos[path[k + 1]]
      frames.push({ transform: `translate(${(d.x + e.x) / 2 - end.x}px, ${(d.y + e.y) / 2 - end.y}px) scale(1.3)`, offset: (at + lens[k] / 2) / total })
      at += lens[k]
    }
  })
  return frames
}
const marbleEl = (i: number) => root.value?.querySelector<SVGGElement>(`[data-m="${i}"]`)
watch(
  () => props.anim?.key,
  async () => {
    const a = props.anim
    if (!a || a.path.length < 2 || reducedMotion()) return
    skipKey = props.moveKey ?? NaN
    await nextTick()
    marbleEl(a.path[a.path.length - 1])?.animate(hopFrames(a.path), { duration: pathMs(a.path, a.slow), easing: 'linear' })
  },
)

// ── 拖曳 ──
const layer = ref<SVGGElement>()
/** 拖著的彈珠：從哪一格、現在在哪（棋盤座標）、顏色 */
const drag = ref<{ from: number; x: number; y: number; v: number; moved: boolean } | null>(null)
function toBoard(e: PointerEvent) {
  const g = layer.value
  const m = g?.getScreenCTM()
  if (!g || !m) return { x: 0, y: 0 }
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
  return { x: p.x, y: p.y }
}
function down(i: number, e: PointerEvent) {
  emit('pick', i)
  if (!props.interactive || !props.canDrag?.(i)) return
  const p = toBoard(e)
  drag.value = { from: i, x: p.x, y: p.y, v: props.board[i], moved: false }
  ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
}
function move(e: PointerEvent) {
  const d = drag.value
  if (!d) return
  const p = toBoard(e)
  if (!d.moved && Math.hypot(p.x - pos[d.from].x, p.y - pos[d.from].y) < 5) return
  drag.value = { ...d, x: p.x, y: p.y, moved: true }
}
function up() {
  const d = drag.value
  drag.value = null
  if (!d?.moved) return
  // 放在哪一格（最近的洞，要夠近）
  let best = -1
  let bd = 9
  pos.forEach((q, i) => {
    const dist = Math.hypot(q.x - d.x, q.y - d.y)
    if (dist < bd) ((bd = dist), (best = i))
  })
  if (best >= 0 && best !== d.from) emit('drop', d.from, best)
}
let skipKey = NaN
watch(
  () => props.rewind?.key,
  async () => {
    const r = props.rewind
    if (!r) return
    skipKey = props.moveKey ?? NaN
    if (reducedMotion()) return
    await nextTick()
    for (const path of r.paths) {
      const back = path.slice().reverse()
      marbleEl(path[0])?.animate(hopFrames(back), { duration: 200 + back.length * 150, easing: 'cubic-bezier(.22,1,.36,1)' })
    }
  },
)
watch(
  () => props.moveKey,
  async () => {
    if (props.moveKey === skipKey) return
    const path = props.last
    if (!path || reducedMotion()) return
    await nextTick()
    marbleEl(path[path.length - 1])?.animate(hopFrames(path), { duration: pathMs(path, true), easing: 'linear' })
  },
)
</script>

<template>
  <svg ref="root" viewBox="-118 -132 236 264" class="star" :class="{ live: interactive }" @pointerleave="hover = -1">
    <g ref="layer" :transform="`rotate(${rot})`">
      <!-- 星星底色 -->
      <g class="base">
        <circle v-for="(p, i) in pos" :key="`b${i}`" :cx="p.x" :cy="p.y" r="9.2" />
      </g>
      <!-- 角：出發的角塗座位的顏色，目的地的角塗淡一點 -->
      <g>
        <circle v-for="(p, i) in pos" :key="`c${i}`" :cx="p.x" :cy="p.y" r="8.6" class="tint" :style="{ fill: cornerOf.has(i) ? COLORS[cornerOf.get(i)!] : targetOfCell.has(i) ? COLORS[targetOfCell.get(i)!] : 'transparent', opacity: cornerOf.has(i) ? 0.34 : 0.3 }" />
      </g>
      <!-- 洞 -->
      <g>
        <g v-for="(p, i) in pos" :key="`h${i}`" class="hole" :class="{ last: last?.includes(i), hint: hints?.includes(i) }" @click="emit('pick', i)" @pointerenter="(e) => e.pointerType === 'mouse' && (hover = i)">
          <circle :cx="p.x" :cy="p.y" r="8.5" class="hit" />
          <circle :cx="p.x" :cy="p.y" r="3.2" class="pit" />
          <circle v-if="hints?.includes(i)" :cx="p.x" :cy="p.y" r="8" class="glow" />
        </g>
      </g>
      <!-- 彈珠 -->
      <g>
        <g
          v-for="(v, i) in board"
          :key="`m${i}-${v}`"
          :data-m="v ? i : -1"
          class="marble"
          :class="{ sel: selected === i, lifted: drag?.moved && drag.from === i }"
          :style="{ display: v ? undefined : 'none' }"
          @pointerdown="(e) => down(i, e)"
          @pointermove="move"
          @pointerup="up"
          @pointercancel="drag = null"
        >
          <template v-if="v">
            <circle :cx="pos[i].x + 0.9" :cy="pos[i].y + 1.1" r="7.2" fill="var(--color-ink)" />
            <circle :cx="pos[i].x" :cy="pos[i].y" r="7.2" :style="{ fill: COLORS[v - 1] }" stroke="var(--color-ink)" stroke-width="1.3" />
            <circle :cx="pos[i].x - 2.2" :cy="pos[i].y - 2.4" r="2" fill="var(--color-card)" opacity="0.75" />
          </template>
        </g>
      </g>
      <!-- 選起來的紅框、能去的地方 -->
      <circle v-if="selected !== undefined && selected >= 0" :cx="pos[selected].x" :cy="pos[selected].y" r="9.4" class="ring" />
      <g v-for="i in targets ?? []" :key="`t${i}`" @click="emit('pick', i)">
        <circle :cx="pos[i].x" :cy="pos[i].y" r="8.5" class="hit" />
        <circle :cx="pos[i].x" :cy="pos[i].y" :r="hover === i ? 6.5 : 3.6" class="dot" :class="{ on: hover === i }" />
      </g>
      <!-- 拖著的彈珠：跟著手指、稍微放大 -->
      <g v-if="drag?.moved" class="dragging">
        <circle :cx="drag.x + 1.2" :cy="drag.y + 1.6" r="8.2" fill="var(--color-ink)" opacity="0.5" />
        <circle :cx="drag.x" :cy="drag.y" r="8.2" :style="{ fill: COLORS[drag.v - 1] }" stroke="var(--color-ink)" stroke-width="1.4" />
        <circle :cx="drag.x - 2.4" :cy="drag.y - 2.6" r="2.2" fill="var(--color-card)" opacity="0.75" />
      </g>
    </g>
  </svg>
</template>

<style scoped>
.star {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.base circle {
  fill: var(--color-card);
  stroke: var(--color-ink);
  stroke-width: 2.6;
}
.tint {
  pointer-events: none;
}
.hit {
  fill: transparent;
}
.live .hole,
.live .marble {
  cursor: pointer;
}
/* 手機上 SVG 裡面的元素不吃 touch-action，要放在整個棋盤上，拖曳才不會被瀏覽器的手勢搶走 */
.star.live {
  touch-action: none;
}
.pit {
  fill: rgb(20 20 20 / 0.28);
  pointer-events: none;
}
.hole.last .pit {
  fill: var(--color-red);
  opacity: 0.6;
}
.glow {
  fill: rgb(255 210 0 / 0.55);
  stroke: var(--color-ink);
  stroke-width: 1;
  pointer-events: none;
  animation: breathe 1.6s ease-in-out infinite;
  transform-box: fill-box;
  transform-origin: center;
}
.marble {
  transform-box: fill-box;
  transform-origin: center;
  touch-action: none;
}
/* 拖起來的那顆：原位只留淡淡的影子 */
.marble.lifted {
  opacity: 0.25;
}
.dragging {
  pointer-events: none;
}
.ring {
  fill: none;
  stroke: var(--color-red);
  stroke-width: 2;
  pointer-events: none;
  transform-box: fill-box;
  transform-origin: center;
  animation: breathe 1.6s ease-in-out infinite;
}
.dot {
  fill: var(--color-yellow);
  stroke: var(--color-ink);
  stroke-width: 1.1;
  pointer-events: none;
  transition: r 160ms var(--ease-out), opacity 160ms;
}
/* 滑鼠預覽：移到能去的地方，出現一團淡影子 */
.dot.on {
  opacity: 0.6;
}
@keyframes breathe {
  50% {
    transform: scale(0.9);
  }
}
@media (prefers-reduced-motion: reduce) {
  .glow,
  .ring {
    animation: none;
  }
}
</style>
