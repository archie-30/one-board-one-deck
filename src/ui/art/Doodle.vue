<script setup lang="ts">
// 大的手繪圖示。每個圖示會自動再描一次（稍微錯開），做出打稿的雙線感。
import { computed, useId } from 'vue'

const props = defineProps<{ name: 'book' | 'tutor' | 'gear' | 'bulb' | 'play' | 'pass' | 'back' | 'menu' | 'again' | 'exit' | 'score' | 'resume' }>()
const id = useId()

const gear = computed(() => {
  if (props.name !== 'gear') return ''
  const pts: string[] = []
  for (let i = 0; i < 16; i++) {
    const r = i % 2 === 0 ? 25 : 18.5
    for (const off of [-0.11, 0.11]) {
      const a = (i / 16) * Math.PI * 2 + off
      pts.push(`${(32 + Math.cos(a) * r).toFixed(1)} ${(32 + Math.sin(a) * r).toFixed(1)}`)
    }
  }
  return `M${pts.join('L')}Z`
})
</script>

<template>
  <svg viewBox="0 0 64 64" class="doodle" fill="none" stroke="var(--color-ink)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <g :id="id">
      <template v-if="name === 'book'">
        <path d="M9 50C17 48 27 49 32 54C37 49 47 48 59 51L58 56C47 54 38 55 32 60C26 55 18 54 10 55Z" fill="url(#hatch)" stroke="none" />
        <path d="M32 16C26 12 16 11 7 13.500L8 48C16 46 26 47 32 51Z" fill="var(--color-card)" />
        <path d="M32 16C38 12 48 11 57 13.500L56 48C48 46 38 47 32 51Z" fill="var(--color-card)" />
        <path d="M44 9v15l3.500-3.500L51 24V9.500Z" fill="var(--color-red)" />
        <path d="M13 22c5-1.200 10-.6 14 1M13 29c5-1.200 10-.6 14 1M13 36c5-1.200 10-.6 14 1M37 30c4-1.600 9-2 14-1M37 37c4-1.600 9-2 14-1" stroke-width="1.500" opacity=".7" />
      </template>
      <template v-else-if="name === 'tutor'">
        <path d="M14 20L50 15L55 51L19 57Z" fill="url(#hatch)" stroke="none" />
        <path d="M9 15L46 9.500L50 47L13 52Z" fill="var(--color-sun)" />
        <path d="M17 24l19-2.600M18 32l16-2.200M19 40l10-1.400" stroke-width="1.500" opacity=".7" />
        <g transform="rotate(-48 42 34)">
          <path d="M24 29.500H58V38.500H24Z" fill="var(--color-deck)" />
          <path d="M24 29.500L14 34L24 38.500Z" fill="var(--color-card)" />
          <path d="M17.500 32.400L14 34L17.500 35.600Z" fill="var(--color-ink)" />
          <path d="M58 29.500H63V38.500H58Z" fill="var(--color-red)" />
        </g>
      </template>
      <template v-else-if="name === 'gear'">
        <path :d="gear" transform="translate(3 3.500)" fill="url(#hatch)" stroke="none" />
        <path :d="gear" fill="var(--color-paper-deep)" />
        <path :d="gear" fill="url(#hatch-soft)" stroke="none" />
        <circle cx="32" cy="32" r="8.500" fill="var(--color-card)" />
      </template>
      <template v-else-if="name === 'bulb'">
        <path d="M32 9C21 9 15 17 15 25C15 32 20 36 23 41L23 46L41 46L41 41C44 36 49 32 49 25C49 17 43 9 32 9Z" fill="var(--color-sun)" />
        <path d="M40 20c3 3 3.500 7 2 11" stroke="var(--color-card)" stroke-width="2.600" opacity=".8" />
        <path d="M25 50.500h14M26.500 55h11M29.500 59.300h5" />
        <path d="M32 1.500v3.500M11 9l2.600 2.600M53 9l-2.600 2.600M5 26h3.500M55.500 26H59" stroke-width="1.800" />
      </template>
      <template v-else-if="name === 'play'">
        <path d="M22 17L50 14L53 54L25 57Z" fill="url(#hatch)" stroke="none" />
        <path d="M16 12L45 9L48 50L19 53Z" fill="var(--color-card)" />
        <path d="M32 43V22M23.500 29.500L32 20.500L40.500 29" stroke="var(--color-red)" stroke-width="4.400" />
      </template>
      <template v-else-if="name === 'pass'">
        <path d="M24 27L49 25L51 58L26 60Z" fill="url(#hatch)" stroke="none" />
        <path d="M19 23L44 21L46 54L21 56Z" fill="var(--color-deck)" />
        <path d="M23 27.500L40.500 26L42 50L24.500 51.500Z" fill="url(#hatch-w)" stroke="none" />
        <path d="M7 21C18 5 42 3 56 15M56 15l-9.500.5M56 15l-1.500-9.500" stroke-width="3" />
      </template>
      <template v-else-if="name === 'back'">
        <path d="M37 13L17 32L38 51M19 32Q38 30 56 33" stroke-width="4.600" />
      </template>
      <template v-else-if="name === 'menu'">
        <path d="M12 19q20-2.500 40 .5M12.500 32q19 2 39-.5M12 45q20-2 40 .6" stroke-width="4.400" />
      </template>
      <template v-else-if="name === 'again'">
        <path d="M50 22A21 21 0 1 0 53 36" stroke-width="4.400" />
        <path d="M53 9.500L51 23.500L37.500 20" stroke-width="4.400" />
      </template>
      <template v-else-if="name === 'resume'">
        <path d="M24 16L58 36L25 57Z" fill="url(#hatch)" stroke="none" />
        <path d="M18 10L53 31L19 52Z" fill="var(--color-red)" stroke-width="2.600" />
      </template>
      <template v-else-if="name === 'exit'">
        <path d="M30 13H12.500L13 52H30" stroke-width="3.400" />
        <path d="M25 32Q40 30.500 55 32.500M44 21.500L56 32.500L44.500 43.500" stroke-width="4.400" />
      </template>
      <template v-else>
        <path d="M17 13L51 11L53 55L19 57Z" fill="url(#hatch)" stroke="none" />
        <path d="M12 9L46 7L48 51L14 53Z" fill="var(--color-card)" />
        <path d="M19 19l20-1.200M19.500 28l20-1.200M20 37l20-1.200M20.500 45l11-.7" stroke-width="1.700" opacity=".7" />
        <path d="M38 40l5 5.500L54 33" stroke="var(--color-red)" stroke-width="4" />
      </template>
    </g>
    <use :href="`#${id}`" transform="translate(0.900 0.600) rotate(1.300 32 32)" opacity=".38" style="fill: none" />
  </svg>
</template>

<style scoped>
.doodle {
  display: block;
  overflow: visible;
}
</style>
