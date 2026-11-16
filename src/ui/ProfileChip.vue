<script setup lang="ts">
// 右上角的個人資料入口：頭像＋等級＋一條細細的經驗條，點了進個人資料頁（主畫面、模式選單共用）
import { computed } from 'vue'
import { playSound } from '@/core/audio'
import { go } from '@/core/nav'
import { levelOf, levelProgress, myLook, profile } from '@/core/profile'
import { LEVEL_CAP_SHOWN } from '@/data/profile'
import { S } from '@/data/strings'
import Avatar from './art/Avatar.vue'

const lv = computed(() => levelOf(profile.xp))
const pct = computed(() => {
  const p = levelProgress(profile.xp)
  return `${(p.into / p.need) * 100}%`
})
function open() {
  playSound('tap')
  go({ name: 'profile' })
}
</script>

<template>
  <button class="chip" :aria-label="S.profile.open" @click="open">
    <span class="av"><Avatar :look="myLook()" /></span>
    <span class="txt">
      <span class="t-slab lv" :class="{ max: lv >= LEVEL_CAP_SHOWN }">{{ S.profile.lv(lv) }}</span>
      <span class="bar"><span :style="{ width: pct }" /></span>
    </span>
  </button>
</template>

<style scoped>
.chip {
  position: relative;
  display: flex;
  height: 2.4rem;
  align-items: center;
  gap: 0.4rem;
  border: 0.13rem solid var(--color-ink);
  border-radius: 1.2rem;
  background: var(--color-card);
  box-shadow: 0.15rem 0.15rem 0 var(--color-ink);
  padding: 0 0.7rem 0 0.2rem;
  transition:
    transform 110ms var(--ease-out),
    box-shadow 110ms var(--ease-out);
}
/* 按下時整顆往右下移；多一圈看不見的點擊範圍 */
.chip::after {
  content: '';
  position: absolute;
  inset: -0.3rem;
}
.chip:active {
  transform: translate(0.15rem, 0.15rem);
  box-shadow: 0 0 0 var(--color-ink);
}
.av {
  display: block;
  width: 1.8rem;
  height: 1.8rem;
}
.av :deep(svg) {
  width: 100%;
  height: 100%;
}
.txt {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.lv {
  font-size: 0.85rem;
  line-height: 1;
}
.lv.max {
  color: var(--color-red);
}
.bar {
  display: block;
  width: 2.8rem;
  height: 0.28rem;
  border: 0.08rem solid var(--color-ink);
  background: var(--color-paper);
}
.bar span {
  display: block;
  height: 100%;
  background: var(--color-red);
}
</style>
