<script setup lang="ts">
// 西洋棋棋子（以及象棋「圖示」模式用的圖案）：平面剪影＋墨黑框，畫在 40×40 的格子裡。
//   K 王、Q 后、R 車、B 象、N 馬、P 兵；象棋另外有 C 炮、A 仕（盾牌）
// 用法：<PieceIcon kind="N" :light="true" :x :y :size /> 會畫在 (x, y) 為中心、寬 size 的位置。
import { computed } from 'vue'

const props = withDefaults(defineProps<{ kind: string; light?: boolean; x?: number; y?: number; size?: number; color?: string }>(), {
  light: true,
  x: 20,
  y: 20,
  size: 40,
  color: '',
})

const fill = computed(() => props.color || (props.light ? 'var(--color-card)' : 'var(--color-ink)'))
const line = computed(() => (props.light || props.color ? 'var(--color-ink)' : 'var(--color-card)'))
const k = computed(() => props.kind.toUpperCase())
const base = 'M9 31.5h22a1.5 1.5 0 0 1 1.5 1.5v2.5h-25V33a1.5 1.5 0 0 1 1.5-1.5z'
</script>

<template>
  <g :transform="`translate(${x - size / 2} ${y - size / 2}) scale(${size / 40})`" stroke-linejoin="round" stroke-linecap="round">
    <g :fill="fill" stroke="var(--color-ink)" stroke-width="1.8">
      <!-- 兵 -->
      <template v-if="k === 'P'">
        <circle cx="20" cy="12" r="5" />
        <path d="M14.5 31c0-6 2.5-9.5 5.5-12.5 3 3 5.5 6.5 5.5 12.5z" />
        <path :d="base" />
      </template>
      <!-- 車 -->
      <template v-else-if="k === 'R'">
        <path d="M11 7h4v3.5h3.2V7h3.6v3.5H25V7h4v7l-2.5 2.5v13h-13v-13L11 14z" />
        <path :d="base" />
      </template>
      <!-- 馬 -->
      <template v-else-if="k === 'N'">
        <path d="M13 31.5c0-5 3.5-7.5 5-11-2.5.5-4.5 2-6 3.2L9.5 21c1-5 4.5-9.5 8.5-11.5L19 6l2.5 3.5c4.5 1 8 5.5 8 11.5 0 4-1 7-1.5 10.5z" />
        <circle cx="16" cy="13.8" r="1.2" :fill="line" stroke="none" />
        <path :d="base" />
      </template>
      <!-- 象 -->
      <template v-else-if="k === 'B'">
        <circle cx="20" cy="6.5" r="2.4" />
        <path d="M20 9c4.5 3.5 7 7.5 7 11.5 0 4-2.5 6-4 7l1.5 4h-9l1.5-4c-1.5-1-4-3-4-7 0-4 2.5-8 7-11.5z" />
        <path d="M22.5 14.5l-4.5 5" :stroke="line" />
        <path :d="base" />
      </template>
      <!-- 后 -->
      <template v-else-if="k === 'Q'">
        <path d="M10 29.5L7.5 12l6 7.5L16.5 8l3.5 10 3.5-10 3 11.5 6-7.5-2.5 17.5z" />
        <circle cx="7.5" cy="11" r="1.8" />
        <circle cx="16.5" cy="7" r="1.8" />
        <circle cx="23.5" cy="7" r="1.8" />
        <circle cx="32.5" cy="11" r="1.8" />
        <path :d="base" />
      </template>
      <!-- 王 -->
      <template v-else-if="k === 'K'">
        <path d="M18.5 3.5h3v3h3v3h-3v3h-3v-3h-3v-3h3z" />
        <path d="M20 13c6.5 0 10 3 10 7 0 3.5-2.5 6-4 11.5H14c-1.5-5.5-4-8-4-11.5 0-4 3.5-7 10-7z" />
        <path :d="base" />
      </template>
      <!-- 炮（象棋） -->
      <template v-else-if="k === 'C'">
        <path d="M7 21.5l20-8.5 2.5 5.5-19 9z" />
        <circle cx="15" cy="26" r="5.5" />
        <circle cx="15" cy="26" r="1.6" :fill="line" stroke="none" />
        <path :d="base" />
      </template>
      <!-- 仕（象棋）：盾牌 -->
      <template v-else-if="k === 'A'">
        <path d="M20 5l10 3.5v8c0 7-4.5 11.5-10 14-5.5-2.5-10-7-10-14v-8z" />
        <path d="M20 10v15M14 15.5h12" :stroke="line" />
      </template>
    </g>
  </g>
</template>
