<script setup lang="ts">
// 連線房間頁：左邊是座位（你、其他玩家、空位），右邊房主選遊戲，右下「開始遊戲」。
// 房號在右上角大大顯示，下面可以複製給朋友。離開房間會先問一下。
// 現在還沒接真的連線（見 core/online.ts），空位會一直顯示「等待加入…」。
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { playSound } from '@/core/audio'
import { back, setBackGuard } from '@/core/nav'
import { leaveRoom, online, setRoomGame } from '@/core/online'
import { myLook } from '@/core/profile'
import { S } from '@/data/strings'
import { getGame, onlineGames, seatsOf } from '@/games/registry'
import type { GameCategory } from '@/games/types'
import Avatar from '@/ui/art/Avatar.vue'
import Icon from '@/ui/art/Icon.vue'
import Btn from '@/ui/Btn.vue'
import Dialog from '@/ui/Dialog.vue'
import Page from '@/ui/Page.vue'
import Tabs from '@/ui/Tabs.vue'

const T = S.online
const room = computed(() => online.room)
const game = computed(() => getGame(room.value?.gameId ?? ''))
const seats = computed(() => seatsOf(game.value))
const isHost = computed(() => !!room.value?.players.find((p) => p.me)?.host)
/** 座位：有人坐的照順序，剩下的是空位 */
const slots = computed(() => {
  const ps = room.value?.players ?? []
  return Array.from({ length: Math.max(seats.value, ps.length) }, (_, i) => ps[i] ?? null)
})
const missing = computed(() => Math.max(0, seats.value - (room.value?.players.length ?? 0)))

const cat = ref<GameCategory>(game.value.category)
const cats = (['cards', 'board'] as const).map((value) => ({ value, label: S.category[value].title }))
const list = computed(() => onlineGames(cat.value))
function pick(id: string) {
  if (!isHost.value || id === room.value?.gameId) return
  playSound('tap')
  void setRoomGame(id)
}

// 複製房號
const copied = ref(false)
let copyTimer = 0
async function copy() {
  if (!room.value) return
  try {
    await navigator.clipboard.writeText(room.value.code)
  } catch {
    // 不能用剪貼簿（例如沒權限）：房號就在畫面上，自己記也可以
  }
  copied.value = true
  window.clearTimeout(copyTimer)
  copyTimer = window.setTimeout(() => (copied.value = false), 1400)
}

// 離開房間：先問一下
const leaveOpen = ref(false)
onMounted(() => {
  // 重新整理後房間就不在了（還沒接連線）：直接回上一頁
  if (!online.room) return back(true)
  setBackGuard(() => {
    leaveOpen.value = true
    return false
  })
})
onBeforeUnmount(() => {
  setBackGuard(null)
  window.clearTimeout(copyTimer)
})
async function leave() {
  leaveOpen.value = false
  await leaveRoom()
  back(true)
}
</script>

<template>
  <Page :title="T.room" label="ROOM" :num="room?.code ?? ''" :back-label="T.leave">
    <div v-if="room" class="wrap">
      <!-- 座位 -->
      <section class="seats rise" style="--i: 1">
        <p class="t-label head">
          <span>{{ T.seats }}</span>
          <span class="cnt">{{ T.ready(room.players.length, seats) }}</span>
        </p>
        <TransitionGroup name="seat" tag="ul" class="list">
          <li v-for="(p, i) in slots" :key="p ? p.id : `empty${i}`" class="seat" :class="{ empty: !p, me: p?.me }">
            <span class="av">
              <Avatar v-if="p" :look="p.me ? myLook() : (p.look ?? { shape: 'circle', tone: 'card', fill: 'solid' })" />
              <span v-else class="hole" />
            </span>
            <span v-if="p" class="who">
              <span class="t-black nm">{{ p.name }}</span>
              <span class="tags">
                <span v-if="p.host" class="t-label tag host">{{ T.host }}</span>
                <span v-if="p.me" class="t-label tag">{{ T.you }}</span>
              </span>
            </span>
            <span v-else class="wait">{{ T.waiting }}<i /><i /><i /></span>
          </li>
        </TransitionGroup>
      </section>

      <!-- 選遊戲 -->
      <section class="pick rise" style="--i: 2">
        <div class="bar">
          <Tabs :choices="cats" :value="cat" @change="(v) => (cat = v as GameCategory)" />
          <span v-if="!isHost" class="t-label note">{{ T.onlyHost }}</span>
        </div>
        <ul class="games scroll-y">
          <li v-for="g in list" :key="g.id">
            <button class="g" :class="[`c-${g.category}`, { on: g.id === room.gameId }]" :disabled="!isHost" @click="pick(g.id)">
              <span class="t-black gn">{{ g.name }}</span>
              <span class="t-label gp">{{ g.tags[0] }}</span>
            </button>
          </li>
        </ul>
        <div class="go">
          <span class="t-label miss">{{ missing ? T.needMore(missing) : '' }}</span>
          <Btn tone="red" size="lg" arrow :disabled="missing > 0 || !isHost">{{ T.start }}</Btn>
        </div>
      </section>
    </div>

    <template #foot>
      <button class="copy" :aria-label="T.copy" @click="copy">
        <Icon :name="copied ? 'check' : 'copy'" class="ci" />
        <span class="t-label">{{ copied ? T.copied : T.copy }}</span>
      </button>
    </template>

    <Dialog :open="leaveOpen" :title="T.leaveAsk" label="ROOM" tone="ink" @close="leaveOpen = false">
      <p class="text-[0.9rem] text-ink-2">{{ isHost ? T.leaveLead : T.leaveLeadGuest }}</p>
      <template #actions>
        <div class="grid w-full grid-cols-2 gap-[0.8rem]">
          <Btn block @click="leaveOpen = false">{{ T.stay }}</Btn>
          <Btn tone="red" block icon="exit" @click="leave">{{ T.leave }}</Btn>
        </div>
      </template>
    </Dialog>
  </Page>
