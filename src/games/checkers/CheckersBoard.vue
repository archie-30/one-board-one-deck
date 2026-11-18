<script setup lang="ts">
// 西洋跳棋棋盤：8 × 8，淺色格米白、深色格鈷藍（棋子只在深色格）。先手黑子、後手紅子，王的子上有一頂小皇冠。
// 動畫：走一步時棋子沿著路線一格一格跳過去（連吃就連跳），被吃的子在原地縮小消失；
//       悔棋時倒著播（棋子沿原路跳回去、被吃的子冒回來）。
// 純畫面：點哪一格就往外丟 pick(格子)，規則與輪到誰由外面決定。
import { computed, nextTick, ref, watch } from 'vue'
import { reducedMotion } from '@/core/motion'
import { colOf, isDark, isKing, ownerOf, rowOf, type Cell } from '@/engine/checkers/rules'

const props = defineProps<{
  board: readonly Cell[]
  /** 玩家拿後手時把棋盤轉 180 度，自己永遠在下面 */
  flip?: boolean
  selected?: number
  targets?: readonly number[]
  /** 上一步（路線、被吃的子：位置與原本是什麼子） */
  last?: { path: number[]; captured: { i: number; c: Cell }[] } | null
  /** 換一個數字就播一次走子動畫 */
  moveKey?: number
  /** 悔棋倒帶：這幾步倒著播（先播最後一步） */
  rewind?: { key: number; steps: { path: number[]; captured: { i: number; c: Cell }[] }[] } | null
  interactive?: boolean
  /** 教學：要亮起來的格子 */
  hints?: readonly number[]
  /** 哪些子可以按住拖（沒給就不能拖） */
  canDrag?: ((i: number) => boolean) | null
}>()
const emit = defineEmits<{ pick: [i: number]; grab: [i: number]; drop: [from: number, to: number] }>()

// ── 拖曳：按住自己的子拖到目標格放開（手指移動 6px 以上才算拖，不然照樣是點） ──
const drag = ref<{ from: number; id: number; x0: number; y0: number; dx: number; dy: number; moved: boolean } | null>(null)
/** 剛拖完放開：吃掉接著來的那一下 click，免得又被當成點一下 */
let swallow = false
function down(i: number | false, e: PointerEvent) {
  if (i === false || !props.interactive || !props.canDrag?.(i) || (e.pointerType === 'mouse' && e.button !== 0)) return
  drag.value = { from: i, id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, moved: false }
}
function move(e: PointerEvent) {
  const d = drag.value
  if (!d || e.pointerId !== d.id) return
  const dx = e.clientX - d.x0
  const dy = e.clientY - d.y0
  if (!d.moved && Math.hypot(dx, dy) < 6) return
  if (!d.moved) {
    root.value?.setPointerCapture(e.pointerId)
    emit('grab', d.from)
  }
  drag.value = { ...d, dx, dy, moved: true }
}
function up(e: PointerEvent) {
  const d = drag.value
  if (!d || e.pointerId !== d.id) return
  drag.value = null
  if (!d.moved) return
  swallow = true
  window.setTimeout(() => (swallow = false), 0)
  const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-i]')
  const to = el ? Number(el.dataset.i) : -1
  if (to >= 0 && to !== d.from) emit('drop', d.from, to)
}
function click(i: number | false) {
  if (i !== false && !swallow) emit('pick', i)
}
const dragStyle = (i: number) => {
  const d = drag.value
  return d?.moved && d.from === i ? { transform: `translate(${d.dx}px, ${d.dy}px) scale(1.12)` } : undefined
}

const root = ref<HTMLElement>()
/** 畫面上的第幾列、第幾行（翻轉時倒過來） */
const view = (i: number) => (props.flip ? 63 - i : i)
const cells = computed(() => Array.from({ length: 64 }, (_, k) => props.board[view(k)] !== undefined && view(k)))
const hover = ref(-1)
/** 被吃掉、正在消失的子（只留一下下做動畫） */
const fading = ref<{ i: number; c: Cell; key: string }[]>([])
const popping = ref<number[]>([])

