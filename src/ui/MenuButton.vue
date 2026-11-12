<script setup lang="ts">
// INKRAGE 的選單按鈕：手繪長方框＋左邊會動的圖示圓圈＋粗體字＋右邊箭頭。
// 出場時從右邊滑進來並稍微過頭；主要按鈕是紅框、紅圖示，會輕輕脈動並有一道光掃過；
// 按下（或滑鼠移上）時放大一點點、微微傾斜，箭頭晃動，字下面畫出紅線。
import { playSound } from '@/core/audio'
import BtnIconArt from './art/BtnIconArt.vue'
import type { BtnIcon } from './art/btnIcons'
import InkFrame from './art/InkFrame.vue'

withDefaults(
  defineProps<{ label: string; icon: BtnIcon; primary?: boolean; disabled?: boolean; size?: 'lg' | 'md' | 'sm'; seed?: number; chevron?: boolean; sub?: string }>(),
  { size: 'md', seed: 1, chevron: true },
)
const emit = defineEmits<{ click: [] }>()

function onClick() {
  playSound('tap')
  emit('click')
}
</script>

<template>
  <button class="menu-btn" :class="[`s-${size}`, { primary }]" :disabled="disabled" @click="onClick">
    <span class="inner">
      <InkFrame block :fill="primary ? 'var(--btn-red-fill)' : 'var(--color-card)'" :tone="primary ? 'var(--color-red)' : 'var(--color-ink)'" :weight="primary ? 2.8 : 2.1" :seed="seed" />
      <span v-if="primary" class="shine" />
      <span class="icon"><BtnIconArt :name="icon" :primary="primary" :seed="seed" /></span>
      <span class="text">
        <span class="label font-display">{{ label }}</span>
        <span v-if="sub" class="sub">{{ sub }}</span>
        <span class="uline" />
      </span>
      <svg v-if="chevron" class="chev" viewBox="0 0 12 18" aria-hidden="true"><path d="M2 2 9.5 9 2 16" /></svg>
    </span>
  </button>
</template>

<style scoped>
.menu-btn {
  --btn-red-fill: #f8e4e1;
  display: block;
  width: 100%;
  border: 0;
  background: none;
  padding: 0;
  text-align: left;
}
.inner {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.7rem;
  height: var(--h);
  padding: 0 1rem 0 calc(var(--h) * 0.13);
  transition: transform 140ms var(--ease-out);
}
.s-lg {
  --h: 3.3rem;
}
.s-md {
  --h: 2.65rem;
}
.s-sm {
  --h: 2.3rem;
}
.primary .inner {
  animation: pulse 2.6s ease-in-out infinite;
}
@keyframes pulse {
  50% {
    transform: scale(1.012);
  }
}
.icon {
  position: relative;
  width: calc(var(--h) * 0.74);
  height: calc(var(--h) * 0.74);
  flex-shrink: 0;
  transition: transform 140ms var(--ease-out);
}
.icon :deep(svg) {
  width: 100%;
  height: 100%;
}
.text {
  position: relative;
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  justify-content: center;
}
.label {
  font-size: calc(var(--h) * 0.4);
  line-height: 1.15;
  white-space: nowrap;
}
.primary .label {
  color: var(--color-red);
  font-size: calc(var(--h) * 0.44);
  font-weight: 900;
}
.sub {
  font-size: calc(var(--h) * 0.24);
  line-height: 1.3;
  color: var(--color-ink-soft);
}
.uline {
  position: absolute;
  left: 0;
  right: 0.4rem;
  bottom: calc(var(--h) * 0.1);
  height: 0.16rem;
  border-radius: 0.2rem;
  background: var(--color-red);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 200ms var(--ease-out);
}
.chev {
  position: relative;
  width: 0.62rem;
  flex-shrink: 0;
  fill: none;
  stroke: rgb(26 26 26 / 0.45);
  stroke-width: 2.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.primary .chev {
  stroke: var(--color-red);
}
/* 主要按鈕上掃過的一道光 */
.shine {
  position: absolute;
  inset: 0.1rem;
  overflow: hidden;
  pointer-events: none;
}
.shine::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  width: 3.5rem;
  background: linear-gradient(90deg, transparent, rgb(251 250 247 / 0.65), transparent);
  animation: shine 3.6s ease-in-out infinite;
}
@keyframes shine {
  0% {
    transform: translateX(-4rem);
  }
  55%,
  100% {
    transform: translateX(26rem);
  }
}
.menu-btn:active:not(:disabled) .inner {
  transform: scale(1.04) rotate(-0.7deg);
}
.menu-btn:active:not(:disabled) .uline {
  transform: scaleX(1);
}
.menu-btn:active:not(:disabled) .icon {
  transform: rotate(-6deg);
}
.menu-btn:active:not(:disabled) .chev {
  stroke: var(--color-ink);
  animation: wiggle 0.5s ease-in-out infinite;
}
@keyframes wiggle {
  50% {
    transform: translateX(0.2rem);
  }
}
@media (hover: hover) and (pointer: fine) {
  .menu-btn:hover:not(:disabled) .inner {
    transform: scale(1.04) rotate(-0.7deg);
  }
  .menu-btn:hover:not(:disabled) .uline {
    transform: scaleX(1);
  }
  .menu-btn:hover:not(:disabled) .icon {
    animation: icon-bob 0.6s ease-in-out infinite;
  }
  .menu-btn:hover:not(:disabled) .chev {
    stroke: var(--color-ink);
    animation: wiggle 0.5s ease-in-out infinite;
  }
  .primary:hover:not(:disabled) .chev {
    stroke: var(--color-red);
  }
}
@keyframes icon-bob {
  25% {
    transform: rotate(-5deg);
  }
  75% {
    transform: rotate(5deg);
  }
}
.menu-btn:disabled {
  cursor: default;
  opacity: 0.4;
}
.menu-btn:disabled .inner {
  animation: none;
}
</style>
