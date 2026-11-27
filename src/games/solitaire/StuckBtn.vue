<script setup lang="ts">
// 「卡關並結算」：要按兩下才結算（不跳視窗）。第一下變黃「再按一次結算」，2.5 秒內再按才結算；
// 沒再按、或點了別的地方就變回原樣。四種接龍（接龍、蜘蛛接龍、新接龍、金字塔接龍）共用。
import { onBeforeUnmount, ref } from 'vue'
import { S } from '@/data/strings'
import Btn from '@/ui/Btn.vue'

const emit = defineEmits<{ settle: [] }>()
const armed = ref(false)
const root = ref<HTMLElement>()
let timer = 0

function disarm() {
  armed.value = false
  window.clearTimeout(timer)
  window.removeEventListener('pointerdown', away, true)
}
/** 點了別的地方：變回原樣 */
function away(e: PointerEvent) {
  if (root.value && !root.value.contains(e.target as Node)) disarm()
}
function press() {
  if (!armed.value) {
    armed.value = true
    window.clearTimeout(timer)
    timer = window.setTimeout(disarm, 2500)
    window.addEventListener('pointerdown', away, true)
    return
  }
  disarm()
  emit('settle')
}
onBeforeUnmount(disarm)
</script>

<template>
  <span ref="root" class="sb">
    <Btn :tone="armed ? 'yellow' : 'red'" size="sm" block @click="press">{{ armed ? S.solitaire.stuckAgain : S.solitaire.stuckSettle }}</Btn>
  </span>
</template>

<style scoped>
.sb {
  display: block;
}
</style>
