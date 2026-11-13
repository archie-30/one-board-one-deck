<script setup lang="ts">
// 一張牌（SVG 座標 70×100）：白底、黑框、圓角、右下實心陰影；點數用復古粗襯線字。
// 牌背：鈷藍底＋網點＋中間一個米白圓。只用紅、黑兩色分花色。
import { useId } from 'vue'
import { SUIT_PATHS, isRedSuit } from './suits'

withDefaults(defineProps<{ rank?: string; suit?: number; back?: boolean; shadow?: boolean }>(), { rank: 'A', suit: 3, shadow: true })
const id = useId()
</script>

<template>
  <g>
    <defs v-if="back">
      <pattern :id="`dots${id}`" width="5" height="5" patternUnits="userSpaceOnUse">
        <circle cx="2.5" cy="2.5" r="0.9" fill="rgb(251 248 241 / .35)" />
      </pattern>
    </defs>
    <rect v-if="shadow" x="3" y="3.5" width="70" height="100" rx="6" fill="var(--color-ink)" />
    <template v-if="back">
      <rect x="0" y="0" width="70" height="100" rx="6" fill="var(--color-blue)" stroke="var(--color-ink)" stroke-width="2.2" />
      <rect x="6" y="6" width="58" height="88" rx="3" :fill="`url(#dots${id})`" />
      <circle cx="35" cy="50" r="13" fill="var(--color-card)" stroke="var(--color-ink)" stroke-width="2" />
      <circle cx="35" cy="50" r="5.5" fill="var(--color-red)" />
    </template>
    <template v-else>
      <rect x="0" y="0" width="70" height="100" rx="6" fill="var(--color-card)" stroke="var(--color-ink)" stroke-width="2.2" />
      <text
        :x="rank === '10' ? 4.5 : 7"
        y="27"
        font-size="25"
        class="t-slab"
        :fill="isRedSuit(suit) ? 'var(--color-red)' : 'var(--color-ink)'"
        :textLength="rank === '10' ? 27 : undefined"
        lengthAdjust="spacingAndGlyphs"
      >
        {{ rank }}
      </text>
      <path :d="SUIT_PATHS[suit]" :fill="isRedSuit(suit) ? 'var(--color-red)' : 'var(--color-ink)'" transform="translate(7.5 32) scale(.55)" />
      <path :d="SUIT_PATHS[suit]" :fill="isRedSuit(suit) ? 'var(--color-red)' : 'var(--color-ink)'" transform="translate(30 53) scale(1.45)" />
    </template>
  </g>
</template>
