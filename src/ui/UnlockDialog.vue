<script setup lang="ts">
// 解鎖彈窗（App 層）：一局結束後升級、拿到新稱號或新頭像零件時跳出來。
// 在對局裡會等結算視窗先出來（約 2.6 秒）再疊上去；關掉就看到底下的結算。
// 另外每局結束時，畫面上方中間冒出一個小小的「+N 經驗」提示。
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { playSound } from '@/core/audio'
import { go, route } from '@/core/nav'
import { lastGain, myLook, unlockQueue, type Unlock } from '@/core/profile'
import { S } from '@/data/strings'
import Avatar from './art/Avatar.vue'
import type { Look } from './art/look'
import Btn from './Btn.vue'
import Dialog from './Dialog.vue'

const T = S.profile
const current = ref<{ gained: number; items: Unlock[] } | null>(null)
let timer = 0
function next() {
  window.clearTimeout(timer)
  if (current.value || !unlockQueue.length) return
  timer = window.setTimeout(
    () => {
      if (current.value || !unlockQueue.length) return
      current.value = unlockQueue.shift()!
      playSound('correct')
    },
    route.value.name === 'play' ? 2600 : 400,
  )
}
watch(() => unlockQueue.length, next)
function close() {
  current.value = null
  window.setTimeout(next, 300)
}
function view() {
  close()
  go({ name: 'profile' })
}

const level = computed(() => current.value?.items.find((i) => i.kind === 'level') as { level: number } | undefined)
const titles = computed(() => (current.value?.items ?? []).filter((i): i is { kind: 'title'; id: string } => i.kind === 'title'))
const avatars = computed(() => (current.value?.items ?? []).filter((i): i is { kind: 'avatar'; part: 'shape' | 'tone' | 'fill'; value: string } => i.kind === 'avatar'))
const partName = (a: { part: 'shape' | 'tone' | 'fill'; value: string }) => ({ shape: T.shapes, tone: T.tones, fill: T.fills })[a.part][a.value]
const preview = (a: { part: 'shape' | 'tone' | 'fill'; value: string }): Look => ({ ...myLook(), [a.part]: a.value })

// 「+N 經驗」小提示
const toast = ref(0)
const toastKey = ref(0)
let toastTimer = 0
watch(
  () => lastGain.key,
  () => {
    window.clearTimeout(toastTimer)
    const xp = lastGain.xp
    toastTimer = window.setTimeout(() => {
      toast.value = xp
      toastKey.value++
      toastTimer = window.setTimeout(() => (toast.value = 0), 2600)
    }, 1100)
  },
)
onBeforeUnmount(() => {
  window.clearTimeout(timer)
  window.clearTimeout(toastTimer)
})
</script>

<template>
  <Dialog :open="current !== null" :title="T.unlock.title" :label="T.unlock.label" tone="yellow" @close="close">
    <div class="ul">
      <p v-if="level" class="t-slab lv">{{ T.unlock.level(level.level) }}</p>
      <div v-if="titles.length" class="grp">
        <span class="t-label">{{ T.unlock.newTitle }}</span>
        <div class="row">
          <span v-for="t in titles" :key="t.id" class="tt t-black">{{ T.titles[t.id].name }}</span>
        </div>
      </div>
      <div v-if="avatars.length" class="grp">
        <span class="t-label">{{ T.unlock.newAvatar }}</span>
        <div class="row">
          <span v-for="a in avatars" :key="a.part + a.value" class="av">
            <span class="oav"><Avatar :look="preview(a)" /></span>
            <span class="t-label">{{ T.parts[a.part] }}・{{ partName(a) }}</span>
          </span>
        </div>
      </div>
    </div>
    <template #actions>
      <Btn v-if="route.name !== 'play' && route.name !== 'profile'" size="sm" @click="view">{{ T.unlock.go }}</Btn>
      <Btn size="sm" @click="close">{{ T.unlock.ok }}</Btn>
    </template>
  </Dialog>
  <Transition name="xp">
    <span v-if="toast" :key="toastKey" class="xp-toast t-black">{{ T.gain(toast) }}</span>
  </Transition>
</template>

<style scoped>
.ul {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}
.lv {
  font-size: 1.6rem;
  color: var(--color-red);
}
.grp {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.tt {
  border: 0.13rem solid var(--color-ink);
  background: var(--color-ink);
  color: var(--color-card);
  padding: 0.15rem 0.6rem;
  font-size: 0.95rem;
}
.av {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
}
.oav {
  display: block;
  width: 2.8rem;
  height: 2.8rem;
}
.oav :deep(svg) {
  width: 100%;
  height: 100%;
}
.xp-toast {
  position: fixed;
  top: 0.7rem;
  left: 50%;
  z-index: 950;
  translate: -50% 0;
  border: 0.13rem solid var(--color-ink);
  background: var(--color-yellow);
  box-shadow: 0.15rem 0.15rem 0 var(--color-ink);
  padding: 0.1rem 0.7rem;
  font-size: 0.9rem;
  pointer-events: none;
}
.xp-enter-active {
  transition:
    opacity 220ms ease,
    transform 360ms var(--ease-back);
}
.xp-leave-active {
  transition:
    opacity 200ms ease,
    transform 200ms ease;
}
.xp-enter-from,
.xp-leave-to {
  opacity: 0;
  transform: translateY(-0.6rem);
}
@media (prefers-reduced-motion: reduce) {
  .xp-enter-active,
  .xp-leave-active {
    transition: none;
  }
}
</style>