</template>

<style scoped>
.wrap {
  display: flex;
  height: 100%;
  gap: 1.6rem;
}
.seats {
  display: flex;
  width: 15rem;
  flex: none;
  flex-direction: column;
  min-height: 0;
}
.head {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.4rem;
}
.cnt {
  color: var(--color-red);
}
.list {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 0.45rem;
  overflow-y: auto;
  padding: 0 0.3rem 0.3rem 0;
}
.seat {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  border: 0.13rem solid var(--color-ink);
  background: var(--color-card);
  box-shadow: 0.15rem 0.15rem 0 var(--color-ink);
  padding: 0.3rem 0.6rem 0.3rem 0.35rem;
}
.seat.me {
  border-left: 0.4rem solid var(--color-red);
}
.seat.empty {
  border-style: dashed;
  border-color: var(--color-ink-3);
  background: transparent;
  box-shadow: none;
}
.av {
  display: block;
  width: 2.2rem;
  height: 2.2rem;
  flex: none;
}
.av :deep(svg) {
  width: 100%;
  height: 100%;
}
.hole {
  display: block;
  width: 100%;
  height: 100%;
  border: 0.13rem dashed var(--color-ink-3);
  border-radius: 50%;
}
.who {
  display: flex;
  min-width: 0;
  flex-direction: column;
}
.nm {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.95rem;
}
.tags {
  display: flex;
  gap: 0.25rem;
}
.tag {
  border: 0.08rem solid var(--color-ink);
  padding: 0 0.3rem;
  font-size: 0.55rem;
}
.tag.host {
  border-color: var(--color-yellow);
  background: var(--color-yellow);
}
/* 空位：等待加入，三個點輪流閃 */
.wait {
  font-size: 0.8rem;
  color: var(--color-ink-3);
}
.wait i {
  display: inline-block;
  width: 0.22rem;
  height: 0.22rem;
  margin-left: 0.15rem;
  border-radius: 50%;
  background: currentColor;
  animation: blink 1.2s ease-in-out infinite;
}
.wait i:nth-child(2) {
  animation-delay: 0.2s;
}
.wait i:nth-child(3) {
  animation-delay: 0.4s;
}
@keyframes blink {
  0%,
  100% {
    opacity: 0.2;
  }
  40% {
    opacity: 1;
  }
}
/* 座位數變了（換遊戲）：多出來的空位上浮、少掉的縮掉 */
.seat-enter-active {
  transition:
    opacity 240ms ease,
    transform 300ms var(--ease-out);
}
.seat-enter-from {
  opacity: 0;
  transform: translateY(0.6rem);
}
.seat-leave-active {
  transition:
    opacity 160ms ease,
    transform 160ms ease;
}
.seat-leave-to {
  opacity: 0;
  transform: scale(0.94);
}
.pick {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 0.6rem;
}
.bar {
  display: flex;
  align-items: center;
  gap: 0.8rem;
}
.note {
  color: var(--color-ink-3);
}
.games {
  display: grid;
  min-height: 0;
  flex: 1;
  grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr));
  align-content: start;
  gap: 0.55rem;
  padding: 0.1rem 0.4rem 0.4rem 0.1rem;
}
.g {
  display: flex;
  width: 100%;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.1rem;
  border: 0.13rem solid var(--color-ink);
  border-left: 0.4rem solid var(--tone);
  background: var(--color-card);
  box-shadow: 0.15rem 0.15rem 0 var(--color-ink);
  padding: 0.35rem 0.6rem;
  text-align: left;
  transition:
    transform 110ms var(--ease-out),
    background-color 200ms ease,
    color 200ms ease;
}
.g:active:not(:disabled) {
  transform: translate(0.15rem, 0.15rem);
  box-shadow: none;
}
.g.on {
  background: var(--color-ink);
  color: var(--color-card);
}
.g:disabled:not(.on) {
  opacity: 0.55;
}
.c-cards {
  --tone: var(--color-red);
}
.c-board {
  --tone: var(--color-blue);
}
.gn {
  font-size: 1rem;
}
.gp {
  font-size: 0.55rem;
  opacity: 0.75;
}
.go {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.9rem;
}
.miss {
  color: var(--color-ink-3);
}
/* 底下：複製房號（返回鍵的右邊） */
.copy {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin-right: auto;
  border-bottom: 0.13rem solid var(--color-ink);
  padding: 0.2rem 0.1rem;
}
.ci {
  width: 0.95rem;
  height: 0.95rem;
}
@media (prefers-reduced-motion: reduce) {
  .wait i {
    animation: none;
  }
}
</style>
