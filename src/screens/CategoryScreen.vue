<script setup lang="ts">
// 一個分類有兩款以上的遊戲時才會出現
import { computed } from 'vue'
import { go } from '@/core/nav'
import { S } from '@/data/strings'
import { gamesIn } from '@/games/registry'
import type { GameCategory } from '@/games/types'
import Btn from '@/ui/Btn.vue'
import Page from '@/ui/Page.vue'

const props = defineProps<{ category: GameCategory }>()
const games = computed(() => gamesIn(props.category))
</script>

<template>
  <Page :title="S.category[category].title" :label="S.category[category].lead">
    <div class="flex w-[22rem] flex-col gap-[0.7rem] pt-[0.6rem]">
      <Btn v-for="(g, i) in games" :key="g.id" class="rise" :style="{ '--i': i }" block arrow @click="go({ name: 'lobby', gameId: g.id })">{{ g.name }}</Btn>
    </div>
  </Page>
</template>
