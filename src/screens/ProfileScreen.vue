<script setup lang="ts">
// 個人資料頁（獨立一頁，不是彈窗）：左邊是頭像、名字、稱號、等級與經驗；右邊分頁看稱號、換頭像、看戰績。
// 稱號：解鎖的點一下就換上；沒解鎖的反灰，點一下跳出「怎麼解鎖」。頭像：形狀、顏色、花紋分開選，有些零件要升級才有。
import { computed, ref } from 'vue'
import { playSound } from '@/core/audio'
import { hasTitle, levelOf, levelProgress, myLook, profile, setPlayerName } from '@/core/profile'
import { NAME_MAX_WIDTH } from '@/data/namePool'
import { AVATAR_FILLS, AVATAR_SHAPES, AVATAR_TONES, LEVEL_CAP_SHOWN, TITLES } from '@/data/profile'
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

const draft = ref(profile.name)
function commitName() {
  setPlayerName(draft.value)
  draft.value = profile.name
}

const tab = ref<'titles' | 'avatar' | 'record'>('titles')
const tabs = (['titles', 'avatar', 'record'] as const).map((value) => ({ value, label: T.tabs[value] }))
const gotCount = computed(() => TITLES.filter((t) => hasTitle(t.id)).length)

/** 點了沒解鎖的稱號：跳出怎麼解鎖 */
const howId = ref<string | null>(null)
function pickTitle(id: string) {
  if (!hasTitle(id)) {
    playSound('tap')
    howId.value = id
    return
  }
  if (profile.title === id) return
  playSound('tap')
  profile.title = id
}

