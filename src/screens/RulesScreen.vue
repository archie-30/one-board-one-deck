<script setup lang="ts">
import { computed } from 'vue'
import { S } from '@/data/strings'
import { getGame } from '@/games/registry'
import InkPanel from '@/ui/InkPanel.vue'
import RulesBody from '@/ui/RulesBody.vue'

const props = defineProps<{ gameId: string }>()
const game = computed(() => getGame(props.gameId))
</script>

<template>
  <InkPanel :title="S.rules.title" :sub="game.name">
    <div class="scroll-y h-full pr-[0.8rem]"><RulesBody :game="game" /></div>
  </InkPanel>
</template>
