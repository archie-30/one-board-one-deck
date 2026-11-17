<script setup lang="ts">
// 連線房間頁（最多 4 人）：
//   左邊：房間成員（準備好了／還沒準備／觀戰），空位顯示「等待加入」。
//   右邊：目前的房間模式（跟模式選單一樣的卡片；開房時是「未選擇模式」）＋「回到主畫面／撲克牌／棋盤」（到房間外逛模式，人還在房間裡，
//         選好按「更改房間模式」或「推薦此模式」）、
//         房主設定「讓大家都能換模式」（不是房主的人看得到但反灰）、大家推薦的模式。
//   右下：狀態（還差幾人、要幾人改觀戰、幾人準備好了）＋「準備」大按鈕；人比模式多時多一顆「改成觀戰」。
//   大家都準備好、對戰人數不超過模式人數就開始（空位由電腦補上；之後接連線時由伺服器開局）。
//   只有按左下「離開房間」（房主是「解散房間」）才會離開；只剩自己一個人時不用再確認。點成員看玩家資料（彈窗）。
// 現在還沒接真的連線（見 core/online.ts），只有自己一個人。
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { launch as launchFx } from '@/core/launch'
import { back, resetTo, setBackGuard } from '@/core/nav'
import { canChangeMode, changeMode, isHost, kickPlayer, leaveRoom, online, ROOM_MAX, roomCountdown, setReady, setSpectator, startState, type RoomPlayer } from '@/core/online'
import { levelOf, myLook, profile } from '@/core/profile'
import type { GameCategory } from '@/games/types'
import { S } from '@/data/strings'
import { getGame, seatsOf } from '@/games/registry'
import Avatar from '@/ui/art/Avatar.vue'
import Icon from '@/ui/art/Icon.vue'
import Btn from '@/ui/Btn.vue'
import Dialog from '@/ui/Dialog.vue'
import Page from '@/ui/Page.vue'
import { sendRules } from '@/core/onlineMatch'

const T = S.online
/** 開局倒數中：房間裡的按鈕全部反灰，只有「取消準備」能按（取消後倒數停下來才恢復） */
const locked = computed(() => roomCountdown.value > 0)
/** 從對局退回來：不播進場上浮（卡片要飛回這裡，位置一開始就要是定位） */
const returning = launchFx.active && launchFx.mode === 'exit'
const room = computed(() => online.room)
/** 房間模式（開房時還沒選＝null） */
const game = computed(() => (room.value?.gameId ? getGame(room.value.gameId) : null))
const seats = computed(() => (game.value ? seatsOf(game.value) : 0))
const me = computed(() => room.value?.players.find((p) => p.me) ?? null)
/** 房間永遠 4 格：有人坐的照順序，剩下的是空位 */
const slots = computed(() => Array.from({ length: ROOM_MAX }, (_, i) => room.value?.players[i] ?? null))
const st = computed(() => startState(seats.value))
const status = computed(() => {
  const s = st.value
  if (!s.chosen) return T.status.noMode
  if (s.tooMany) return T.status.tooMany(s.tooMany)
  const ai = s.ai ? `　${T.status.ai(s.ai)}` : ''
  if (s.canStart) return (roomCountdown.value > 0 ? T.status.countdown(roomCountdown.value) : T.status.go) + ai
  return T.status.waitReady(s.readyCount, s.total) + ai
})
/** 人比模式多（或自己已經在觀戰）才出現「改成觀戰／回來對戰」；撲克牌先不支援觀戰（只能「回來對戰」） */
const showWatch = computed(() => !!me.value && !!game.value && (me.value.spectator || (game.value.category !== 'cards' && (room.value?.players.length ?? 0) > seats.value)))
const nameOf = (id: string) => room.value?.players.find((p) => p.id === id)?.name ?? ''

/** 到房間外逛模式（人還在房間裡；返回時照主畫面 → 分類的順序退） */
const goHome = () => resetTo([{ name: 'title' }])
const goCat = (category: GameCategory) => resetTo([{ name: 'title' }, { name: 'category', category }])

