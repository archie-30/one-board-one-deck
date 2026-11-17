<script setup lang="ts">
// 連線棋局：對方申請悔棋，問你同不同意（兩顆一樣大的按鈕並排）
import { S } from '@/data/strings'
import Btn from './Btn.vue'
import Dialog from './Dialog.vue'

defineProps<{ open: boolean; name: string }>()
const emit = defineEmits<{ answer: [ok: boolean] }>()
</script>

<template>
  <Dialog :open="open" :title="S.common.undoAsk(name)" label="UNDO" tone="yellow" @close="emit('answer', false)">
    <p class="text-[0.9rem] text-ink-2">{{ S.common.undoAskLead }}</p>
    <template #actions>
      <div class="grid w-full grid-cols-2 gap-[0.8rem]">
        <Btn block @click="emit('answer', false)">{{ S.common.undoRefuse }}</Btn>
        <Btn tone="red" block @click="emit('answer', true)">{{ S.common.undoAgree }}</Btn>
      </div>
    </template>
  </Dialog>
</template>
