<script setup lang="ts">
// 一張牌（SVG 座標 70×100）：白底、圓角、細框、柔和陰影；只用紅、黑兩色分花色。
// 牌背：鈷藍底＋白色細內框＋中間一個小圓。
import { SUIT_PATHS, isRedSuit } from './suits'

withDefaults(defineProps<{ rank?: string; suit?: number; back?: boolean; shadow?: boolean }>(), { rank: 'A', suit: 3, shadow: true })
</script>

<template>
  <g>
    <template v-if="shadow">
      <rect x="1" y="3" width="70" height="100" rx="7" fill="rgb(23 23 26 / .08)" />
      <rect x="0.5" y="1.5" width="70" height="100" rx="7" fill="rgb(23 23 26 / .08)" />
    </template>
    <template v-if="back">
      <rect x="0" y="0" width="70" height="100" rx="7" fill="var(--color-blue)" />
      <rect x="6" y="6" width="58" height="88" rx="4" fill="none" stroke="rgb(255 255 255 / .55)" stroke-width="1.2" />
      <circle cx="35" cy="50" r="9" fill="none" stroke="rgb(255 255 255 / .8)" stroke-width="1.6" />
      <circle cx="35" cy="50" r="3.2" fill="var(--color-red)" />
    </template>
    <template v-else>
      <rect x="0" y="0" width="70" height="100" rx="7" fill="#fff" stroke="rgb(23 23 26 / .14)" stroke-width="1" />
      <text
        :x="rank === '10' ? 5 : 7.5"
        y="26"
        font-size="24"
        font-weight="900"
        :fill="isRedSuit(suit) ? 'var(--color-red)' : 'var(--color-ink)'"
        :textLength="rank === '10' ? 26 : undefined"
        lengthAdjust="spacingAndGlyphs"
        style="font-family: var(--font-sans)"
      >
        {{ rank }}
      </text>
      <path :d="SUIT_PATHS[suit]" :fill="isRedSuit(suit) ? 'var(--color-red)' : 'var(--color-ink)'" transform="translate(8 31) scale(.5)" />
      <path :d="SUIT_PATHS[suit]" :fill="isRedSuit(suit) ? 'var(--color-red)' : 'var(--color-ink)'" transform="translate(31 55) scale(1.35)" />
    </template>
  </g>
</template>
