<script setup lang="ts">
// 悔棋：每局一次，要按兩次才生效（第一次變成「再按一次悔棋」，2.5 秒內再按才真的悔棋）
import { onBeforeUnmount, ref, watch } from 'vue'
import { S } from '@/data/strings'
import Btn from './Btn.vue'

/** waiting：連線時已經申請、在等對方同意 */
const props = defineProps<{ disabled: boolean; used: boolean; waiting?: boolean }>()
const emit = defineEmits<{ undo: [] }>()
const armed = ref(false)
let timer = 0
function press() {
  if (!armed.value) {
    armed.value = true
    window.clearTimeout(timer)
    timer = window.setTimeout(() => (armed.value = false), 2500)
    return
  }
  armed.value = false
  window.clearTimeout(timer)
  emit('undo')
}
watch(
  () => props.disabled,
  (d) => d && (armed.value = false),
)
onBeforeUnmount(() => window.clearTimeout(timer))
</script>

<template>
  <Btn size="sm" icon="back" :tone="armed ? 'yellow' : 'plain'" :disabled="disabled || used || waiting" @click="press">{{ used ? S.common.undoUsed : waiting ? S.common.undoWaiting : armed ? S.common.undoConfirm : S.common.undo }}</Btn>
</template>
