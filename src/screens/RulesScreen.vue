<script setup lang="ts">
import { computed } from 'vue'
import { S } from '@/data/strings'
import { getGame } from '@/games/registry'
import ScreenFrame from '@/ui/ScreenFrame.vue'
import RulesBody from '@/ui/RulesBody.vue'

const props = defineProps<{ gameId: string }>()
const game = computed(() => getGame(props.gameId))
</script>

<template>
  <ScreenFrame :title="game.name" :lead="S.rules.title">
    <div class="scroll-y h-full pr-[1rem]"><RulesBody :game="game" /></div>
  </ScreenFrame>
</template>
