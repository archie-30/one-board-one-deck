<script setup lang="ts">
// 棋子圖案：平面剪影＋墨黑框，畫在 40×40 的格子裡。
//   西洋棋（set="chess"）：K 王、Q 后、R 車、B 象、N 馬、P 兵
//   象棋（set="xiangqi"，「圖示」模式）：專屬的一套，不借用西洋棋——
//     K 帥將：皇冠　A 仕士：官帽＋斜線（斜走）　B 相象：大象頭　N 傌馬：奔馬頭
//     R 俥車：車輪　C 炮包：砲車　P 兵卒：長矛＋盾
// 用法：<PieceIcon kind="N" :light="true" :x :y :size /> 會畫在 (x, y) 為中心、寬 size 的位置。
import { computed } from 'vue'

const props = withDefaults(defineProps<{ kind: string; light?: boolean; x?: number; y?: number; size?: number; color?: string; filter?: string; set?: 'chess' | 'xiangqi' }>(), {
  light: true,
  x: 20,
  y: 20,
  size: 40,
  color: '',
  filter: undefined,
  set: 'chess',
})

const fill = computed(() => props.color || (props.light ? 'var(--color-card)' : 'var(--color-ink)'))
const line = computed(() => (props.light || props.color ? 'var(--color-ink)' : 'var(--color-card)'))
const k = computed(() => props.kind.toUpperCase())
const base = 'M9 31.5h22a1.5 1.5 0 0 1 1.5 1.5v2.5h-25V33a1.5 1.5 0 0 1 1.5-1.5z'
</script>

<template>
  <g :transform="`translate(${x - size / 2} ${y - size / 2}) scale(${size / 40})`" :filter="filter" stroke-linejoin="round" stroke-linecap="round">
    <g :fill="fill" stroke="var(--color-ink)" stroke-width="1.8">
      <!-- ── 象棋專屬圖示 ── -->
      <template v-if="set === 'xiangqi'">
        <!-- 帥／將：皇冠 -->
        <template v-if="k === 'K'">
          <path d="M8 29L10 11l6.5 8L20 7l3.5 12 6.5-8 2 18z" />
          <rect x="7.5" y="30" width="25" height="4.5" rx="1" />
          <circle cx="20" cy="22.5" r="2.2" :fill="line" stroke="none" />
        </template>
        <!-- 仕／士：官帽，帽身畫一個斜叉表示斜著走 -->
        <template v-else-if="k === 'A'">
          <path d="M11 19c0-6 4-10 9-10s9 4 9 10z" />
          <rect x="5.5" y="18.5" width="29" height="4.5" rx="1.5" />
          <path d="M6 15.5c-2-1-3-2.5-2-4M34 15.5c2-1 3-2.5 2-4" fill="none" />
          <path d="M14 26.5l12 8M26 26.5l-12 8" stroke-width="3.2" />
        </template>
        <!-- 相／象：大象側臉（大耳朵、往下捲的象鼻、象牙） -->
        <template v-else-if="k === 'B'">
          <path d="M11.5 21c-1 6-1.5 10 1.5 12.5 2 1.5 4.5.5 4-2" fill="none" stroke="var(--color-ink)" stroke-width="6.4" />
          <path d="M11.5 21c-1 6-1.5 10 1.5 12.5 2 1.5 4.5.5 4-2" fill="none" :stroke="fill" stroke-width="3.6" />
          <ellipse cx="17" cy="15.5" rx="9.5" ry="9" />
          <path d="M21 8c6-3.5 13-1 14 6s-3 12-9 12c-2.5 0-4-1-4.5-2.5" />
          <path d="M16 22.5c1.5 2 3.5 2.8 6 2.5" fill="none" :stroke="line" stroke-width="1.6" />
          <circle cx="14" cy="13.5" r="1.4" :fill="line" stroke="none" />
        </template>
        <!-- 傌／馬：馬頭側面（豎起的耳朵、長長的口鼻、脖子上的鬃毛） -->
        <template v-else-if="k === 'N'">
          <path d="M31 36V26c0-9-4-16-11.5-18.5L18 3l-2.5 4.5-2.5-3L12 9.5C8.5 12.5 5.5 16.5 4.5 20.5 4 23 5 25 7.5 25h4.5c1.5 0 2.5 1 3 2.5l1 3.5-2 5z" />
          <path d="M22.5 9.5c4.5 3 7 8.5 7 15" fill="none" :stroke="line" stroke-width="1.6" stroke-dasharray="2.4 1.6" />
          <circle cx="13" cy="13.5" r="1.4" :fill="line" stroke="none" />
          <circle cx="7" cy="21.5" r="0.9" :fill="line" stroke="none" />
        </template>
        <!-- 俥／車：車輪 -->
        <template v-else-if="k === 'R'">
          <circle cx="20" cy="20" r="14" />
          <circle cx="20" cy="20" r="9.5" fill="none" :stroke="line" stroke-width="1.6" />
          <path d="M20 6.5v27M6.5 20h27M10.5 10.5l19 19M29.5 10.5l-19 19" :stroke="line" stroke-width="1.5" />
          <circle cx="20" cy="20" r="3.4" :stroke="line" stroke-width="1.6" />
        </template>
        <!-- 炮／包：砲車 -->
        <template v-else-if="k === 'C'">
          <path d="M6 21l21-9 3 6.5-20 9.5z" />
          <path d="M27 12l3.5-1.5 2.5 5.5-3 1.5" />
          <circle cx="14.5" cy="27" r="6" />
          <circle cx="14.5" cy="27" r="1.8" :fill="line" stroke="none" />
        </template>
        <!-- 兵／卒：直立的長矛＋圓盾 -->
        <template v-else-if="k === 'P'">
          <path d="M27 3l3.5 7.5h-7z" />
          <path d="M27 10v26" stroke-width="2.8" fill="none" />
          <path d="M8 17c4-2 10-2 14 0v8c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10z" />
          <path d="M15 19.5v12M10.5 24.5h9" :stroke="line" stroke-width="1.6" />
        </template>
      </template>
      <!-- ── 西洋棋 ── -->
      <!-- 兵 -->
      <template v-else-if="k === 'P'">
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
