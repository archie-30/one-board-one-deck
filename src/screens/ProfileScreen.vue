<script setup lang="ts">
// 個人資料頁（獨立一頁，不是彈窗）：左邊是頭像、名字、裝備的稱號、等級與經驗，最下面一格說明（點了稱號或頭像零件就換成它怎麼解鎖）；
// 右邊分頁看稱號、換頭像、看戰績。改的東西先放在草稿，按左下「儲存」才生效；
// 沒儲存就返回，會問「儲存／再看看／不儲存並返回」。
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { playSound } from '@/core/audio'
import { back, setBackGuard } from '@/core/nav'
import { hasTitle, levelOf, levelProgress, profile, safeLook, saveProfile, tidyName, type Part } from '@/core/profile'
import { NAME_MAX_WIDTH } from '@/data/namePool'
import { AVATAR_ACCS, AVATAR_FILLS, AVATAR_SHAPES, AVATAR_TONES, LEVEL_CAP_SHOWN, TITLE_SLOTS, TITLES } from '@/data/profile'
import { S } from '@/data/strings'
import { GAMES } from '@/games/registry'
import Avatar from '@/ui/art/Avatar.vue'
import Icon from '@/ui/art/Icon.vue'
import type { Look } from '@/ui/art/look'
import Btn from '@/ui/Btn.vue'
import Dialog from '@/ui/Dialog.vue'
import Page from '@/ui/Page.vue'
import Tabs from '@/ui/Tabs.vue'

const T = S.profile
const lv = computed(() => levelOf(profile.xp))
const prog = computed(() => levelProgress(profile.xp))

// ── 草稿：按「儲存」才寫回 ──
const draft = reactive({ name: profile.name, equipped: profile.equipped.slice(), look: safeLook(profile.look) })
const dirty = computed(
  () => tidyName(draft.name) !== profile.name || draft.equipped.join() !== profile.equipped.join() || JSON.stringify(draft.look) !== JSON.stringify(safeLook(profile.look)),
)
const savedFlash = ref(false)
let flashTimer = 0
function save() {
  if (!dirty.value) return
  saveProfile(draft)
  draft.name = profile.name
  playSound('correct')
  savedFlash.value = true
  window.clearTimeout(flashTimer)
  flashTimer = window.setTimeout(() => (savedFlash.value = false), 1400)
}

// 返回時還沒儲存：先問
const leaveOpen = ref(false)
onMounted(() =>
  setBackGuard(() => {
    if (!dirty.value) return true
    leaveOpen.value = true
    return false
  }),
)
onBeforeUnmount(() => {
  setBackGuard(null)
  window.clearTimeout(flashTimer)
})
function leaveSave() {
  saveProfile(draft)
  leaveOpen.value = false
  back(true)
}
function leaveDiscard() {
  leaveOpen.value = false
  back(true)
}

// ── 分頁 ──
const tab = ref<'titles' | 'avatar' | 'record'>('titles')
const tabs = (['titles', 'avatar', 'record'] as const).map((value) => ({ value, label: T.tabs[value] }))
function switchTab(v: string) {
  tab.value = v as typeof tab.value
  info.value = null
}
const gotCount = computed(() => TITLES.filter((t) => hasTitle(t.id)).length)

// ── 左下說明格：平常是經驗說明；點了稱號或頭像零件就換成它的解鎖方式 ──
const info = ref<{ key: string; name: string; how: string; got: boolean } | null>(null)

/** 點稱號：解鎖的就裝上／拿下（最多 2 個，滿了換掉最早裝的）；都在左下顯示怎麼解鎖 */
function pickTitle(id: string) {
  playSound('tap')
  const got = hasTitle(id)
  info.value = { key: `t${id}`, name: T.titles[id].name, how: T.titles[id].how, got }
  if (!got) return
  const i = draft.equipped.indexOf(id)
  if (i >= 0) draft.equipped.splice(i, 1)
  else {
    if (draft.equipped.length >= TITLE_SLOTS) draft.equipped.shift()
    draft.equipped.push(id)
  }
}