/** 從 a 格到 b 格要位移多少（百分比，以一格為 100%） */
function delta(a: number, b: number) {
  const s = props.flip ? -1 : 1
  return [(colOf(a) - colOf(b)) * 100 * s, (rowOf(a) - rowOf(b)) * 100 * s]
}
/** 沿著路線跳：每一段起跳、落下（稍微放大像拿起來） */
function hopFrames(path: number[]) {
  const end = path[path.length - 1]
  const frames: Keyframe[] = []
  const n = path.length - 1
  path.forEach((p, k) => {
    const [dx, dy] = delta(p, end)
    const t = n ? k / n : 1
    frames.push({ transform: `translate(${dx}%, ${dy}%) scale(${k === 0 || k === n ? 1 : 1.12})`, offset: t })
    if (k < n) {
      const [nx, ny] = delta(path[k + 1], end)
      frames.push({ transform: `translate(${(dx + nx) / 2}%, ${(dy + ny) / 2}%) scale(1.22)`, offset: (k + 0.5) / n })
    }
  })
  return frames
}
const pieceEl = (i: number) => root.value?.querySelector<HTMLElement>(`[data-i="${i}"] .pc`)

let skipKey = NaN
watch(
  () => props.rewind?.key,
  async () => {
    const r = props.rewind
    if (!r) return
    skipKey = props.moveKey ?? NaN
    if (reducedMotion()) return
    await nextTick()
    const pops: number[] = []
    for (const st of r.steps) {
      const back = st.path.slice().reverse()
      pieceEl(st.path[0])?.animate(hopFrames(back).map((f) => ({ ...f, transform: (f.transform as string) })), { duration: 220 + back.length * 140, easing: 'cubic-bezier(.22,1,.36,1)' })
      pops.push(...st.captured.map((x) => x.i))
    }
    popping.value = pops
    window.setTimeout(() => (popping.value = []), 600)
  },
)
// hopFrames 算的是「從終點看起點的位移」；倒帶時終點是 path[0]
watch(
  () => props.moveKey,
  async () => {
    if (props.moveKey === skipKey) return
    const m = props.last
    if (!m || reducedMotion()) return
    // 被吃的子：原地留一下、縮小消失
    fading.value = m.captured.map((x) => ({ ...x, key: `${props.moveKey}-${x.i}` }))
    window.setTimeout(() => (fading.value = []), 420 + m.path.length * 140)
    await nextTick()
    pieceEl(m.path[m.path.length - 1])?.animate(hopFrames(m.path), { duration: 220 + m.path.length * 140, easing: 'cubic-bezier(.22,1,.36,1)' })
  },
)
const fadeAt = (i: number) => fading.value.find((x) => x.i === i)
const colorClass = (c: Cell) => (ownerOf(c) === 0 ? 'dark' : 'red')
</script>

<template>
  <div ref="root" class="ck" :class="{ live: interactive && !!canDrag }" @pointerleave="hover = -1" @pointermove="move" @pointerup="up" @pointercancel="drag = null">
    <button
      v-for="(i, k) in cells"
      :key="k"
      :data-i="i === false ? -1 : i"
      class="cell"
      :class="{
        dk: i !== false && isDark(i),
        sel: i === selected,
        tgt: i !== false && targets?.includes(i),
        last: i !== false && last && last.path.includes(i),
        hint: i !== false && hints?.includes(i),
        live: interactive,
      }"
      @click="click(i)"
      @pointerdown="(e) => down(i, e)"
      @pointerenter="(e) => e.pointerType === 'mouse' && i !== false && (hover = i)"
    >
      <template v-if="i !== false">
        <span v-if="board[i]" :key="`${i}-${board[i]}`" class="pc" :class="[colorClass(board[i]), { pop: popping.includes(i), dragging: drag?.moved && drag.from === i }]" :style="dragStyle(i)">
          <svg viewBox="0 0 40 40" aria-hidden="true">
            <circle cx="21.2" cy="21.6" r="16" fill="var(--color-ink)" />
            <circle cx="20" cy="20" r="16" class="disc" stroke="var(--color-ink)" stroke-width="2.2" />
            <circle cx="20" cy="20" r="11.5" fill="none" class="ring" stroke-width="1.3" />
            <!-- 王：小皇冠 -->
            <path v-if="isKing(board[i])" d="M12.5 24 L13.5 15.5 L17 19.5 L20 13.5 L23 19.5 L26.5 15.5 L27.5 24 Z" class="crown" />
          </svg>
        </span>
        <!-- 被吃掉的子：縮小消失 -->
        <span v-if="fadeAt(i)" :key="fadeAt(i)!.key" class="pc out" :class="colorClass(fadeAt(i)!.c)">
          <svg viewBox="0 0 40 40" aria-hidden="true">
            <circle cx="20" cy="20" r="16" class="disc" stroke="var(--color-ink)" stroke-width="2.2" />
            <circle cx="20" cy="20" r="11.5" fill="none" class="ring" stroke-width="1.3" />
          </svg>
        </span>
        <span v-if="targets?.includes(i)" class="dot" :class="{ on: hover === i }" />
      </template>
    </button>
  </div>
