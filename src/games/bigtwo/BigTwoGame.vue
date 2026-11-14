<script setup lang="ts">
// 大老二牌桌：你在下方，三位隨機入座的對手在左、上、右。
// 每張牌都是獨立的精靈（cardStage.ts），發牌、出牌、收牌都是一張一張飛。
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { playSound } from '@/core/audio'
import { opponentById, pickOpponents } from '@/core/opponents'
import { stats } from '@/core/settings'
import { PLAYER_LOOK } from '@/data/names'
import { S } from '@/data/strings'
import { chooseBigTwoAction } from '@/engine/bigtwo/ai'
import { RANK_2, RANK_LABELS, rankOf, suitOf, type Card } from '@/engine/bigtwo/cards'
import { identifyCombo, isBomb } from '@/engine/bigtwo/combos'
import { applyBigTwo, checkPlay, dealBigTwo, scoreBigTwo, type BigTwoAction, type BigTwoState } from '@/engine/bigtwo/game'
import type { BigTwoOptions } from '@/engine/bigtwo/options'
import { seedRng } from '@/engine/common/rng'
import type { GameDef } from '@/games/types'
import Avatar from '@/ui/art/Avatar.vue'
import Burst from '@/ui/art/Burst.vue'
import CardArt from '@/ui/art/Card.vue'
import type { Mood as KidMood } from '@/ui/art/look'
import Btn from '@/ui/Btn.vue'
import Dialog from '@/ui/Dialog.vue'
import CursorGlow from '@/ui/CursorGlow.vue'
import GameMenu from '@/ui/GameMenu.vue'
import TurnGlow from '@/ui/TurnGlow.vue'
import IconBtn from '@/ui/IconBtn.vue'
import { CardStage } from './cardStage'
import { cardPoses, makeLayout, type Layout, type PileGroup, type TableModel } from './tableLayout'

const props = defineProps<{ game: GameDef; options: Record<string, string | boolean>; resume?: unknown }>()
const emit = defineEmits<{ exit: []; save: [data: unknown] }>()

/** 「保存進度並退出」存的資料 */
interface Saved {
  state: BigTwoState
  opponents: number[]
  seed: number
  rng: number
  tableTotals: number[]
  pile: PileGroup[]
  discard: Card[]
  passed: boolean[]
  groupId: number
}
const saved = (props.resume ?? null) as Saved | null

const options = { ...props.options } as unknown as BigTwoOptions
const T = S.bigtwo
const ME = 0
const ALL: Card[] = Array.from({ length: 52 }, (_, i) => i)

// 這一桌的三位對手：坐下時隨機挑，離開前都是同一批人
const opponents = saved ? saved.opponents.map(opponentById) : pickOpponents(3)
const names = [S.common.you, ...opponents.map((o) => o.name)]
const looks = [PLAYER_LOOK, ...opponents.map((o) => o.look)]
const tableTotals = ref(saved ? saved.tableTotals.slice() : [0, 0, 0, 0])

