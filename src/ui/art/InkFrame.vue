<script setup lang="ts">
// 手繪外框：量出容器的實際大小再畫，所以線條不會被拉伸變形。
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { fillPath, hatch, inkPath, inkPoly, rectPts, type Pt } from './ink'

const props = withDefaults(
  defineProps<{ fill?: string; tone?: string; weight?: number; seed?: number; shadow?: boolean; dashed?: boolean; boil?: boolean; shade?: string }>(),
  { tone: 'var(--color-ink)', weight: 2.2, seed: 1 },
)

const el = ref<SVGSVGElement>()
const w = ref(0)
const h = ref(0)
const u = ref(1)
let observer: ResizeObserver | undefined

function measure() {
  const box = el.value?.parentElement
  if (!box) return
  w.value = box.clientWidth
  h.value = box.clientHeight
  u.value = parseFloat(getComputedStyle(document.documentElement).fontSize) / 16
}
onMounted(() => {
  measure()
  if (el.value?.parentElement) {
    observer = new ResizeObserver(measure)
    observer.observe(el.value.parentElement)
  }
})
onBeforeUnmount(() => observer?.disconnect())

const box = computed(() => rectPts(1, 1, w.value - 2, h.value - 2))

function outline(seed: number): string {
  const width = props.weight * u.value
  if (!props.dashed) return inkPoly(box.value, { width, seed })
  let d = ''
  const pts = box.value
  for (let i = 0; i < 4; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % 4]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    const n = Math.max(2, Math.round(len / (16 * u.value)))
    for (let k = 0; k < n; k++) {
      const p = (t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
      d += inkPath([p((k + 0.15) / n), p((k + 0.7) / n)], { width, seed: seed + i * 50 + k })
    }
  }
  return d
}

const ready = computed(() => w.value > 4 && h.value > 4)
const lineA = computed(() => (ready.value ? outline(props.seed) : ''))
const lineB = computed(() => (ready.value && props.boil ? outline(props.seed + 4099) : ''))
const off = computed(() => 5.5 * u.value)
const shadowD = computed(() =>
  ready.value && props.shadow
    ? hatch(
        [
          [off.value + 2, h.value - 1],
          [w.value - 1, h.value - 1],
          [w.value - 1, off.value + 2],
          [w.value + off.value, off.value + 2],
          [w.value + off.value, h.value + off.value],
          [off.value + 2, h.value + off.value],
        ],
        { spacing: 3.6 * u.value, width: 1 * u.value, seed: props.seed, angle: -0.9 },
      )
    : '',
)
// 暗面：右下角疊一片排線，色塊就不會只有一個顏色
const shadeD = computed(() =>
  ready.value && props.shade
    ? hatch(
        [
          [w.value * 0.45, h.value - 1],
          [w.value - 1, h.value * 0.25],
          [w.value - 1, h.value - 1],
        ],
        { spacing: 4.2 * u.value, width: 0.9 * u.value, seed: props.seed + 5, angle: -0.9 },
      )
    : '',
)
</script>

<template>
  <svg ref="el" class="ink-frame" :viewBox="`0 0 ${Math.max(1, w)} ${Math.max(1, h)}`" aria-hidden="true">
    <template v-if="ready">
      <path v-if="shadowD" :d="shadowD" fill="var(--color-near)" opacity=".7" />
      <path v-if="fill" :d="fillPath(box)" :fill="fill" />
      <path v-if="shadeD" :d="shadeD" :fill="shade" opacity=".75" />
      <path :d="lineA" :fill="tone" :class="lineB ? 'boil-a' : undefined" />
      <path v-if="lineB" :d="lineB" :fill="tone" class="boil-b" />
    </template>
  </svg>
</template>

<style scoped>
.ink-frame {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
}
</style>