</template>

<style scoped>
.ck {
  display: grid;
  width: 100%;
  height: 100%;
  grid-template-columns: repeat(8, 1fr);
  grid-template-rows: repeat(8, 1fr);
  border: 0.18rem solid var(--color-ink);
  background: var(--color-card);
  box-shadow: 0.35rem 0.35rem 0 var(--color-ink);
}
.cell {
  position: relative;
  display: grid;
  place-items: center;
  padding: 0;
  background: none;
}
.cell.dk {
  background: var(--color-blue);
}
.cell.dk.last {
  background: color-mix(in srgb, var(--color-blue) 72%, var(--color-yellow));
}
.cell.live.dk {
  cursor: pointer;
}
/* 能拖的時候：手指在棋盤上的動作都交給遊戲（不然一拖就被瀏覽器當成滑畫面） */
.ck.live {
  touch-action: none;
}
/* 拖著的子：跟著手指、稍微放大、浮在最上面，也不擋住底下的格子（放開時才找得到落在哪一格） */
.pc.dragging {
  z-index: 20;
  pointer-events: none;
}
.pc {
  position: absolute;
  inset: 7%;
  z-index: 2;
}
.pc svg {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.pc.dark .disc {
  fill: var(--color-ink);
}
.pc.dark .ring {
  stroke: rgb(251 248 241 / 0.55);
}
.pc.red .disc {
  fill: var(--color-red);
}
.pc.red .ring {
  stroke: rgb(251 248 241 / 0.6);
}
.crown {
  fill: var(--color-yellow);
  stroke: var(--color-ink);
  stroke-width: 1.2;
  stroke-linejoin: round;
}
.pc.out {
  z-index: 1;
  animation: gone 420ms ease-in both;
}
@keyframes gone {
  to {
    transform: scale(0.2);
    opacity: 0;
  }
}
.pc.pop {
  animation: back-in 360ms var(--ease-back) both;
}
@keyframes back-in {
  from {
    transform: scale(0.2);
    opacity: 0;
  }
}
/* 選起來：紅框縮進來再輕輕呼吸，棋子本身不動 */
.cell.sel::after {
  content: '';
  position: absolute;
  inset: 6%;
  z-index: 3;
  border: 0.16rem solid var(--color-red);
  border-radius: 50%;
  animation: sel-in 260ms var(--ease-out) both, breathe 1.6s ease-in-out 260ms infinite;
  pointer-events: none;
}
@keyframes sel-in {
  from {
    transform: scale(1.35);
    opacity: 0;
  }
}
@keyframes breathe {
  50% {
    transform: scale(0.94);
  }
}
.dot {
  position: absolute;
  z-index: 3;
  width: 26%;
  height: 26%;
  border-radius: 50%;
  background: var(--color-yellow);
  box-shadow: 0 0 0 0.12rem var(--color-ink);
  pointer-events: none;
  transition: transform 160ms var(--ease-out);
}
/* 滑鼠預覽：移到能走的格子，出現一團淡影子 */
.dot.on {
  transform: scale(2.4);
  opacity: 0.55;
}
.cell.hint::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 1;
  background: rgb(255 210 0 / 0.45);
  animation: breathe 1.6s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .pc.out,
  .pc.pop,
  .cell.sel::after,
  .cell.hint::before {
    animation: none;
  }
}
</style>
