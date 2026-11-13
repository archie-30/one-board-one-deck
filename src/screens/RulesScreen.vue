<script setup lang="ts">
import { computed } from 'vue'
import { S } from '@/data/strings'
import { getGame } from '@/games/registry'
import Page from '@/ui/Page.vue'
import RulesBody from '@/ui/RulesBody.vue'

const props = defineProps<{ gameId: string }>()
const game = computed(() => getGame(props.gameId))
</script>

<template>
  <Page :title="S.rules.title" :label="game.name" num="03">
    <div class="scroll-y h-full pr-[0.8rem]"><RulesBody :game="game" /></div>
  </Page>
</template>