const parts: { part: Part; list: { value: string; level: number }[]; names: Record<string, string> }[] = [
  { part: 'shape', list: AVATAR_SHAPES, names: T.shapes },
  { part: 'tone', list: AVATAR_TONES, names: T.tones },
  { part: 'fill', list: AVATAR_FILLS, names: T.fills },
  { part: 'acc', list: AVATAR_ACCS, names: T.accs },
]
/** 換掉一個零件後的長相（預覽用） */
const withPart = (part: Part, value: string): Look => ({ ...draft.look, [part]: value })
function pickPart(part: Part, value: string, level: number, name: string) {
  playSound('tap')
  const got = level <= lv.value
  info.value = { key: `p${part}${value}`, name: `${T.parts[part]}・${name}`, how: level > 1 ? T.partHow(level) : '一開始就有', got }
  if (got) draft.look = withPart(part, value)
}

const totals = computed(() => {
  const g = Object.values(profile.games)
  const wins = g.reduce((a, x) => a + x.wins, 0)
  return { played: profile.played, wins, rate: profile.played ? Math.round((wins / profile.played) * 100) : 0 }
})
</script>

<template>
  <Page :title="T.title" label="PROFILE" :num="T.lv(lv)">
    <div class="wrap">
      <aside class="me rise" style="--i: 1">
        <div class="who">
          <div class="big">
            <Transition name="swap" mode="out-in">
              <span :key="JSON.stringify(draft.look)" class="bigav"><Avatar :look="draft.look" /></span>
            </Transition>
            <span class="t-slab lvb" :class="{ max: lv >= LEVEL_CAP_SHOWN }">{{ lv }}</span>
          </div>
          <div class="id">
            <input
              v-model="draft.name"
              class="t-black name"
              type="text"
              :maxlength="NAME_MAX_WIDTH"
              :placeholder="T.defaultName"
              :aria-label="T.namePh"
              enterkeyhint="done"
              autocomplete="off"
              spellcheck="false"
              @keydown.enter="($event.target as HTMLInputElement).blur()"
            />
            <TransitionGroup name="tag" tag="div" class="tags">
              <span v-for="id in draft.equipped" :key="id" class="t-black cur">{{ T.titles[id]?.name }}</span>
              <span v-if="!draft.equipped.length" key="none" class="none">{{ T.noTitle }}</span>
            </TransitionGroup>
          </div>
        </div>
        <div class="xp">
          <span class="bar"><span :style="{ width: `${(prog.into / prog.need) * 100}%` }" /></span>
          <span class="t-label nxt">{{ T.xpNext(prog.need - prog.into, lv + 1) }}</span>
          <span class="t-label tot">{{ T.xpTotal(profile.xp) }}</span>
        </div>
        <!-- 說明格：經驗怎麼算 ↔ 點到的稱號／零件怎麼解鎖 -->
        <div class="note">
          <Transition name="note" mode="out-in">
            <div v-if="info" :key="info.key" class="ninfo">
              <span class="t-label st" :class="{ got: info.got }"><Icon v-if="!info.got" name="lock" class="lk" />{{ info.got ? T.got : T.locked }}</span>
              <span class="t-black nn">{{ info.name }}</span>
              <span class="nh"><span class="text-ink-2">{{ T.howTo }}：</span>{{ info.how }}</span>
            </div>
            <p v-else key="xp" class="how">
              <span v-for="(l, i) in T.howXp" :key="i">{{ l }}<br /></span>
            </p>
          </Transition>
        </div>
      </aside>

      <section class="side rise" style="--i: 2">
        <div class="bar-top">
          <Tabs :choices="tabs" :value="tab" @change="switchTab" />
          <span class="t-label cnt">{{ tab === 'titles' ? T.titleCount(gotCount, TITLES.length) : '' }}</span>
        </div>
        <div class="scroll-y list">
          <Transition name="tab" mode="out-in">
            <!-- 稱號 -->
            <div v-if="tab === 'titles'" key="titles">
              <p class="hint">{{ T.slotsHint }}</p>
              <ul class="titles">
                <li v-for="t in TITLES" :key="t.id">
                  <button class="tt" :class="{ locked: !hasTitle(t.id), on: draft.equipped.includes(t.id), sel: info?.key === `t${t.id}` }" @click="pickTitle(t.id)">
                    <Icon v-if="!hasTitle(t.id)" name="lock" class="lk" />
                    <span class="t-black">{{ T.titles[t.id].name }}</span>
                    <Transition name="badge">
                      <span v-if="draft.equipped.includes(t.id)" class="t-label use">{{ T.equipped }}</span>
                    </Transition>
                  </button>
                </li>
              </ul>
            </div>
            <!-- 頭像 -->
            <div v-else-if="tab === 'avatar'" key="avatar" class="parts">
              <div v-for="p in parts" :key="p.part" class="prow">
                <span class="t-label pl">{{ T.parts[p.part] }}</span>
                <div class="opts">
                  <button
                    v-for="o in p.list"
                    :key="o.value"
                    class="opt"
                    :class="{ on: draft.look[p.part] === o.value || (p.part === 'acc' && !draft.look.acc && o.value === 'none'), locked: o.level > lv }"
                    :aria-label="p.names[o.value]"
                    @click="pickPart(p.part, o.value, o.level, p.names[o.value])"
                  >
                    <span class="oav"><Avatar :look="withPart(p.part, o.value)" /></span>
                    <span class="t-label on-name"><Icon v-if="o.level > lv" name="lock" class="lk" />{{ o.level > lv ? T.partLocked(o.level) : p.names[o.value] }}</span>
                  </button>
                </div>
              </div>
            </div>
            <!-- 戰績 -->
            <div v-else key="record" class="rec">
              <div class="sum">
                <div><span class="t-label">{{ T.record.played }}</span><span class="t-slab n">{{ totals.played }}</span></div>
                <div><span class="t-label">{{ T.record.wins }}</span><span class="t-slab n">{{ totals.wins }}</span></div>
                <div><span class="t-label">{{ T.record.rate }}</span><span class="t-slab n">{{ totals.rate }}%</span></div>
              </div>
              <ul class="games">
                <li v-for="g in GAMES" :key="g.id" :class="`c-${g.category}`">
                  <span class="t-black gn">{{ g.name }}</span>
                  <span class="gr">{{ profile.games[g.id] ? T.record.game(profile.games[g.id].played, profile.games[g.id].wins) : T.record.none }}</span>
                </li>
              </ul>
            </div>
          </Transition>
        </div>
      </section>
    </div>

    <template #foot>
      <div class="save">
        <Btn icon="check" size="sm" :disabled="!dirty" @click="save">{{ savedFlash ? T.saved : T.save }}</Btn>
      </div>
    </template>

    <Dialog :open="leaveOpen" :title="T.leave.title" label="UNSAVED" tone="ink" @close="leaveOpen = false">
      <p class="text-[0.9rem] text-ink-2">{{ T.leave.lead }}</p>
      <template #actions>
        <div class="three">
          <Btn size="sm" @click="leaveSave">{{ T.leave.save }}</Btn>
          <Btn size="sm" @click="leaveOpen = false">{{ T.leave.stay }}</Btn>
          <Btn size="sm" @click="leaveDiscard">{{ T.leave.discard }}</Btn>
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
.me {
  display: flex;
  width: 15rem;
  flex: none;
  flex-direction: column;
  gap: 0.5rem;
  min-height: 0;
}
.who {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  padding-top: 0.2rem;
}
.id {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.35rem;
}
.big {
  position: relative;
  width: 4.2rem;
  height: 4.2rem;
  flex: none;
}
.bigav {
  display: block;
  width: 100%;
  height: 100%;
}
.bigav :deep(svg) {
  width: 100%;
  height: 100%;
}
/* 換頭像：舊的縮小轉走，新的彈出來 */
.swap-leave-active {
  transition:
    transform 140ms ease-in,
    opacity 140ms ease-in;
}
.swap-leave-to {
  transform: scale(0.6) rotate(-12deg);
  opacity: 0;
}
.swap-enter-active {
  animation: pop-in 420ms var(--ease-back);
}
@keyframes pop-in {
  from {
    transform: scale(0.5) rotate(10deg);
    opacity: 0;
  }
  60% {
    transform: scale(1.12) rotate(-3deg);
    opacity: 1;
  }
}
.lvb {
  position: absolute;
  right: -0.6rem;
  bottom: -0.2rem;
  z-index: 1;
  min-width: 2rem;
  border: 0.13rem solid var(--color-ink);
  background: var(--color-yellow);
  box-shadow: 0.12rem 0.12rem 0 var(--color-ink);
  padding: 0.1rem 0.3rem;
  text-align: center;
  font-size: 0.95rem;
  line-height: 1.1;
}
.lvb.max {
  background: var(--color-red);
  color: var(--color-card);
}
.name {
  width: 100%;
  border: 0.13rem solid var(--color-ink);
  background: var(--color-card);
  box-shadow: 0.15rem 0.15rem 0 var(--color-ink);
  padding: 0.15rem 0.45rem;
  font-size: 1rem;
  outline: none;
}
.name:focus {
  border-color: var(--color-blue);
  box-shadow: 0.15rem 0.15rem 0 var(--color-blue);
}
.name::placeholder {
  color: var(--color-ink-2);
}
.tags {
  position: relative;
  display: flex;
  min-height: 1.45rem;
  flex-wrap: wrap;
  gap: 0.3rem;
}
.cur {
  background: var(--color-red);
  color: var(--color-card);
  padding: 0.05rem 0.5rem;
  font-size: 0.8rem;
  white-space: nowrap;
}
.none {
  font-size: 0.75rem;
  color: var(--color-ink-3);
}
/* 裝上稱號：從下面彈上來；拿下：縮小消失 */
.tag-enter-active {
  animation: tag-in 380ms var(--ease-back);
}
@keyframes tag-in {
  from {
    transform: translateY(0.8rem) scale(0.7);
    opacity: 0;
  }
}
.tag-leave-active {
  position: absolute;
  transition:
    transform 160ms ease-in,
    opacity 160ms ease-in;
}
.tag-leave-to {
  transform: scale(0.6);
  opacity: 0;
}
.tag-move {
  transition: transform 260ms var(--ease-out);
}
.xp {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 0.2rem;
}
.xp .bar {
  display: block;
  height: 0.55rem;
  border: 0.13rem solid var(--color-ink);
  background: var(--color-paper);
}
.xp .bar span {
  display: block;
  height: 100%;
  background: var(--color-red);
}
.nxt {
  font-size: 0.68rem;
}
.tot {
  font-size: 0.62rem;
  color: var(--color-ink-3);
}
.note {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  border-top: 0.13rem dashed var(--color-ink-3);
  padding-top: 0.45rem;
}
.how {
  font-size: 0.7rem;
  line-height: 1.5;
  color: var(--color-ink-2);
}
.ninfo {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.2rem;
}
.st {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  color: var(--color-ink-3);
}
.st.got {
  color: var(--color-red);
}
.nn {
  font-size: 1.1rem;
}
.nh {
  font-size: 0.82rem;
  line-height: 1.45;
}
.note-enter-active,
.note-leave-active {
  transition:
    transform 180ms var(--ease-out),
    opacity 180ms ease;
}
.note-enter-from {
  transform: translateY(0.5rem);
  opacity: 0;
}
.note-leave-to {
  transform: translateY(0.4rem);
  opacity: 0;
}
.side {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 0.5rem;
}
.bar-top {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  margin-top: -0.1rem;
}
.cnt {
  margin-left: auto;
  color: var(--color-ink-2);
}
.list {
  min-height: 0;
  flex: 1;
  overflow-x: hidden;
  padding: 0.2rem 0.6rem 0.5rem 0.15rem;
}
/* 換分頁：舊的往下沉、新的往上浮 */
.tab-leave-active {
  transition:
    transform 150ms ease-in,
    opacity 150ms ease-in;
}
.tab-leave-to {
  transform: translateY(0.8rem);
  opacity: 0;
}
.tab-enter-active {
  transition:
    transform 300ms var(--ease-out),
    opacity 220ms ease;
}
.tab-enter-from {
  transform: translateY(1rem);
  opacity: 0;
}
.hint {
  margin-bottom: 0.65rem;
  font-size: 0.7rem;
  color: var(--color-ink-3);
}
.titles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(8.2rem, 1fr));
  gap: 0.65rem 0.5rem;
}
.tt {
  position: relative;
  display: flex;
  width: 100%;
  min-height: 2.3rem;
  align-items: center;
  justify-content: center;
  gap: 0.3rem;
  border: 0.13rem solid var(--color-ink);
  background: var(--color-card);
  box-shadow: 0.15rem 0.15rem 0 var(--color-ink);
  padding: 0.2rem 0.4rem;
  font-size: 0.9rem;
  transition:
    transform 110ms var(--ease-out),
    background-color 200ms ease,
    color 200ms ease;
}
.tt:active {
  transform: translate(0.15rem, 0.15rem);
  box-shadow: none;
}
.tt.on {
  background: var(--color-ink);
  color: var(--color-card);
}
.tt.locked {
  border-color: var(--color-ink-3);
  background: var(--color-paper-2);
  box-shadow: 0.15rem 0.15rem 0 var(--color-ink-3);
  color: var(--color-ink-3);
}
.tt.sel {
  outline: 0.13rem solid var(--color-red);
  outline-offset: 0.12rem;
}
.lk {
  width: 0.85em;
  height: 0.85em;
  flex: none;
}
.use {
  position: absolute;
  top: -0.55rem;
  right: 0.3rem;
  background: var(--color-red);
  color: var(--color-card);
  padding: 0 0.3rem;
  font-size: 0.55rem;
}
.badge-enter-active {
  animation: tag-in 320ms var(--ease-back);
}
.badge-leave-active {
  transition: opacity 120ms ease;
}
.badge-leave-to {
  opacity: 0;
}
.parts {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}
.prow {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
}
.pl {
  width: 2.4rem;
  flex: none;
  padding-top: 0.9rem;
}
.opts {
  display: flex;
  flex-wrap: wrap;
  gap: 0.2rem;
}
.opt {
  display: flex;
  width: 3.4rem;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  border: 0.13rem solid transparent;
  padding: 0.25rem 0.1rem 0.15rem;
  transition: border-color 160ms ease;
}
.opt.on {
  border-color: var(--color-red);
  background: var(--color-card);
}
.opt.locked .oav {
  opacity: 0.3;
  filter: grayscale(1);
}
.opt.locked .on-name {
  color: var(--color-ink-3);
}
.oav {
  display: block;
  width: 2rem;
  height: 2rem;
}
.oav :deep(svg) {
  width: 100%;
  height: 100%;
}
.on-name {
  display: inline-flex;
  align-items: center;
  gap: 0.1rem;
  font-size: 0.54rem;
  letter-spacing: 0.04em;
  white-space: nowrap;
}
.sum {
  display: flex;
  gap: 2rem;
  margin-bottom: 0.7rem;
}
.sum > div {
  display: flex;
  flex-direction: column;
}
.n {
  font-size: 1.7rem;
  line-height: 1.1;
}
.games {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
  gap: 0.35rem 1.2rem;
}
.games li {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.6rem;
  border-bottom: 0.1rem solid var(--color-line);
  border-left: 0.3rem solid var(--tone);
  padding: 0.2rem 0 0.2rem 0.5rem;
}
.c-cards {
  --tone: var(--color-red);
}
.c-board {
  --tone: var(--color-blue);
}
.gn {
  font-size: 0.9rem;
}
.gr {
  font-size: 0.75rem;
  color: var(--color-ink-2);
}
/* 儲存放在左下，緊接著返回 */
.save {
  margin-right: auto;
}
.three {
  display: grid;
  width: 100%;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
}
.three :deep(.btn) {
  width: 100%;
}
.three :deep(.lb) {
  text-align: center;
}
@media (prefers-reduced-motion: reduce) {
  .swap-enter-active,
  .tag-enter-active,
  .badge-enter-active {
    animation: none;
  }
}
</style>
