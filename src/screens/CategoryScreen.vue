<script setup lang="ts">
// 一個分類有兩款以上的遊戲時才會出現：用 INKRAGE 選單按鈕列出遊戲
import { computed } from 'vue'
import { go } from '@/core/nav'
import { S } from '@/data/strings'
import { gamesIn } from '@/games/registry'
import type { GameCategory } from '@/games/types'
import InkPanel from '@/ui/InkPanel.vue'
import MenuButton from '@/ui/MenuButton.vue'

const props = defineProps<{ category: GameCategory }>()
const games = computed(() => gamesIn(props.category))
</script>

<template>
  <InkPanel :title="S.category[category].title" :sub="S.category[category].lead">
    <div class="flex w-[24rem] flex-col gap-[0.7rem] pt-[0.6rem]">
      <MenuButton
        v-for="(g, i) in games"
        :key="g.id"
        class="slide-in"
        :style="{ '--i': i }"
        :icon="category"
        :label="g.name"
        :sub="g.summary"
        :seed="i * 5 + 2"
        @click="go({ name: 'lobby', gameId: g.id })"
      />
    </div>
  </InkPanel>
</template>
