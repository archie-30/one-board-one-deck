<script setup lang="ts">
// 把一串繪圖資料畫成 SVG。
// 線條預先畫好三種描法，輪流顯示（約每秒 10 次），像 INKRAGE 一樣有手繪動畫的「呼吸」感；
// 平塗的色塊不變。同一種描法的線條收在同一個群組，瀏覽器只需要切換三個群組。
import { computed } from 'vue'
import { draw, type Prim } from './ink'

const props = defineProps<{ prims: Prim[]; seed?: number; still?: boolean }>()
const base = computed(() => props.seed ?? 0)
const v0 = computed(() => draw(props.prims, base.value))
const fills = computed(() => v0.value.filter((s) => !s.line))
const lines = computed(() => {
  const sets = [v0.value]
  if (!props.still) sets.push(draw(props.prims, base.value + 4099), draw(props.prims, base.value + 8191))
  return sets.map((set) => {
    // 依原本順序保留「平塗在線條後面還是前面」：線條各自插回去
    return set.map((s, i) => ({ ...s, i })).filter((s) => s.line)
  })
})
// 平塗與線條交錯時要保持前後順序：把繪圖資料切成連續的段落
const layers = computed(() => {
  const out: { kind: 'fill' | 'line'; from: number; to: number }[] = []
  v0.value.forEach((s, i) => {
    const kind = s.line ? 'line' : 'fill'
    const last = out[out.length - 1]
    if (last && last.kind === kind) last.to = i + 1
    else out.push({ kind, from: i, to: i + 1 })
  })
  return out
})
void fills
</script>

<template>
  <g>
    <template v-for="(layer, li) in layers" :key="li">
      <template v-if="layer.kind === 'fill'">
        <path v-for="i in layer.to - layer.from" :key="i" :d="v0[layer.from + i - 1].d" :fill="v0[layer.from + i - 1].fill" :opacity="v0[layer.from + i - 1].opacity" />
      </template>
      <template v-else>
        <g v-for="(set, vi) in lines" :key="vi" :class="lines.length > 1 ? `bv${vi}` : undefined">
          <path
            v-for="s in set.filter((x) => x.i >= layer.from && x.i < layer.to)"
            :key="s.i"
            :d="s.d"
            :fill="s.fill"
            :opacity="s.opacity"
          />
        </g>
      </template>
    </template>
  </g>
</template>