type Part = 'shape' | 'tone' | 'fill'
const parts: { part: Part; list: { value: string; level: number }[]; names: Record<string, string> }[] = [
  { part: 'shape', list: AVATAR_SHAPES, names: T.shapes },
  { part: 'tone', list: AVATAR_TONES, names: T.tones },
  { part: 'fill', list: AVATAR_FILLS, names: T.fills },
]
/** 換掉一個零件後的長相（預覽用） */
const withPart = (part: Part, value: string): Look => ({ ...myLook(), [part]: value })
const lockedPart = ref<{ name: string; level: number } | null>(null)
function pickPart(part: Part, value: string, level: number, name: string) {
  playSound('tap')
  if (level > lv.value) {
    lockedPart.value = { name, level }
    return
  }
  profile.look = withPart(part, value)
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
          <Avatar :look="myLook()" />
          <span class="t-slab lvb" :class="{ max: lv >= LEVEL_CAP_SHOWN }">{{ lv }}</span>
        </div>
        <div class="id">
        <input
          v-model="draft"
          class="t-black name"
          type="text"
          :maxlength="NAME_MAX_WIDTH"
          :placeholder="T.defaultName"
          :aria-label="T.namePh"
          enterkeyhint="done"
          autocomplete="off"
          spellcheck="false"
          @blur="commitName"
          @keydown.enter="($event.target as HTMLInputElement).blur()"
        />
        <span class="t-black cur">{{ T.titles[profile.title]?.name }}</span>
        </div>
        </div>
        <div class="xp">
          <span class="bar"><span :style="{ width: `${(prog.into / prog.need) * 100}%` }" /></span>
          <span class="t-label nxt">{{ T.xpNext(prog.need - prog.into, lv + 1) }}</span>
          <span class="t-label tot">{{ T.xpTotal(profile.xp) }}</span>
        </div>
        <p class="how">{{ T.howXp }}</p>
      </aside>

      <section class="side rise" style="--i: 2">
        <div class="bar-top">
          <Tabs :choices="tabs" :value="tab" @change="(v) => (tab = v as typeof tab)" />
          <span v-if="tab === 'titles'" class="t-label cnt">{{ T.titleCount(gotCount, TITLES.length) }}</span>
        </div>
        <div class="scroll-y list">
          <!-- 稱號 -->
          <ul v-if="tab === 'titles'" class="titles">
            <li v-for="t in TITLES" :key="t.id">
              <button class="tt" :class="{ locked: !hasTitle(t.id), on: profile.title === t.id }" @click="pickTitle(t.id)">
                <Icon v-if="!hasTitle(t.id)" name="lock" class="lk" />
                <span class="t-black">{{ T.titles[t.id].name }}</span>
                <span v-if="profile.title === t.id" class="t-label use">{{ T.using }}</span>
              </button>
            </li>
          </ul>
          <!-- 頭像 -->
          <div v-else-if="tab === 'avatar'" class="parts">
            <div v-for="p in parts" :key="p.part" class="prow">
              <span class="t-label pl">{{ T.parts[p.part] }}</span>
              <div class="opts">
                <button
                  v-for="o in p.list"
                  :key="o.value"
                  class="opt"
                  :class="{ on: profile.look[p.part] === o.value && o.level <= lv, locked: o.level > lv }"
                  :aria-label="p.names[o.value]"
                  @click="pickPart(p.part, o.value, o.level, p.names[o.value])"
                >
                  <span class="oav"><Avatar :look="withPart(p.part, o.value)" /></span>
                  <span class="t-label on-name">{{ o.level > lv ? T.partLocked(o.level) : p.names[o.value] }}</span>
                </button>
              </div>
            </div>
          </div>
          <!-- 戰績 -->
          <div v-else class="rec">
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
        </div>
      </section>
    </div>

    <Dialog :open="howId !== null" :title="howId ? T.titles[howId].name : ''" :label="T.lockedTitle" tone="ink" @close="howId = null">
      <p class="text-[0.95rem]"><span class="text-ink-2">{{ T.howTo }}：</span>{{ howId ? T.titles[howId].how : '' }}</p>
      <template #actions>
        <Btn size="sm" @click="howId = null">{{ T.ok }}</Btn>
      </template>
    </Dialog>
    <Dialog :open="lockedPart !== null" :title="lockedPart?.name ?? ''" :label="T.lockedTitle" tone="ink" @close="lockedPart = null">
      <p class="text-[0.95rem]"><span class="text-ink-2">{{ T.howTo }}：</span>{{ lockedPart ? T.unlock.level(lockedPart.level) : '' }}</p>
      <template #actions>
        <Btn size="sm" @click="lockedPart = null">{{ T.ok }}</Btn>
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
  gap: 0.55rem;
  min-height: 0;
  overflow-y: auto;
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
  gap: 0.4rem;
}
.big {
  position: relative;
  width: 4.2rem;
  height: 4.2rem;
  flex: none;
}
.big :deep(svg) {
  width: 100%;
  height: 100%;
}
.lvb {
  position: absolute;
  right: -0.6rem;
  bottom: -0.2rem;
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
.cur {
  background: var(--color-red);
  color: var(--color-card);
  padding: 0.05rem 0.6rem;
  font-size: 0.85rem;
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
.how {
  font-size: 0.68rem;
  line-height: 1.45;
  color: var(--color-ink-2);
}
.side {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 0.6rem;
}
.bar-top {
  display: flex;
  margin-top: -0.1rem;
  align-items: center;
  gap: 0.8rem;
}
.cnt {
  margin-left: auto;
  color: var(--color-ink-2);
}
.list {
  min-height: 0;
  flex: 1;
  padding: 0.6rem 0.6rem 0.5rem 0.15rem;
}
.titles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(8.2rem, 1fr));
  gap: 0.5rem;
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
  transition: transform 110ms var(--ease-out);
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
.lk {
  width: 0.85rem;
  height: 0.85rem;
  flex: none;
}
.use {
  position: absolute;
  top: -0.5rem;
  right: 0.3rem;
  background: var(--color-red);
  color: var(--color-card);
  padding: 0 0.3rem;
  font-size: 0.55rem;
}
.parts {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}
.prow {
  display: flex;
  align-items: center;
  gap: 0.8rem;
}
.pl {
  width: 2.4rem;
  flex: none;
}
.opts {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}
.opt {
  display: flex;
  width: 3.7rem;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  border: 0.13rem solid transparent;
  padding: 0.25rem 0.1rem 0.15rem;
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
  width: 2.1rem;
  height: 2.1rem;
}
.oav :deep(svg) {
  width: 100%;
  height: 100%;
}
.on-name {
  font-size: 0.56rem;
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
  padding: 0.2rem 0;
  border-left: 0.3rem solid var(--tone);
  padding-left: 0.5rem;
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
</style>
