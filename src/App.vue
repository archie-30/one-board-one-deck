<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { back, replace, route, routeKey } from '@/core/nav'
import { reducedMotion } from '@/core/motion'
import { S } from '@/data/strings'
import { getGame } from '@/games/registry'
import CategoryScreen from '@/screens/CategoryScreen.vue'
import GameSettingsScreen from '@/screens/GameSettingsScreen.vue'
import NamesScreen from '@/screens/NamesScreen.vue'
import PlayScreen from '@/screens/PlayScreen.vue'
import RulesScreen from '@/screens/RulesScreen.vue'
import TitleScreen from '@/screens/TitleScreen.vue'
import LaunchOverlay from '@/ui/LaunchOverlay.vue'

/** 離開一頁：往下沉一點、淡出（0.2 秒）；對局頁、減少動態時直接換 */
function pageLeave(el: Element, done: () => void) {
  const box = el as HTMLElement
  if (!(box instanceof HTMLElement) || reducedMotion() || box.dataset.page === 'play') return done()
  box.animate(
    [
      { opacity: 1, transform: 'none' },
      { opacity: 0, transform: 'translateY(0.8rem)' },
    ],
    { duration: 200, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' },
  ).onfinish = done
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape' && route.value.name !== 'play' && route.value.name !== 'tutorial') back()
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <main class="relative h-full">
    <!-- 換頁：舊的那一頁先往下沉、淡出（各頁進場時元件會自己依序上浮），對局頁有自己的色塊過場 -->
    <Transition :css="false" mode="out-in" @leave="pageLeave">
        <TitleScreen v-if="route.name === 'title'" :key="routeKey" />
        <NamesScreen v-else-if="route.name === 'names'" :key="routeKey" />
        <CategoryScreen v-else-if="route.name === 'category'" :key="routeKey" :category="route.category" />
        <RulesScreen v-else-if="route.name === 'rules'" :key="routeKey" :game-id="route.gameId" />
        <GameSettingsScreen v-else-if="route.name === 'settings'" :key="routeKey" :game-id="route.gameId" />
        <component
          :is="getGame(route.gameId).tutorial"
          v-else-if="route.name === 'tutorial'"
          :key="routeKey"
          @exit="back()"
          @play="replace({ name: 'play', gameId: route.gameId })"
          @rules="replace({ name: 'rules', gameId: route.gameId })"
        />
        <PlayScreen v-else :key="routeKey" :game-id="route.gameId" />
    </Transition>
    <LaunchOverlay />
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