let seed = saved ? saved.seed : (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0
let rng = saved ? saved.rng : seedRng(seed)
const timers = new Set<number>()
const later = (fn: () => void, ms: number) => {
  const id = window.setTimeout(() => {
    timers.delete(id)
    fn()
  }, ms)
  timers.add(id)
}

const state = shallowRef<BigTwoState>(saved ? saved.state : dealBigTwo(seed, options))
const phase = ref<'deal' | 'play' | 'over'>('deal')
const selected = ref<Card[]>([])
const message = ref('')
const pile = ref<PileGroup[]>(saved ? saved.pile : [])
/** 牌堆裡最上面那一手以外的牌：套一層灰階，一眼看出現在要壓的是哪一手 */
const olderPile = computed(() => new Set(pile.value.slice(0, -1).flatMap((g) => g.cards)))
const discard = ref<Card[]>(saved ? saved.discard : [])
const gathered = ref(true)
const passed = reactive(saved ? saved.passed.slice() : [false, false, false, false])
const moods = reactive<KidMood[]>(['idle', 'idle', 'idle', 'idle'])
const caption = ref<{ id: number; who: string; text: string; bomb: boolean } | null>(null)
const menuOpen = ref(false)
const resultOpen = ref(false)
const scores = ref(scoreBigTwo(state.value))
let groupId = saved ? saved.groupId : 0

// ── 版面與動畫 ──
const stageEl = ref<HTMLElement>()
const layout = shallowRef<Layout>(makeLayout(844, 390))
const stage = new CardStage()
let lastLand = 0
stage.onLand = () => {
  const now = performance.now()
  if (now - lastLand > 45) playSound(phase.value === 'deal' ? 'deal' : 'card')
  lastLand = now
}
const ch = computed(() => (layout.value.cw * 108) / 78)

function model(): TableModel {
  return { hands: state.value.hands, selected: selected.value, pile: pile.value, discard: discard.value, gathered: gathered.value }
}

interface Flight {
  cards: Card[]
  stagger: number
  dur: number
  arc: number
  order?: (c: Card) => number
}

/** 依目前的狀態把每張牌送到該去的位置；flight 裡的牌用「飛」的，其他牌滑過去 */
function sync(flight?: Flight, instant = false) {
  const poses = cardPoses(layout.value, model())
  for (const c of ALL) {
    const pose = poses.get(c)
    if (!pose) continue
    const fi = flight ? flight.cards.indexOf(c) : -1
    if (fi >= 0 && flight) {
      const k = flight.order ? flight.order(c) : fi
      // 每張牌各自飛：起飛時間、速度、弧度都有一點不同，不會黏成一整塊
      const v = Math.random()
      stage.move(c, pose, { delay: k * flight.stagger + v * flight.stagger * 0.4, dur: flight.dur * (0.88 + v * 0.3), arc: flight.arc * (0.65 + Math.random() * 0.7), flightZ: 600 + k, land: true, instant })
    } else stage.move(c, pose, { dur: 240, instant })
  }
}

let observer: ResizeObserver | undefined
onMounted(() => {
  const el = stageEl.value!
  const measure = () => {
    layout.value = makeLayout(el.clientWidth, el.clientHeight)
    sync(undefined, true)
  }
  measure()
  observer = new ResizeObserver(measure)
  observer.observe(el)
  later(deal, 280)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  stage.destroy()
  timers.forEach((t) => window.clearTimeout(t))
})

// ── 遊戲流程 ──
function deal() {
  phase.value = 'deal'
  playSound('shuffle')
  gathered.value = false
  const hands = state.value.hands
  const order = new Map<Card, number>()
  hands.forEach((h, seat) => h.forEach((c, k) => order.set(c, k * 4 + seat)))
  sync({ cards: ALL, stagger: 24, dur: 320, arc: 16, order: (c) => order.get(c) ?? 0 })
  later(() => {
    phase.value = 'play'
    nextTurn()
  }, 52 * 24 + 420)
}

function nextTurn() {
  const s = state.value
  if (s.winner >= 0 || phase.value !== 'play') return
  moods.forEach((_, i) => {
    if (moods[i] === 'think') moods[i] = 'idle'
  })
  if (s.turn === ME) return
  const opp = opponents[s.turn - 1]
  moods[s.turn] = 'think'
  const st = opp.persona.bigtwo
  const think = 850 + st.skill * 700 + (1 - st.aggression) * 450 + Math.random() * 550
  later(() => {
    let action: BigTwoAction
    ;[action, rng] = chooseBigTwoAction(state.value, st, rng)
    act(action)
  }, think)
}

function act(action: BigTwoAction): boolean {
  const before = state.value
  const result = applyBigTwo(before, action)
  if (!result.ok) {
    if (result.reason === 'finished') return false
    message.value = T.errors[result.reason]
    playSound('error')
    return false
  }
  const s = result.state
  state.value = s
  message.value = ''
  const p = action.player
  if (moods[p] === 'think') moods[p] = 'idle'

  if (action.type === 'play') {
    const combo = s.table!.combo
    passed[p] = false
    const g: PileGroup = { id: ++groupId, cards: combo.cards, from: p }
    pile.value = [...pile.value, g]
    caption.value = { id: g.id, who: names[p], text: T.combos[combo.type], bomb: isBomb(combo.type) }
    sync({ cards: combo.cards, stagger: 120, dur: 440, arc: layout.value.cw * 0.9 })
    // 表情：出炸彈或 2 的人得意，其他人嚇一跳
    const big = isBomb(combo.type) || combo.cards.some((c) => rankOf(c) === RANK_2)
    if (p !== ME && big) flash(p, 'smug', 1400)
    if (isBomb(combo.type)) for (let o = 1; o < 4; o++) if (o !== p) flash(o, 'shock', 900)
    const landed = combo.cards.length * 120 + 520
    if (s.winner >= 0) {
      later(finish, landed + 500)
      return true
    }
    later(nextTurn, landed)
  } else {
    passed[p] = true
    playSound('pass')
    if (!s.table) {
      // 其他人都過牌：這一輪的牌推到旁邊蓋起來
      later(() => {
        const cards = pile.value.flatMap((g) => g.cards)
        discard.value = [...discard.value, ...cards]
        pile.value = []
        caption.value = null
        passed.fill(false)
        sync({ cards, stagger: 22, dur: 380, arc: 10 })
        later(nextTurn, cards.length * 22 + 420)
      }, 650)
    } else later(nextTurn, 380)
    if (p === ME) sync()
  }
  return true
}

function flash(seat: number, mood: KidMood, ms: number) {
  moods[seat] = mood
  later(() => {
    if (moods[seat] === mood && phase.value === 'play') moods[seat] = state.value.turn === seat ? 'think' : 'idle'
  }, ms)
}

function finish() {
  phase.value = 'over'
  message.value = ''
  selected.value = []
  passed.fill(false)
  const s = state.value
  scores.value = scoreBigTwo(s)
  tableTotals.value = scores.value.map((sc, p) => tableTotals.value[p] + sc.points)
  stats.bigtwo.rounds++
  if (s.winner === ME) stats.bigtwo.wins++
  stats.bigtwo.totals[ME] = (stats.bigtwo.totals[ME] ?? 0) + scores.value[ME].points
  stats.bigtwo.best = Math.max(stats.bigtwo.best, scores.value[ME].points)
  for (let p = 0; p < 4; p++) moods[p] = p === s.winner ? 'happy' : 'sad'
  // 輸家的牌翻開給你看
  playSound(s.winner === ME ? 'win' : 'lose')
  later(() => (resultOpen.value = true), 900)
}

function newRound() {
  timers.forEach((t) => window.clearTimeout(t))
  timers.clear()
  menuOpen.value = false
  resultOpen.value = false
  selected.value = []
  message.value = ''
  caption.value = null
  passed.fill(false)
  moods.fill('idle')
  phase.value = 'deal'
  // 先把所有牌收回桌子中間
  pile.value = []
  discard.value = []
  gathered.value = true
  sync({ cards: ALL, stagger: 7, dur: 360, arc: 0 })
  later(() => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    state.value = dealBigTwo(seed, options)
    deal()
  }, 52 * 7 + 480)
}

