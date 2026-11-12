<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { back, curtainFor, depth, replace, route, routeKey, travel } from '@/core/nav'
import Curtain from '@/ui/Curtain.vue'
import { S } from '@/data/strings'
import { resolveOptions } from '@/games/options'
import { gamePrefs } from '@/core/settings'
import { getGame } from '@/games/registry'
import CategoryScreen from '@/screens/CategoryScreen.vue'
import GameSettingsScreen from '@/screens/GameSettingsScreen.vue'
import HomeScreen from '@/screens/HomeScreen.vue'
import LobbyScreen from '@/screens/LobbyScreen.vue'
import RulesScreen from '@/screens/RulesScreen.vue'

// 往前進時新畫面從右邊滑入，返回時從左邊
const shift = ref('1.2rem')
watch(depth, (now, before) => {
  shift.value = now >= before ? '1.2rem' : '-1.2rem'
})

/** 離開對局或教學：用過場蓋住再回到大廳 */
function leave(gameId: string) {
  travel(curtainFor(getGame(gameId).category), back)
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape' && route.value.name !== 'play' && route.value.name !== 'tutorial') back()
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <main class="h-full" :style="{ '--screen-shift': shift }">
    <Transition name="screen" mode="out-in">
      <HomeScreen v-if="route.name === 'home'" :key="routeKey" />
      <CategoryScreen v-else-if="route.name === 'category'" :key="routeKey" :category="route.category" />
      <LobbyScreen v-else-if="route.name === 'lobby'" :key="routeKey" :game-id="route.gameId" />
      <RulesScreen v-else-if="route.name === 'rules'" :key="routeKey" :game-id="route.gameId" />
      <GameSettingsScreen v-else-if="route.name === 'settings'" :key="routeKey" :game-id="route.gameId" />
      <component
        :is="getGame(route.gameId).tutorial"
        v-else-if="route.name === 'tutorial'"
        :key="routeKey"
        @exit="leave(route.gameId)"
        @play="replace({ name: 'play', gameId: route.gameId })"
      />
      <component
        :is="getGame(route.gameId).component"
        v-else
        :key="routeKey"
        :game="getGame(route.gameId)"
        :options="resolveOptions(getGame(route.gameId))"
        :difficulty="gamePrefs(route.gameId).difficulty"
        @exit="leave(route.gameId)"
      />
    </Transition>
    <Curtain />
    <div class="rotate font-display">{{ S.app.rotate }}</div>
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
}
@media (orientation: portrait) and (max-width: 700px) {
  .rotate {
    display: grid;
  }
}
</style>
