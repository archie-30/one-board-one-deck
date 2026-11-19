<script setup lang="ts">
// 「有新版本」視窗（Android App 版，開 App 時發現 Google Play 上有新版本才跳；core/appUpdate.ts）
import { updateLater, updateNow, updateReady } from '@/core/appUpdate'
import { S } from '@/data/strings'
import Btn from './Btn.vue'
import Dialog from './Dialog.vue'
</script>

<template>
  <Dialog :open="updateReady" :title="S.app.updateTitle" label="UPDATE" tone="red" @close="updateLater">
    <p class="text-[0.9rem] text-ink-2">{{ S.app.updateLead }}</p>
    <template #actions>
      <div class="grid w-full grid-cols-2 gap-[0.8rem]">
        <Btn block data-back @click="updateLater">{{ S.app.updateLater }}</Btn>
        <Btn tone="red" block arrow @click="updateNow">{{ S.app.updateNow }}</Btn>
      </div>
    </template>
  </Dialog>
</template>
