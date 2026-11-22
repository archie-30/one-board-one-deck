<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { back, replace, route, routeKey } from '@/core/nav'
import { reducedMotion } from '@/core/motion'
import { fsHint } from '@/core/fullscreen'
import { S } from '@/data/strings'
import { getGame } from '@/games/registry'
import CategoryScreen from '@/screens/CategoryScreen.vue'
import GameSettingsScreen from '@/screens/GameSettingsScreen.vue'
import NamesScreen from '@/screens/NamesScreen.vue'
import PlayScreen from '@/screens/PlayScreen.vue'
import ProfileScreen from '@/screens/ProfileScreen.vue'
import RoomScreen from '@/screens/RoomScreen.vue'
import RulesScreen from '@/screens/RulesScreen.vue'
import TitleScreen from '@/screens/TitleScreen.vue'
import LaunchOverlay from '@/ui/LaunchOverlay.vue'
import RoomCountdown from '@/ui/RoomCountdown.vue'
import UnlockDialog from '@/ui/UnlockDialog.vue'
import NewsDialog from '@/ui/NewsDialog.vue'
import UpdateDialog from '@/ui/UpdateDialog.vue'
import WelcomeScreen from '@/ui/WelcomeScreen.vue'
import { welcomeDone } from '@/core/welcome'

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
        <TitleScreen v-if="route.name === 'title'" :key="`${routeKey}-${welcomeDone}`" />
        <NamesScreen v-else-if="route.name === 'names'" :key="routeKey" />
        <ProfileScreen v-else-if="route.name === 'profile'" :key="routeKey" />
        <RoomScreen v-else-if="route.name === 'room'" :key="routeKey" />
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
    <UnlockDialog />
    <UpdateDialog />
    <NewsDialog />
    <WelcomeScreen />
    <LaunchOverlay />
    <RoomCountdown />
    <div class="rotate">{{ S.app.rotate }}</div>
    <!-- 全螢幕提示：「再按一次以退出全螢幕」「點一下畫面回到全螢幕」 -->
    <Transition name="fs-hint">
      <p v-if="fsHint" :key="fsHint" class="fs-hint t-black">{{ fsHint }}</p>
    </Transition>
  </main>
</template>

<style scoped>
.fs-hint {
  position: fixed;
  left: 50%;
  top: 0.8rem;
  z-index: 1000;
  translate: -50% 0;
  padding: 0.35rem 1rem;
  border: 0.14rem solid var(--color-ink);
  background: var(--color-yellow);
  box-shadow: 0.25rem 0.25rem 0 var(--color-ink);
  font-size: 0.9rem;
  white-space: nowrap;
  pointer-events: none;
}
.fs-hint-enter-active {
  transition:
    opacity 200ms var(--ease-out),
    transform 300ms var(--ease-back);
}
.fs-hint-leave-active {
  transition:
    opacity 200ms ease-in,
    transform 200ms ease-in;
}
.fs-hint-enter-from,
.fs-hint-leave-to {
  opacity: 0;
  transform: translateY(-0.6rem);
}
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
