<script setup lang="ts">
// 大老二牌桌：你在下方，三位隨機入座的對手在左、上、右。
// 每張牌都是獨立的精靈（cardStage.ts），發牌、出牌、收牌都是一張一張飛。
import { useGrace } from '@/core/grace'
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef } from 'vue'
import { playSound } from '@/core/audio'
import { afterReveal } from '@/core/launch'
import { opponentById, pickOpponents } from '@/core/opponents'
import { recordBest, stats } from '@/core/settings'
import { asBigTwoDifficulty, bigtwoAt, bigtwoLevel, extraThink } from '@/engine/common/difficulty'
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
import Tabs from '@/ui/Tabs.vue'
import Dialog from '@/ui/Dialog.vue'
import CursorGlow from '@/ui/CursorGlow.vue'
import GameMenu from '@/ui/GameMenu.vue'
import TurnGlow from '@/ui/TurnGlow.vue'
import TurnTimer from '@/ui/TurnTimer.vue'
import { TURN_SECONDS } from '@/data/timer'
import Icon from '@/ui/art/Icon.vue'
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
  /** 這一局開局時每個人的 13 張牌（結算後回牌桌看牌用；舊存檔沒有） */
  startHands?: Card[][]
}
const saved = (props.resume ?? null) as Saved | null

const options = { ...props.options } as unknown as BigTwoOptions
/** 規則設定的「倒數計時」 */
const timed = props.options.timer !== false
/** 難度：只決定電腦多強 */
/** 難度：簡單／困難（只決定電腦多強） */
const difficulty = asBigTwoDifficulty(props.options.difficulty)
const level = bigtwoLevel(difficulty)
const T = S.bigtwo
const ME = 0
const ALL: Card[] = Array.from({ length: 52 }, (_, i) => i)

// 這一桌的三位對手：坐下時隨機挑，離開前都是同一批人
// 困難模式不會出現新手打法的電腦
const opponents = saved ? saved.opponents.map(opponentById) : pickOpponents(3, Date.now(), difficulty === 'hard')
const names = [S.common.you, ...opponents.map((o) => o.name)]
const looks = [PLAYER_LOOK, ...opponents.map((o) => o.look)]
const tableTotals = ref(saved ? saved.tableTotals.slice() : [0, 0, 0, 0])

let seed = saved ? saved.seed : (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0
let rng = saved ? saved.rng : seedRng(seed)
const timers = new Set<number>()
const later = (fn: () => void, ms: number) => {
  const id = window.setTimeout(() => {
    timers.delete(id)
    // 暫停中（選單打開）：電腦也停下來，等繼續再走
    if (menuOpen.value) later(fn, 250)
    else fn()
  }, ms)
  timers.add(id)
}

const state = shallowRef<BigTwoState>(saved ? saved.state : dealBigTwo(seed, options))
const grace = useGrace(props.options, state, () => state.value.turn === 0)
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
/** 這一局開局時每個人的牌（讀回沒有這筆的舊存檔時是 null） */
const startHands = shallowRef<Card[][] | null>(saved ? (saved.startHands ?? null) : state.value.hands)
/** 結算後回到牌桌看牌：每個人原本的牌／最後剩下的牌 */
const reviewOpen = ref(false)
const reviewMode = ref<'start' | 'end'>('end')
function openReview() {
  resultOpen.value = false
  reviewMode.value = startHands.value ? 'start' : 'end'
  reviewOpen.value = true
}
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
  // 進場色塊揭開後才發牌，發牌動畫才看得到
  void afterReveal().then(() => later(deal, 120))
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
  const st = bigtwoAt(opp.persona.bigtwo, level, opp.id)
  // 電腦每一手想一下再出：約 1.5～3.8 秒（會算的、愛保留的想比較久；困難再多想一點）
  const think = 1400 + st.skill * 800 + (1 - st.aggression) * 500 + extraThink(level) * 0.5 + Math.random() * 700
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
  recordBest('bigtwo', difficulty, scores.value[ME].points)
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
  reviewOpen.value = false
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
    startHands.value = state.value.hands
    deal()
  }, 52 * 7 + 480)
}

