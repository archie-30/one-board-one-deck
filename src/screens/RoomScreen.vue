<script setup lang="ts">
// 連線房間頁（最多 4 人）：
//   左邊：房間成員（準備好了／還沒準備／觀戰），空位顯示「等待加入」。
//   右邊：目前的房間模式（跟模式選單一樣的卡片）＋「去選模式」（到房間外的模式選單逛，選好按「更改房間模式」或「推薦此模式」）、
//         房主設定「讓大家都能換模式」（不是房主的人看得到但反灰）、大家推薦的模式。
//   右下：狀態（還差幾人、要幾人改觀戰、幾人準備好了）＋「準備」大按鈕；人比模式多時多一顆「改成觀戰」。
//   大家都準備好、對戰人數剛好就開始（之後接連線時由伺服器開局）。
// 現在還沒接真的連線（見 core/online.ts），只有自己一個人。
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { back, go, setBackGuard } from '@/core/nav'
import { canChangeMode, changeMode, isHost, leaveRoom, online, ROOM_MAX, setAllowOthers, setReady, setSpectator, startState } from '@/core/online'
import { myLook } from '@/core/profile'
import { S } from '@/data/strings'
import { getGame, seatsOf } from '@/games/registry'
import Avatar from '@/ui/art/Avatar.vue'
import Icon from '@/ui/art/Icon.vue'
import Btn from '@/ui/Btn.vue'
import Dialog from '@/ui/Dialog.vue'
import Page from '@/ui/Page.vue'
import Switch from '@/ui/Switch.vue'

const T = S.online
const room = computed(() => online.room)
const game = computed(() => getGame(room.value?.gameId ?? ''))
const seats = computed(() => seatsOf(game.value))
const me = computed(() => room.value?.players.find((p) => p.me) ?? null)
/** 房間永遠 4 格：有人坐的照順序，剩下的是空位 */
const slots = computed(() => Array.from({ length: ROOM_MAX }, (_, i) => room.value?.players[i] ?? null))
const st = computed(() => startState(seats.value))
const status = computed(() => {
  const s = st.value
  if (s.tooMany) return T.status.tooMany(s.tooMany)
  if (s.missing) return T.status.missing(s.missing)
  if (s.canStart) return T.status.go
  return T.status.waitReady(s.readyCount, s.total)
})
/** 人比模式多（或自己已經在觀戰）才出現「改成觀戰／回來對戰」 */
const showWatch = computed(() => !!me.value && (me.value.spectator || (room.value?.players.length ?? 0) > seats.value))
const nameOf = (id: string) => room.value?.players.find((p) => p.id === id)?.name ?? ''