// ── 保存進度並退出 ──
const canSave = computed(() => phase.value === 'play')
function saveAndExit() {
  // 剛好在「大家都過、要收牌」的空檔存：把桌上的牌當作已經收走
  let p = pile.value
  let d = discard.value
  let ps = [...passed]
  if (!state.value.table && p.length) {
    d = [...d, ...p.flatMap((g) => g.cards)]
    p = []
    ps = [false, false, false, false]
  }
  const data: Saved = { state: state.value, opponents: opponents.map((o) => o.id), seed, rng, tableTotals: tableTotals.value, pile: p, discard: d, passed: ps, groupId }
  emit('save', data)
}

// ── 你的操作 ──
const myTurn = computed(() => phase.value === 'play' && state.value.turn === ME && state.value.winner < 0)
const canPass = computed(() => myTurn.value && state.value.table !== null)
const selectedCombo = computed(() => (selected.value.length ? identifyCombo(selected.value, options) : null))
const status = computed(() => {
  if (message.value) return message.value
  const s = state.value
  if (phase.value === 'deal') return ''
  if (s.winner >= 0) return s.winner === ME ? T.result.win : T.result.lose(names[s.winner])
  if (!myTurn.value) return T.waiting(names[s.turn])
  if (selectedCombo.value) return T.combos[selectedCombo.value.type]
  if (s.firstTurn) return T.firstLead
  return s.table ? T.yourTurn : T.yourLead
})

function tapCard(c: Card) {
  if (phase.value !== 'play' || !state.value.hands[ME].includes(c)) return
  playSound('cardPick')
  message.value = ''
  selected.value = selected.value.includes(c) ? selected.value.filter((x) => x !== c) : [...selected.value, c]
  sync()
}

function playSelected() {
  if (!myTurn.value) return
  const check = checkPlay(state.value, ME, selected.value)
  if (!check.ok) {
    message.value = T.errors[check.reason]
    playSound('error')
    return
  }
  const cards = selected.value
  selected.value = []
  act({ type: 'play', player: ME, cards })
}