// ── 保存進度並退出 ──
/** 玩家自己有沒有動過（還沒動過就離開：不必按兩次、也不需要存檔） */
const acted = ref(!!saved)
const canSave = computed(() => phase.value === 'play' && acted.value)
/** 目前的進度（可以存檔時才有；還沒動過、已經結束就是 null） */
function snapshot(): Saved | null {
  if (!canSave.value) return null
  // 剛好在「大家都過、要收牌」的空檔存：把桌上的牌當作已經收走
  let p = pile.value
  let d = discard.value
  let ps = [...passed]
  if (!state.value.table && p.length) {
    d = [...d, ...p.flatMap((g) => g.cards)]
    p = []
    ps = [false, false, false, false]
  }
  const data: Saved = { state: state.value, opponents: opponents.map((o) => o.id), seed, rng, tableTotals: tableTotals.value, pile: p, discard: d, passed: ps, groupId, startHands: startHands.value ?? undefined }
  return data
}
function saveAndExit() {
  const data = snapshot()
  if (data) emit('save', data)
}
// 給外框用：切走分頁、離開視窗時自動暫停並存下進度
defineExpose({ pause: () => phase.value !== 'over' && !resultOpen.value && (menuOpen.value = true), snapshot })

// ── 你的操作 ──
const myTurn = computed(() => phase.value === 'play' && state.value.turn === ME && state.value.winner < 0)
const canPass = computed(() => myTurn.value && state.value.table !== null)
/** 取消選取：選起的牌全部放回手牌 */
function clearSelection() {
  if (!selected.value.length) return
  selected.value = []
}
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
  acted.value = true
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