// 點成員：看玩家資料（自己的照個人資料；別人的等接上連線後由伺服器傳來）
const viewing = ref<RoomPlayer | null>(null)
const viewLevel = computed(() => (viewing.value?.me ? levelOf(profile.xp) : viewing.value?.level))
/** 房主請人出房間：按鈕按第一下變黃「再按一次請出房間」，再按才請出（不另外跳確認視窗） */
const kickArmed = ref(false)
watch(viewing, () => (kickArmed.value = false))
function kick() {
  const p = viewing.value
  if (!p || p.me || !isHost.value || locked.value) return
  if (!kickArmed.value) return void (kickArmed.value = true)
  kickPlayer(p.id)
  viewing.value = null
}
const viewTitles = computed(() => (viewing.value?.me ? profile.equipped : (viewing.value?.titles ?? [])).map((id) => S.profile.titles[id]?.name).filter(Boolean))

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
  // 不在房間裡（例如重新整理後沒接回去）：直接回上一頁
  if (!online.room) return back(true)
  // 返回鍵、Esc＝離開房間：只剩自己一個人就直接離開（房主＝解散），不然先問一下
  setBackGuard(() => {
    // 倒數中不能離開（要先取消準備）
    if (locked.value) return false
    if ((online.room?.players.length ?? 0) <= 1) void leave()
    else leaveOpen.value = true
    return false
  })
})
onBeforeUnmount(() => {
  setBackGuard(null)
  window.clearTimeout(copyTimer)
})
// 被請出房間（房主解散、斷線太久）：回上一頁
watch(
  () => online.room,
  (r) => {
    if (!r && online.closed) back(true)
  },
)
/** 準備／取消準備。房主按準備時，順便把最新的規則設定送給伺服器（開局照這份） */
function toggleReady() {
  const on = !me.value?.ready
  if (on && isHost.value && room.value?.gameId) sendRules(room.value.gameId)
  setReady(on)
}
async function leave() {
  leaveOpen.value = false
  await leaveRoom()
  back(true)
}
</script>