// 過牌要按兩次：第一次按下變成「再按一次過牌」，2.5 秒內再按才真的過
const passArmed = ref(false)
let passTimer = 0
function disarmPass() {
  passArmed.value = false
  window.clearTimeout(passTimer)
}
function pass() {
  if (!canPass.value) return
  if (!passArmed.value) {
    passArmed.value = true
    playSound('tap')
    window.clearTimeout(passTimer)
    passTimer = window.setTimeout(() => (passArmed.value = false), 2500)
    return
  }
  disarmPass()
  selected.value = []
  act({ type: 'pass', player: ME })
}
watch(canPass, (v) => {
  if (!v) disarmPass()
})
onBeforeUnmount(() => window.clearTimeout(passTimer))

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`)
const doubleNotes = computed(() => {
  const notes: string[] = []
  if (options.doubleOverTen) notes.push(T.result.overTen)
  if (options.doubleTwos) notes.push(T.result.twos)
  return notes.length ? notes.join('') : T.result.noDoubles
})
const rankText = (c: Card) => RANK_LABELS[rankOf(c)]
</script>

<template>
  <section ref="stageEl" class="felt">
    <!-- 輪到誰：那個人那一側淡淡亮起 -->
    <TurnGlow v-for="(side, p) in (['bottom', 'right', 'top', 'left'] as const)" :key="side" :side="side" :on="phase === 'play' && state.winner < 0 && state.turn === p" />
    <!-- 桌面中央的框 -->
    <div class="table-box" :style="{ left: `${layout.pile.x - layout.cw * 3.1}px`, top: `${layout.pile.y - layout.cw * 1.25}px`, width: `${layout.cw * 6.2}px`, height: `${layout.cw * 2.5}px` }">
      <span class="t-label lab">TABLE</span>
    </div>

    <!-- 座位上的人 -->
    <template v-for="(seat, p) in layout.seats" :key="p">
      <div
        class="who"
        :class="[`s${p}`, { active: phase === 'play' && state.turn === p }]"
        :style="{ left: `${seat.kid.x - seat.kid.w / 2}px`, top: `${seat.kid.y - seat.kid.w}px`, width: `${seat.kid.w}px`, height: `${seat.kid.w}px` }"
      >
        <Avatar :look="looks[p]" :mood="moods[p]" :flip="p === 1" />
      </div>
      <div v-if="p !== ME" class="tag" :class="[`al-${seat.label.align}`, { active: phase === 'play' && state.turn === p }]" :style="{ left: `${seat.label.x}px`, top: `${seat.label.y}px` }">
        <span class="nm t-black"><span class="hl" />{{ names[p] }}</span>
        <span class="t-label tg">{{ opponents[p - 1].tag }}</span>
      </div>
      <span v-if="passed[p] && p !== ME" :key="`pass${p}`" class="stamp pop" :style="{ left: `${seat.stamp.x}px`, top: `${seat.stamp.y}px` }">{{ T.passed }}</span>
    </template>

    <!-- 52 張牌 -->
    <div class="cards">
      <div
        v-for="c in ALL"
        :key="c"
        :ref="(el) => stage.attach(c, el as HTMLElement | null)"
        class="sprite"
        :class="{ mine: state.hands[ME].includes(c), sel: selected.includes(c), old: olderPile.has(c) }"
        :style="{ width: `${layout.cw}px`, height: `${ch}px`, marginLeft: `${-layout.cw / 2}px`, marginTop: `${-ch / 2}px` }"
        @click="tapCard(c)"
      >
        <svg class="face" viewBox="-2 -2 78 108" aria-hidden="true"><CardArt :rank="rankText(c)" :suit="suitOf(c)" /></svg>
        <svg class="back" viewBox="-2 -2 78 108" aria-hidden="true"><CardArt back /></svg>
      </div>
    </div>

    <div v-if="caption" :key="caption.id" class="combo" :style="{ left: `${layout.pile.x + layout.cw * 2.45}px`, top: `${layout.pile.y - layout.cw * 1.05}px` }">
      <Burst class="pop" :tone="caption.bomb ? 'red' : 'yellow'" size="3.4rem">{{ caption.text }}</Burst>
      <span class="t-label by rise" style="--i: 2">{{ caption.who }}</span>
    </div>

    <p class="status" :class="{ mine: myTurn && !message, warn: !!message }" :style="{ bottom: `${layout.cw * 1.62}px` }">
      <span v-if="passed[ME]" class="stamp inline pop">{{ T.passed }}</span>
      {{ status }}
    </p>

    <div class="corner"><IconBtn icon="menu" :label="S.common.menu" @click="menuOpen = true" /></div>
    <div class="actions">
      <template v-if="phase !== 'over'">
        <Btn class="rise" tone="red" size="lg" arrow block :disabled="!myTurn || !selected.length" @click="playSelected">{{ T.play }}</Btn>
        <Btn class="rise" style="--i: 1" icon="pass" block :tone="passArmed ? 'yellow' : 'plain'" :disabled="!canPass" @click="pass">{{ passArmed ? T.passConfirm : T.pass }}</Btn>
      </template>
      <Btn v-else class="rise" tone="ink" size="lg" arrow block @click="resultOpen = true">{{ T.result.howTitle }}</Btn>
    </div>

    <CursorGlow />
    <GameMenu :open="menuOpen" :game="game" :options="props.options" @close="menuOpen = false" @restart="newRound" @exit="emit('exit')" :can-save="canSave" @save-exit="saveAndExit" />

    <Dialog :open="resultOpen" :title="state.winner === ME ? T.result.win : T.result.lose(names[Math.max(0, state.winner)])" :label="T.result.label" :tone="state.winner === ME ? 'red' : 'ink'" wide @close="resultOpen = false">
      <table class="score">
        <thead>
          <tr>
            <th>{{ T.result.colPlayer }}</th>
            <th>{{ T.result.colLeft }}</th>
            <th>{{ T.result.colTimes }}</th>
            <th>{{ T.result.colRound }}</th>
            <th>{{ T.result.colTotal }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(s, p) in scores" :key="p" class="rise" :class="{ winner: p === state.winner }" :style="{ '--i': p + 2 }">
            <td class="who-cell">
              <span class="who-in">
                <span class="mini"><Avatar :look="looks[p]" :mood="p === state.winner ? 'happy' : 'sad'" /></span>
                <span class="t-black">{{ names[p] }}</span>
                <Burst v-if="p === state.winner" class="pop" tone="red" size="1.9rem" style="--i: 6">{{ T.result.winnerStamp }}</Burst>
              </span>
            </td>
            <td>{{ p === state.winner ? T.result.winner : s.twos ? T.result.leftWithTwos(s.cards, s.twos) : T.cardsLeft(s.cards) }}</td>
            <td>{{ p === state.winner ? '' : `×${s.multiplier}` }}</td>
            <td class="num t-slab" :class="{ red: s.points > 0 }">{{ signed(s.points) }}</td>
            <td class="num t-slab">{{ signed(tableTotals[p]) }}</td>
          </tr>
        </tbody>
      </table>
      <p class="how">
        <b class="t-black">{{ T.result.howTitle }}</b>
        {{ T.result.base }}{{ doubleNotes }}
      </p>
      <p class="lifetime t-black">{{ T.result.lifetime(signed(stats.bigtwo.totals[ME] ?? 0)) }}</p>
      <template #actions>
        <Btn tone="red" icon="again" @click="newRound">{{ S.common.again }}</Btn>
        <Btn icon="exit" @click="emit('exit')">{{ S.common.quit }}</Btn>
      </template>
    </Dialog>
  </section>
</template>

<style scoped>
.felt {
  position: relative;
  isolation: isolate;
  height: 100%;
  overflow: hidden;
}
.table-box {
  position: absolute;
  border: 0.14rem solid var(--color-ink);
  background-image: radial-gradient(rgb(20 20 20 / 0.1) 30%, transparent 32%);
  background-size: 0.5rem 0.5rem;
  animation: rise 520ms var(--ease-out) both;
}
.lab {
  position: absolute;
  left: 0.5rem;
  top: -0.55rem;
  padding: 0 0.4rem;
  background: var(--color-paper);
}
.cards {
  position: absolute;
  inset: 0;
  isolation: isolate;
  z-index: 1;
}
.sprite {
  position: absolute;
  left: 0;
  top: 0;
  will-change: transform;
}
.sprite svg {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.sprite[data-face='1'] .back,
.sprite[data-face='0'] .face {
  display: none;
}
.sprite.mine {
  cursor: pointer;
}
/* 選起的牌：底下一條黃色 */
.sprite.sel::after {
  content: '';
  position: absolute;
  left: 8%;
  right: 4%;
  bottom: -10%;
  height: 6%;
  background: var(--color-yellow);
  border: 0.1rem solid var(--color-ink);
}
.who {
  position: absolute;
  z-index: 2;
  pointer-events: none;
  transition: transform 300ms var(--ease-back);
}
.who :deep(svg) {
  width: 100%;
  height: 100%;
}
.who.active {
  transform: translateY(-0.3rem);
}
.tag {
  position: absolute;
  z-index: 2;
  display: flex;
  flex-direction: column;
  line-height: 1.2;
  white-space: nowrap;
  pointer-events: none;
}
.al-center {
  transform: translateX(-50%);
  align-items: center;
}
.al-right {
  transform: translateX(-100%);
  align-items: flex-end;
}
.nm {
  position: relative;
  padding: 0 0.25rem;
  font-size: 0.95rem;
}
/* 輪到誰：名字底下刷上一塊黃色 */
.hl {
  position: absolute;
  inset: 0.15rem -0.1rem 0.05rem;
  z-index: -1;
  background: var(--color-yellow);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 300ms var(--ease-out);
}
.tag.active .hl {
  transform: none;
}
.tg {
  font-size: 0.5rem;
  color: var(--color-ink-2);
}
.stamp {
  position: absolute;
  z-index: 700;
  display: grid;
  width: 2.3rem;
  height: 2.3rem;
  margin: -1.15rem 0 0 -1.15rem;
  place-items: center;
  border: 0.16rem solid var(--color-red);
  border-radius: 50%;
  background: var(--color-card);
  color: var(--color-red);
  font-size: 1.05rem;
  font-weight: 900;
  rotate: -12deg;
  pointer-events: none;
}
.stamp.inline {
  position: relative;
  display: inline-grid;
  width: 1.8rem;
  height: 1.8rem;
  margin: 0 0.5rem 0 0;
  font-size: 0.85rem;
  vertical-align: middle;
}
.combo {
  position: absolute;
  z-index: 650;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  pointer-events: none;
}
.by {
  font-size: 0.5rem;
}
.status {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 650;
  text-align: center;
  font-size: 1.05rem;
  font-weight: 900;
  line-height: 1.6;
  color: var(--color-ink-3);
  pointer-events: none;
}
.status.mine {
  color: var(--color-ink);
}
.status.warn {
  color: var(--color-red);
}
.corner {
  position: absolute;
  left: max(0.9rem, env(safe-area-inset-left));
  top: max(0.7rem, env(safe-area-inset-top));
  z-index: 700;
}
.actions {
  position: absolute;
  right: max(1rem, env(safe-area-inset-right));
  bottom: 0.7rem;
  display: flex;
  width: 8.4rem;
  flex-direction: column;
  gap: 0.45rem;
  z-index: 700;
}
.score {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
  line-height: 1.4;
  font-variant-numeric: tabular-nums;
}
.score th {
  padding: 0 0.5rem 0.2rem;
  border-bottom: 0.14rem solid var(--color-ink);
  font-size: 0.6rem;
  font-weight: 900;
  letter-spacing: 0.15em;
  color: var(--color-ink-2);
  text-align: center;
}
.score td {
  padding: 0.06rem 0.5rem;
  border-bottom: 0.07rem solid var(--color-ink);
  text-align: center;
}
.score th:first-child,
.score td:first-child {
  text-align: left;
}
.who-cell {
  vertical-align: middle;
}
.who-in {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}
.mini {
  display: block;
  width: 1.5rem;
  height: 1.5rem;
}
.mini :deep(svg) {
  width: 100%;
  height: 100%;
}
.score .num {
  text-align: right;
  font-size: 0.95rem;
}
.score .red {
  color: var(--color-red);
}
.score .winner td {
  background: rgb(255 194 26 / 0.3);
}
.how {
  padding-top: 0.5rem;
  font-size: 0.72rem;
  line-height: 1.55;
  color: var(--color-ink-2);
}
.how b {
  margin-right: 0.4rem;
  color: var(--color-ink);
}
.lifetime {
  padding-top: 0.2rem;
  font-size: 0.8rem;
}
/* 滑鼠移到自己的手牌上：那張牌先浮起一點（預覽要出哪張） */
@media (hover: hover) and (pointer: fine) {
  .sprite.mine {
    transition: translate 160ms var(--ease-out);
  }
  .sprite.mine:hover {
    translate: 0 -7%;
  }
}
/* 被壓在下面的舊牌：變灰 */
.sprite .face {
  transition: filter 360ms ease;
}
.sprite.old .face {
  filter: grayscale(1) brightness(0.93) contrast(0.85);
}
</style>