function browse() {
  go({ name: 'category', category: game.value.category })
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
      <!-- 房間成員（最多 4 人） -->
      <section class="seats rise" style="--i: 1">
        <p class="t-label head">
          <span>{{ T.seats }}</span>
          <span class="cnt">{{ T.count(room.players.length, ROOM_MAX) }}</span>
        </p>
        <ul class="list">
          <li v-for="(p, i) in slots" :key="p ? p.id : `empty${i}`" class="seat" :class="{ empty: !p, me: p?.me, watch: p?.spectator }">
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
            <span v-if="p" class="t-label stt" :class="p.spectator ? 'sp' : p.ready ? 'ok' : ''">
              <Icon v-if="p.ready" name="check" class="ck" />{{ p.spectator ? T.st.spectator : p.ready ? T.st.ready : T.st.notReady }}
            </span>
            <span v-else class="wait">{{ T.waiting }}<i /><i /><i /></span>
          </li>
        </ul>
      </section>

      <!-- 房間模式、設定、推薦 -->
      <section class="mode rise" style="--i: 2">
        <div class="now">
          <div class="mcard" :class="`c-${game.category}`">
            <span class="cv halftone"><component :is="game.cover" active /></span>
            <span class="info">
              <span class="t-label cat">{{ T.current }}・{{ T.players(seats) }}</span>
              <span class="nm t-black">{{ game.name }}</span>
              <span class="sm">{{ game.summary }}</span>
            </span>
          </div>
          <div class="side">
            <Btn size="sm" icon="arrow" @click="browse">{{ T.browse }}</Btn>
            <label class="perm" :class="{ off: !isHost }">
              <span>
                <span class="t-black pl">{{ T.allowOthers }}</span>
                <span class="ph">{{ isHost ? T.allowHelp : T.onlyHost }}</span>
              </span>
              <Switch :on="room.allowOthers" :label="T.allowOthers" :disabled="!isHost" @change="setAllowOthers" />
            </label>
            <div v-if="room.recommends.length" class="recs">
              <p class="t-label">{{ T.recommends }}</p>
              <div v-for="r in room.recommends" :key="r.playerId" class="rec">
                <span class="rn">{{ T.recommendBy(nameOf(r.playerId)) }}</span>
                <b class="t-black">{{ getGame(r.gameId).name }}</b>
                <button v-if="canChangeMode" class="t-label use" @click="changeMode(r.gameId, seatsOf(getGame(r.gameId)))">{{ T.useIt }}</button>
              </div>
            </div>
          </div>
        </div>
        <!-- 準備 -->
        <div class="go">
          <p class="t-label stline" :class="{ hot: st.canStart, warn: st.tooMany > 0 }">{{ status }}</p>
          <div class="btns">
            <Btn v-if="showWatch" size="md" :icon="me?.spectator ? 'play' : 'pass'" @click="setSpectator(!me?.spectator)">{{ me?.spectator ? T.play : T.watch }}</Btn>
            <Btn class="readybtn" :tone="me?.ready ? 'ink' : 'red'" size="lg" :icon="me?.ready ? 'close' : 'check'" @click="setReady(!me?.ready)">{{ me?.ready ? T.unready : T.ready }}</Btn>
          </div>
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
  gap: 1.4rem;
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
  gap: 0.4rem;
  overflow-y: auto;
  padding: 0 0.3rem 0.3rem 0;
}
.seat {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  border: 0.13rem solid var(--color-ink);
  background: var(--color-card);
  box-shadow: 0.15rem 0.15rem 0 var(--color-ink);
  padding: 0.25rem 0.55rem 0.25rem 0.35rem;
}
.seat.me {
  border-left: 0.4rem solid var(--color-red);
}
.seat.watch {
  background: var(--color-paper-2);
}
.seat.empty {
  border-style: dashed;
  border-color: var(--color-ink-3);
  background: transparent;
  box-shadow: none;
}
.av {
  display: block;
  width: 2rem;
  height: 2rem;
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
  flex: 1;
  flex-direction: column;
}
.nm {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.92rem;
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
/* 狀態：準備好了（鈷藍）、還沒準備（灰）、觀戰（黑框） */
.stt {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 0.15rem;
  font-size: 0.58rem;
  color: var(--color-ink-3);
}
.stt.ok {
  color: var(--color-blue);
}
.stt.sp {
  border: 0.08rem solid var(--color-ink);
  padding: 0 0.3rem;
  color: var(--color-ink);
}
.ck {
  width: 0.8rem;
  height: 0.8rem;
}
/* 空位：等待加入，三個點輪流閃 */
.wait {
  font-size: 0.78rem;
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
.mode {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 0.5rem;
  min-height: 0;
}
.now {
  display: flex;
  min-height: 0;
  flex: 1;
  gap: 1.1rem;
}
/* 跟模式選單一樣的直式卡片（縮小版） */
.mcard {
  display: flex;
  height: 100%;
  max-height: 16rem;
  aspect-ratio: 0.72;
  flex: none;
  flex-direction: column;
  overflow: hidden;
  border: 0.14rem solid var(--color-ink);
  border-radius: 0.5rem;
  background: var(--color-card);
  box-shadow: 0.3rem 0.3rem 0 var(--color-ink);
}
.c-cards {
  --tone: var(--color-red);
}
.c-board {
  --tone: var(--color-blue);
}
/* 插圖區：跟模式選單的卡片一樣（固定 44% 高、超出的裁掉，動畫不會跑到下面的字上） */
.mcard .cv {
  position: relative;
  display: block;
  height: 44%;
  flex: none;
  overflow: hidden;
  padding: 0.5rem 0.7rem 0.25rem;
  border-bottom: 0.14rem solid var(--color-ink);
  background-color: var(--tone);
  --dot: rgb(251 248 241 / 0.18);
}
.mcard .info {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  padding: 0.45rem 0.65rem;
}
.cat {
  font-size: 0.55rem;
  color: var(--tone);
}
.mcard .nm {
  font-size: 1.25rem;
  line-height: 1.15;
}
.mcard .sm {
  font-size: 0.7rem;
  line-height: 1.4;
  color: var(--color-ink-2);
}
.side {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.6rem;
  overflow-y: auto;
}
/* 「讓大家都能換模式」：不是房主的人看得到但反灰 */
.perm {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  border-top: 0.1rem solid var(--color-line);
  padding-top: 0.5rem;
}
.perm.off {
  opacity: 0.45;
}
.pl {
  display: block;
  font-size: 0.85rem;
}
.ph {
  display: block;
  font-size: 0.65rem;
  color: var(--color-ink-2);
}
.recs {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 0.3rem;
}
.rec {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  font-size: 0.8rem;
}
.rn {
  color: var(--color-ink-2);
}
.use {
  margin-left: auto;
  border-bottom: 0.1rem solid var(--color-ink);
}
.go {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.9rem;
}
.stline {
  min-width: 0;
  flex: 1;
  text-align: right;
  color: var(--color-ink-2);
}
.stline.warn {
  color: var(--color-red);
}
.stline.hot {
  color: var(--color-blue);
}
.btns {
  display: flex;
  align-items: flex-end;
  gap: 0.6rem;
}
.readybtn {
  min-width: 9rem;
}
.readybtn :deep(.lb) {
  text-align: center;
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