<template>
  <Page :title="T.room" label="ROOM" :num="room?.code ?? ''" :back-label="isHost ? T.disband : T.leave" :back-disabled="locked">
    <div v-if="room" class="wrap" :class="{ settled: returning }">
      <!-- 房間成員（最多 4 人） -->
      <section class="seats rise" style="--i: 1">
        <p class="t-label head">
          <span>{{ T.seats }}</span>
          <span class="cnt">{{ T.count(room.players.length, ROOM_MAX) }}</span>
        </p>
        <ul class="list">
          <li v-for="(p, i) in slots" :key="p ? p.id : `empty${i}`" class="seat" :class="{ empty: !p, me: p?.me, watch: p?.spectator, off: locked }" @click="p && !locked && (viewing = p)">
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
          <!-- 開局時這張卡片拿起來翻面（RoomCountdown）；打完回來卡片飛回這裡（id 跟模式選單的卡片同一套） -->
          <div v-if="game" :id="`mode-${game.id}`" class="mcard" :class="[`c-${game.category}`, { lifted: launchFx.active }]">
            <span class="cv halftone"><component :is="game.cover" active /></span>
            <span class="info">
              <span class="t-label cat">{{ T.current }}・{{ T.players(seats) }}</span>
              <span class="nm t-black">{{ game.name }}</span>
              <span class="sm">{{ game.summary }}</span>
            </span>
          </div>
          <!-- 開房時還沒選模式 -->
          <div v-else class="mcard empty">
            <span class="cv" />
            <span class="info">
              <span class="t-label cat">{{ T.current }}</span>
              <span class="nm t-black">{{ T.noMode }}</span>
              <span class="sm">{{ T.noModeLead }}</span>
            </span>
          </div>
          <div class="side">
            <!-- 到房間外逛模式（人還在房間裡） -->
            <div class="nav">
              <Btn size="sm" icon="home" :disabled="locked" @click="goHome">{{ T.home }}</Btn>
              <Btn size="sm" tone="red" :disabled="locked" @click="goCat('cards')">{{ T.goCards }}</Btn>
              <Btn size="sm" tone="blue" :disabled="locked" @click="goCat('board')">{{ T.goBoard }}</Btn>
            </div>
            <div v-if="room.recommends.length" class="recs">
              <p class="t-label">{{ T.recommends }}</p>
              <div v-for="r in room.recommends" :key="r.playerId" class="rec">
                <span class="rn">{{ T.recommendBy(nameOf(r.playerId)) }}</span>
                <b class="t-black">{{ getGame(r.gameId).name }}</b>
                <button v-if="canChangeMode" class="t-label use" :disabled="locked" @click="changeMode(r.gameId, seatsOf(getGame(r.gameId)))">{{ T.useIt }}</button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>

    <template #foot>
      <button class="copy" :aria-label="T.copy" :disabled="locked" @click="copy">
        <Icon :name="copied ? 'check' : 'copy'" class="ci" />
        <span class="t-label">{{ copied ? T.copied : T.copy }}</span>
      </button>
      <!-- 準備：右下角，跟左下的離開房間同一排 -->
      <p class="t-label stline" :class="{ hot: st.canStart, warn: st.tooMany > 0 }">{{ status }}</p>
      <Btn v-if="showWatch" :disabled="locked" :icon="me?.spectator ? 'play' : 'pass'" @click="setSpectator(!me?.spectator)">{{ me?.spectator ? T.play : T.watch }}</Btn>
      <Btn class="readybtn" :tone="me?.ready ? 'ink' : 'red'" :icon="me?.ready ? 'close' : 'check'" :disabled="!game" @click="toggleReady">{{ me?.ready ? T.unready : T.ready }}</Btn>
    </template>

    <Dialog :open="leaveOpen" :title="isHost ? T.disbandAsk : T.leaveAsk" label="ROOM" tone="ink" @close="leaveOpen = false">
      <p class="text-[0.9rem] text-ink-2">{{ isHost ? T.disbandLead : T.leaveLeadGuest }}</p>
      <template #actions>
        <div class="grid w-full grid-cols-2 gap-[0.8rem]">
          <Btn block @click="leaveOpen = false">{{ T.stay }}</Btn>
          <Btn tone="red" block icon="exit" @click="leave">{{ isHost ? T.disband : T.leave }}</Btn>
        </div>
      </template>
    </Dialog>

    <!-- 玩家資料 -->
    <Dialog :open="viewing !== null" :title="T.profileTitle" label="PLAYER" tone="blue" close-x @close="viewing = null">
      <div v-if="viewing" class="pv">
        <span class="pav"><Avatar :look="viewing.me ? myLook() : (viewing.look ?? { shape: 'circle', tone: 'card', fill: 'solid' })" mood="happy" /></span>
        <div class="pinfo">
          <p class="pname">
            <b class="t-black">{{ viewing.name }}</b>
            <span v-if="viewLevel" class="t-slab plv">{{ S.profile.lv(viewLevel) }}</span>
          </p>
          <p class="ptags">
            <span v-if="viewing.host" class="t-label tag host">{{ T.host }}</span>
            <span v-for="t in viewTitles" :key="t" class="t-black ptitle">{{ t }}</span>
          </p>
          <p v-if="viewing.me" class="prec"><span class="t-label">{{ T.pRecord }}</span>{{ T.pRecordLine(profile.played, Object.values(profile.games).reduce((a, g) => a + g.wins, 0)) }}</p>
          <p v-else class="pnote">{{ T.pNoInfo }}</p>
        </div>
      </div>
      <template v-if="viewing && !viewing.me && isHost" #actions>
        <Btn :tone="kickArmed ? 'yellow' : 'plain'" icon="exit" :disabled="locked || room?.phase === 'playing'" @click="kick">{{ kickArmed ? T.kickConfirm : T.kick }}</Btn>
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
  align-items: flex-start;
  gap: 1.1rem;
  /* 卡片高度照這一塊實際的高度算（寬度再照 0.72 比例），不會被擠成奇怪的比例 */
  container-type: size;
}
/* 跟模式選單一樣的直式卡片（縮小版） */
.mcard {
  display: flex;
  height: min(100cqh, 17rem);
  width: auto;
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
.stline {
  min-width: 0;
  flex: 1;
  margin-right: 0.3rem;
  text-align: right;
  color: var(--color-ink-2);
}
.stline.warn {
  color: var(--color-red);
}
.stline.hot {
  color: var(--color-blue);
}
.readybtn {
  min-width: 8rem;
}
.readybtn :deep(.lb) {
  text-align: center;
}
.seat:not(.empty) {
  cursor: pointer;
}
/* 未選擇模式：虛線卡片 */
.mcard.empty {
  border-style: dashed;
  box-shadow: none;
  background: transparent;
}
.mcard.empty .cv {
  background: var(--color-paper-2);
  border-bottom-style: dashed;
}
.mcard.empty .nm {
  font-size: 1.05rem;
  white-space: nowrap;
}
.mcard.empty .cat {
  color: var(--color-ink-3);
}
.nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}
.pv {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.pav {
  display: block;
  width: 4.4rem;
  height: 4.4rem;
  flex: none;
}
.pav :deep(svg) {
  width: 100%;
  height: 100%;
}
.pinfo {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.35rem;
}
.pname {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  font-size: 1.3rem;
}
.plv {
  font-size: 1rem;
  color: var(--color-red);
}
.ptags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}
.ptitle {
  background: var(--color-red);
  color: var(--color-card);
  padding: 0 0.45rem;
  font-size: 0.75rem;
}
.prec {
  display: flex;
  gap: 0.5rem;
  align-items: baseline;
  font-size: 0.85rem;
}
.pnote {
  font-size: 0.75rem;
  color: var(--color-ink-3);
}
/* 開局／打完回來：卡片在過場層裡飛，這裡先藏起來 */
.mcard.lifted {
  visibility: hidden;
}
/* 過場層複製這張卡片時，大小跟著過場層 */
.mcard.launch-clone {
  width: 100%;
  height: 100%;
}
.settled .rise,
.settled.rise {
  animation: none;
}
/* 倒數中反灰 */
.seat.off {
  cursor: default;
  opacity: 0.5;
}
.use:disabled,
.copy:disabled {
  opacity: 0.4;
  cursor: default;
}
/* 底下：複製房號（返回鍵的右邊） */
.copy {
  display: flex;
  align-items: center;
  flex: none;
  gap: 0.35rem;
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
