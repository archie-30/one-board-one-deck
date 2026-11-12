<script setup lang="ts">
// INKRAGE 選單中間那條墨線：出場時由上往下畫出來，之後偶爾有墨水沿線滴下
import { computed } from 'vue'
import { inkPath, type Pt } from './art/ink'

const props = withDefaults(defineProps<{ seed?: number; horizontal?: boolean }>(), { seed: 2 })
const d = computed(() => {
  const pts: Pt[] = []
  for (let i = 0; i <= 24; i++) {
    const t = i / 24
    pts.push([3 + Math.sin(t * 9 + props.seed) * 1.2 + Math.sin(t * 23) * 0.5, t * 400])
  }
  return [0, 4099, 8191].map((k) => inkPath(pts, { width: 3, seed: props.seed + k, taper: 0.15, pressure: 0.5 }))
})
</script>

<template>
  <div class="divider" :class="{ horizontal }" aria-hidden="true">
    <svg viewBox="0 0 6 400" preserveAspectRatio="none" class="line">
      <path v-for="(p, i) in d" :key="i" :d="p" fill="var(--color-ink)" :class="`bv${i}`" />
    </svg>
    <span class="drop" />
    <span class="drop d2" />
  </div>
</template>

<style scoped>
.divider {
  position: relative;
  width: 0.4rem;
  height: 100%;
  flex-shrink: 0;
}
.line {
  width: 100%;
  height: 100%;
  overflow: visible;
  animation: draw-down 700ms var(--ease-in-out) both;
}
@keyframes draw-down {
  from {
    clip-path: inset(0 -50% 100% -50%);
  }
  to {
    clip-path: inset(0 -50% 0 -50%);
  }
}
.drop {
  position: absolute;
  left: 50%;
  top: 0;
  width: 0.34rem;
  height: 0.42rem;
  margin-left: -0.17rem;
  border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
  background: var(--color-ink);
  opacity: 0;
  animation: drip 7s ease-in infinite 1.2s;
}
.d2 {
  animation-delay: 4.6s;
  animation-duration: 9s;
}
@keyframes drip {
  0% {
    opacity: 0;
    transform: translateY(8vh) scale(0.4);
  }
  8% {
    opacity: 1;
    transform: translateY(10vh) scale(1);
  }
  60% {
    opacity: 1;
    transform: translateY(70vh) scale(0.85, 1.2);
  }
  70%,
  100% {
    opacity: 0;
    transform: translateY(80vh) scale(0.5);
  }
}
</style>