// 過牌：按一下就過（大老二不用二次確認）
function pass() {
  if (!canPass.value) return
  selected.value = []
  acted.value = true
  act({ type: 'pass', player: ME })
}
/** 時間到：這一手跳過（桌上有牌＝過牌；輪到你首出＝改由下一位首出） */
function onTimeout() {
  if (!myTurn.value) return
  selected.value = []
  acted.value = true
  if (act({ type: 'timeout', player: ME })) {
    sync()
    message.value = S.common.timedOut
  }
}

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
    <TurnTimer v-if="timed" :side="(['bottom', 'right', 'top', 'left'] as const)[state.turn]" :active="phase === 'play' && state.winner < 0 && !(grace && state.turn === 0)" :paused="menuOpen || resultOpen" :seconds="TURN_SECONDS.cards" :turn-key="state" @timeout="onTimeout" />
    <!-- 桌面中央的框 -->
    <!-- 每個人這一輪剛出的牌（小張；一輪結束就清掉） -->
    <template v-for="(seat, p) in layout.seats" :key="`last${p}`">
      <div v-if="Array.isArray(state.lastMoves[p])" :key="`last${p}-${(state.lastMoves[p] as number[]).join('.')}`" class="last-play pop" :style="{ left: `${seat.last.x}px`, top: `${seat.last.y}px`, '--w': `${layout.cw * 0.48}px` }">
        <svg v-for="c in (state.lastMoves[p] as number[])" :key="c" viewBox="-2 -2 78 108" class="lp-card"><CardArt :rank="RANK_LABELS[rankOf(c)]" :suit="suitOf(c)" :shadow="false" /></svg>
      </div>
    </template>
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

    <p class="status" :class="{ mine: myTurn && !message, warn: !!message }" :style="{ bottom: `${layout.cw * 1.9}px` }">
      <span v-if="passed[ME]" class="stamp inline pop">{{ T.passed }}</span>
      {{ status }}
    </p>

    <div class="corner"><IconBtn icon="menu" :label="S.common.menu" @click="menuOpen = true" /></div>
    <div class="actions">
      <template v-if="phase !== 'over'">
        <!-- 有選起牌時才出現：一次把選起的牌全部放回去 -->
        <Transition name="clear-sel">
          <Btn v-if="selected.length" class="clear-sel" size="sm" icon="close" block @click="clearSelection">{{ T.clearSelection }}</Btn>
        </Transition>
        <Btn class="rise" tone="red" size="lg" arrow block :disabled="!myTurn || !selected.length" @click="playSelected">{{ T.play }}</Btn>
        <Btn class="rise" style="--i: 1" icon="pass" block :disabled="!canPass" @click="pass">{{ T.pass }}</Btn>
      </template>
      <template v-else>
        <Btn v-if="!reviewOpen" class="rise" size="sm" icon="book" block @click="openReview">{{ T.review.open }}</Btn>
        <Btn class="rise" tone="ink" size="lg" arrow block @click="(reviewOpen = false), (resultOpen = true)">{{ T.result.howTitle }}</Btn>
      </template>
    </div>

    <!-- 結算後回到牌桌看牌：每個人原本的 13 張、最後剩下的牌 -->
    <Transition name="review">
      <section v-if="reviewOpen && phase === 'over' && !resultOpen" class="review">
        <header class="rv-head">
          <span class="t-label">{{ T.review.label }}</span>
          <Tabs
            class="small"
            :choices="startHands ? [{ value: 'start', label: T.review.start }, { value: 'end', label: T.review.end }] : [{ value: 'end', label: T.review.end }]"
            :value="reviewMode"
            @change="(v) => (reviewMode = v as 'start' | 'end')"
          />
          <button class="rv-close" :aria-label="S.common.close" @click="reviewOpen = false"><Icon name="close" /></button>
        </header>
        <div v-for="p in [0, 1, 2, 3]" :key="`rv${p}-${reviewMode}`" class="rv-row" :class="{ win: p === state.winner }">
          <span class="rv-av"><Avatar :look="looks[p]" :mood="p === state.winner ? 'happy' : 'idle'" /></span>
          <span class="rv-name t-black">{{ names[p] }}</span>
          <span class="rv-cards">
            <template v-if="(reviewMode === 'start' && startHands ? startHands[p] : state.hands[p]).length">
              <svg
                v-for="(c, k) in reviewMode === 'start' && startHands ? startHands[p] : state.hands[p]"
                :key="c"
                viewBox="-2 -2 78 108"
                class="rv-card"
                :class="{ gone: reviewMode === 'start' && !state.hands[p].includes(c) }"
                :style="{ '--k': k }"
              ><CardArt :rank="RANK_LABELS[rankOf(c)]" :suit="suitOf(c)" :shadow="false" /></svg>
            </template>
            <span v-else class="rv-done t-black">{{ T.review.done }}</span>
          </span>
        </div>
        <p class="rv-note" :class="{ off: reviewMode !== 'start' }">{{ T.review.startNote }}</p>
      </section>
    </Transition>

    <CursorGlow />
    <GameMenu :open="menuOpen" :game="game" :options="props.options" @close="menuOpen = false" @restart="newRound" @exit="emit('exit')" :can-save="canSave" @save-exit="saveAndExit" />

    <Dialog flip :open="resultOpen" :title="state.winner === ME ? T.result.win : T.result.lose(names[Math.max(0, state.winner)])" :label="T.result.label" tone="red" wide @close="resultOpen = false">
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
        <Btn icon="exit" size="sm" @click="emit('exit')">{{ S.common.quit }}</Btn>
        <Btn icon="book" size="sm" @click="openReview">{{ T.review.open }}</Btn>
        <Btn tone="red" icon="again" @click="newRound">{{ S.common.again }}</Btn>
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
.last-play {
  position: absolute;
  z-index: 40;
  display: flex;
  translate: -50% -50%;
  pointer-events: none;
}
.last-play .lp-card {
  width: var(--w);
  filter: drop-shadow(0.06rem 0.08rem 0 rgb(20 20 20 / 0.5));
}
.last-play .lp-card + .lp-card {
  margin-left: calc(var(--w) * -0.66);
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
/* 選起來的牌：朱紅色的外框＋一點點紅色的光，框輕輕一閃再穩住 */
.sprite.sel::after {
  content: '';
  position: absolute;
  inset: -3% -4%;
  border: 0.18rem solid var(--color-red);
  border-radius: 10%;
  box-shadow: 0 0.35rem 0.9rem rgb(255 74 28 / 0.28);
  pointer-events: none;
  animation: sel-in 260ms var(--ease-back) both;
}
@keyframes sel-in {
  from {
    opacity: 0;
    transform: scale(1.12);
  }
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
  /* 放在牌的下面一層：選起來的牌往上浮時，文字不會蓋住牌 */
  z-index: 0;
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
.review {
  position: absolute;
  left: 50%;
  top: 0.6rem;
  z-index: 650;
  width: min(40rem, 78vw);
  translate: -50% 0;
  border: 0.14rem solid var(--color-ink);
  background: var(--color-card);
  box-shadow: 0.35rem 0.35rem 0 var(--color-ink);
  padding: 0.55rem 0.8rem 0.6rem;
}
.rv-head {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding-bottom: 0.35rem;
  border-bottom: 0.13rem solid var(--color-ink);
  margin-bottom: 0.3rem;
}
.rv-close {
  position: relative;
  width: 1.6rem;
  height: 1.6rem;
  margin-left: auto;
}
.rv-close::after {
  content: '';
  position: absolute;
  inset: -0.4rem;
}
.rv-close :deep(svg) {
  width: 100%;
  height: 100%;
}
.rv-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.18rem 0;
}
.rv-row + .rv-row {
  border-top: 0.06rem dashed var(--color-ink-3);
}
.rv-av {
  width: 1.7rem;
  height: 1.7rem;
  flex: none;
}
.rv-av :deep(svg) {
  width: 100%;
  height: 100%;
}
.rv-name {
  width: 4.2rem;
  flex: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.85rem;
}
.rv-row.win .rv-name {
  color: var(--color-red);
}
.rv-cards {
  display: flex;
  min-height: 2.75rem;
  align-items: center;
}
.rv-card {
  width: 1.9rem;
  flex: none;
  filter: drop-shadow(0.05rem 0.06rem 0 rgb(20 20 20 / 0.45));
  animation: rv-in 260ms var(--ease-out) calc(var(--k) * 22ms) both;
}
.rv-card + .rv-card {
  margin-left: -0.55rem;
}
/* 原本的牌裡，已經出掉的那些淡一點 */
.rv-card.gone {
  opacity: 0.38;
}
@keyframes rv-in {
  from {
    opacity: 0;
    transform: translateY(0.4rem);
  }
}
.rv-done {
  font-size: 0.85rem;
  color: var(--color-red);
}
.rv-note {
  padding-top: 0.25rem;
  font-size: 0.68rem;
  color: var(--color-ink-2);
}
.rv-note.off {
  visibility: hidden;
}
.review-enter-active {
  transition:
    opacity 200ms var(--ease-out),
    transform 280ms var(--ease-back);
}
.review-leave-active {
  transition:
    opacity 160ms ease-in,
    transform 160ms ease-in;
}
.review-enter-from,
.review-leave-to {
  opacity: 0;
  transform: translateY(1rem) scale(0.97);
}
.clear-sel-enter-active {
  transition:
    opacity 180ms var(--ease-out),
    transform 260ms var(--ease-back);
}
.clear-sel-leave-active {
  transition:
    opacity 140ms ease-in,
    transform 140ms ease-in;
}
.clear-sel-enter-from,
.clear-sel-leave-to {
  opacity: 0;
  transform: translateY(0.5rem) scale(0.92);
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
