<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { back, replace, route, routeKey } from '@/core/nav'
import { S } from '@/data/strings'
import { resolveOptions } from '@/games/options'
import { getGame } from '@/games/registry'
import CategoryScreen from '@/screens/CategoryScreen.vue'
import ChooseScreen from '@/screens/ChooseScreen.vue'
import GameSettingsScreen from '@/screens/GameSettingsScreen.vue'
import LobbyScreen from '@/screens/LobbyScreen.vue'
import RulesScreen from '@/screens/RulesScreen.vue'
import TitleScreen from '@/screens/TitleScreen.vue'

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape' && route.value.name !== 'play' && route.value.name !== 'tutorial') back()
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <main class="relative h-full">
      <TitleScreen v-if="route.name === 'title'" :key="routeKey" />
      <ChooseScreen v-else-if="route.name === 'choose'" :key="routeKey" />
      <CategoryScreen v-else-if="route.name === 'category'" :key="routeKey" :category="route.category" />
      <LobbyScreen v-else-if="route.name === 'lobby'" :key="routeKey" :game-id="route.gameId" />
      <RulesScreen v-else-if="route.name === 'rules'" :key="routeKey" :game-id="route.gameId" />
      <GameSettingsScreen v-else-if="route.name === 'settings'" :key="routeKey" :game-id="route.gameId" />
      <component
        :is="getGame(route.gameId).tutorial"
        v-else-if="route.name === 'tutorial'"
        :key="routeKey"
        @exit="back()"
        @play="replace({ name: 'play', gameId: route.gameId })"
      />
      <component :is="getGame(route.gameId).component" v-else :key="routeKey" :game="getGame(route.gameId)" :options="resolveOptions(getGame(route.gameId))" @exit="back()" />
    <div class="rotate">{{ S.app.rotate }}</div>
  </main>
</template>

<style scoped>
.rotate {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 60;
  place-items: center;
  background: var(--color-paper);
  font-size: 7vw;
  font-weight: 900;
}
@media (orientation: portrait) and (max-width: 700px) {
  .rotate {
    display: grid;
  }
}
</style>
