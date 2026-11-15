<script setup lang="ts">
// 撿紅點牌桌：你在下方，三位隨機入座的對手在左、上、右。
// 每張牌都是獨立的精靈（沿用大老二的 cardStage）：出牌時飛到桌上或壓到要吃的牌上，
// 兩張一起飛回自己的牌堆；接著牌堆最上面那張翻開，再決定去哪。
import { useGrace } from '@/core/grace'
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef } from 'vue'
import { playSound } from '@/core/audio'
import { afterReveal } from '@/core/launch'
import { reducedMotion } from '@/core/motion'
import { opponentById, pickOpponents } from '@/core/opponents'
import { stats } from '@/core/settings'
import { PLAYER_LOOK } from '@/data/names'
import { S } from '@/data/strings'
import { RANK_LABELS, isRed, rankOf, suitOf, type Card } from '@/engine/bigtwo/cards'
import { seedRng } from '@/engine/common/rng'
import { chooseRedPointAction } from '@/engine/redpoint/ai'
import { applyRedPoint, cardPoints, dealRedPoint, matches, scoreRedPoint, targetsFor, winners, type RedPointAction, type RedPointState } from '@/engine/redpoint/rules'
import type { GameDef } from '@/games/types'
import Avatar from '@/ui/art/Avatar.vue'
import Burst from '@/ui/art/Burst.vue'
import CardArt from '@/ui/art/Card.vue'
import type { Mood } from '@/ui/art/look'
import Btn from '@/ui/Btn.vue'
import Dialog from '@/ui/Dialog.vue'
import CursorGlow from '@/ui/CursorGlow.vue'
import GameMenu from '@/ui/GameMenu.vue'
import TurnGlow from '@/ui/TurnGlow.vue'
import TurnTimer from '@/ui/TurnTimer.vue'
import { TURN_SECONDS } from '@/data/timer'
import IconBtn from '@/ui/IconBtn.vue'
import { CardStage, type Pose } from '../bigtwo/cardStage'
import { makeLayout, type Layout } from '../bigtwo/tableLayout'
import { onTop, rpPoses, rpSpots } from './layout'

const props = defineProps<{ game: GameDef; options: Record<string, string | boolean>; resume?: unknown }>()
const emit = defineEmits<{ exit: []; save: [data: unknown] }>()

/** 「保存進度並退出」存的資料 */
interface Saved {
  state: RedPointState
  opponents: number[]
  seed: number
  rng: number
}
const saved = (props.resume ?? null) as Saved | null

const T = S.redpoint
/** 規則設定的「倒數計時」 */
const timed = props.options.timer !== false
const ME = 0
const ALL: Card[] = Array.from({ length: 52 }, (_, i) => i)
const opponents = saved ? saved.opponents.map(opponentById) : pickOpponents(3)
const names = [S.common.you, ...opponents.map((o) => o.name)]
const looks = [PLAYER_LOOK, ...opponents.map((o) => o.look)]

let seed = saved ? saved.seed : (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0
let rng = saved ? saved.rng : seedRng(seed)
const state = shallowRef<RedPointState>(saved ? saved.state : dealRedPoint(seed))
const grace = useGrace(props.options, state, () => state.value.turn === 0)
const phase = ref<'deal' | 'play' | 'over'>('deal')
const busy = ref(true)
const selected = ref<Card | null>(null)
const awaitFlip = ref(false)
const message = ref('')
const moods = reactive<Mood[]>(['idle', 'idle', 'idle', 'idle'])
const menuOpen = ref(false)
const resultOpen = ref(false)
const gathered = ref(true)
/** 動畫途中的暫時位置（例如壓在要吃的牌上、剛翻開的牌） */
const staged = new Map<Card, Pose>()

// ── 計時與取消：重新開局時，進行中的流程全部作廢 ──
let epoch = 0
const timers = new Set<number>()
function wait(ms: number): Promise<boolean> {
  const ep = epoch
  return new Promise((resolve) => {
    const id = window.setTimeout(() => {
      timers.delete(id)
      // 暫停中（選單打開）：等繼續再往下走
      if (menuOpen.value && ep === epoch) void wait(250).then(resolve)
      else resolve(ep === epoch)
    }, ms)
    timers.add(id)
  })
}
function cancelAll() {
  epoch++
  timers.forEach((t) => window.clearTimeout(t))
  timers.clear()
}

// ── 版面與動畫 ──
const stageEl = ref<HTMLElement>()
const layout = shallowRef<Layout>(makeLayout(844, 390))
const spots = computed(() => rpSpots(layout.value))
const stage = new CardStage()
let lastLand = 0
stage.onLand = () => {
  const now = performance.now()
  if (now - lastLand > 45) playSound(phase.value === 'deal' ? 'deal' : 'card')
  lastLand = now
}
const ch = computed(() => (layout.value.cw * 108) / 78)

function poses() {
  const s = state.value
  const map = rpPoses(layout.value, { hands: s.hands, table: s.table, pile: s.pile, captured: s.captured, selected: selected.value, gathered: gathered.value, salt: seed % 997 })
  for (const [c, p] of staged) map.set(c, p)
  return map
}

function sync(fly: Card[] = [], opts: { stagger?: number; dur?: number; arc?: number; order?: (c: Card) => number } = {}, instant = false) {
  const map = poses()
  for (const c of ALL) {
    const pose = map.get(c)
    if (!pose) continue
    const fi = fly.indexOf(c)
    if (fi >= 0) {
      const k = opts.order ? opts.order(c) : fi
      // 每張牌各自飛：起飛時間、速度、弧度都不一樣
      const v = Math.random()
      const st = opts.stagger ?? 110
      stage.move(c, pose, { delay: k * st + v * st * 0.4, dur: (opts.dur ?? 420) * (0.88 + v * 0.3), arc: (opts.arc ?? layout.value.cw * 0.7) * (0.6 + Math.random() * 0.7), flightZ: 600 + k, land: true, instant })
    } else stage.move(c, pose, { dur: 240, instant })
  }
}

let observer: ResizeObserver | undefined
onMounted(() => {
  const el = stageEl.value!
  const measure = () => {
    layout.value = makeLayout(el.clientWidth, el.clientHeight)
    sync([], {}, true)
  }
  measure()
  observer = new ResizeObserver(measure)
  observer.observe(el)
  // 進場色塊揭開後才發牌，發牌動畫才看得到
  void afterReveal().then(() => deal())
})
onBeforeUnmount(() => {
  observer?.disconnect()
  stage.destroy()
  cancelAll()
})

// ── 流程 ──
async function deal() {
  phase.value = 'deal'
  playSound('shuffle')
  busy.value = true
  gathered.value = false
  const s = state.value
  const order = new Map<Card, number>()
  s.hands.forEach((h, seat) => h.forEach((c, k) => order.set(c, k * 4 + seat)))
  s.table.forEach((c, i) => order.set(c, 24 + i))
  s.pile.forEach((c) => order.set(c, 0))
  sync(ALL, { stagger: 28, dur: 340, arc: 14, order: (c) => order.get(c) ?? 0 })
  if (!(await wait(28 * 28 + 520))) return
  phase.value = 'play'
  // 讀回的存檔可能停在「出完牌、還沒翻牌」
  if (state.value.phase === 'flip') void flipTop(state.value.turn)
  else void nextTurn()
}

function act(action: RedPointAction) {
  const r = applyRedPoint(state.value, action)
  if (!r.ok) {
    message.value = T.errors[r.reason]
    playSound('error')
    return false
  }
  state.value = r.state
  return true
}

async function nextTurn(): Promise<void> {
  const s = state.value
  if (s.phase === 'over') return finish()
  moods.forEach((m, i) => {
    if (m === 'think') moods[i] = 'idle'
  })
  // 手上沒牌了（有人被跳過後會發生）：只翻牌堆
  if (s.phase === 'flip') {
    busy.value = true
    if (!(await wait(600))) return
    return flipTop(s.turn)
  }
  if (s.turn === ME) {
    busy.value = false
    return
  }
  busy.value = true
  const p = s.turn
  moods[p] = 'think'
  const st = opponents[p - 1].persona.redpoint
  if (!(await wait(1200 + st.skill * 700 + Math.random() * 600))) return
  let a: RedPointAction
  ;[a, rng] = chooseRedPointAction(state.value, st, rng)
  moods[p] = 'idle'
  if (a.type !== 'play') return
  const targets = targetsFor(state.value, a.card)
  void playCard(p, a.card, a.target ?? (targets.length === 1 ? targets[0] : undefined))
}

/** 出一張牌：吃牌時先飛過去壓在目標上，再兩張一起收回；配不到就放到桌上 */
async function playCard(player: number, card: Card, target: Card | undefined) {
  if (player === ME) acted.value = true
  busy.value = true
  selected.value = null
  message.value = ''
  if (target !== undefined) {
    staged.set(card, onTop(poses().get(target)!))
    sync([card])
    if (!(await wait(560))) return
  }
  if (!act({ type: 'play', player, card, target })) {
    staged.delete(card)
    sync()
    busy.value = player !== ME
    return
  }
  staged.delete(card)
  if (target !== undefined) {
    react(player, cardPoints(card) + cardPoints(target))
    sync([card, target], { stagger: 110, dur: 400, arc: 24 })
  } else sync([card])
  if (!(await wait(520))) return
  void flipTop(player)
}

/** 翻牌堆最上面那張 */
async function flipTop(player: number): Promise<void> {
  const s = state.value
  if (s.phase !== 'flip') return nextTurn()
  const top = s.pile[0]
  const S2 = spots.value
  staged.set(top, { x: S2.reveal.x, y: S2.reveal.y, r: 4, s: 0.95, f: 1, z: 650 })
  playSound('flip')
  sync([top], { dur: 380, arc: 16 })
  if (!(await wait(620))) return
  const targets = targetsFor(state.value, top)
  if (targets.length >= 2) {
    if (player === ME) {
      awaitFlip.value = true
      message.value = T.flipPick
      busy.value = false
      return
    }
    let a: RedPointAction
    ;[a, rng] = chooseRedPointAction(state.value, opponents[player - 1].persona.redpoint, rng)
    return finishFlip(player, top, a.type === 'flip' ? a.target : targets[0])
  }
  return finishFlip(player, top, targets[0])
}

async function finishFlip(player: number, top: Card, target: Card | undefined) {
  awaitFlip.value = false
  busy.value = true
  message.value = ''
  if (target !== undefined) {
    staged.set(top, onTop(poses().get(target)!))
    sync([top], { dur: 360, arc: 12 })
    if (!(await wait(460))) return
  }
  staged.delete(top)
  if (!act({ type: 'flip', player, target })) return
  if (target !== undefined) {
    react(player, cardPoints(top) + cardPoints(target))
    sync([top, target], { stagger: 110, dur: 400, arc: 24 })
  } else sync([top], { dur: 320, arc: 10 })
  if (!(await wait(520))) return
  void nextTurn()
}

/** 撿到大分時的表情 */
function react(player: number, points: number) {
  if (points < 15) return
  flash(player, 'happy', 1200)
  for (let o = 0; o < 4; o++) if (o !== player && o !== ME) flash(o, points >= 25 ? 'shock' : 'sad', 900)
}
function flash(seat: number, mood: Mood, ms: number) {
  moods[seat] = mood
  void wait(ms).then((ok) => {
    if (ok && moods[seat] === mood && phase.value === 'play') moods[seat] = 'idle'
  })
}

function finish() {
  phase.value = 'over'
  busy.value = true
  const w = winners(state.value)
  for (let p = 0; p < 4; p++) moods[p] = w.includes(p) ? 'happy' : 'sad'
  stats.redpoint.rounds++
  if (w.includes(ME)) stats.redpoint.wins++
  stats.redpoint.best = Math.max(stats.redpoint.best, scores.value[ME].points)
  void countUp().then((ok) => {
    if (!ok) return
    playSound(w.includes(ME) ? 'win' : 'lose')
    resultOpen.value = true
  })
}

// ── 結算前的數牌：每個人撿到的紅牌一張張飛到桌子中間排成一列，旁邊的分數跟著一張張加上去 ──
/** 數牌中各人的分數（null = 沒在數） */
const tally = ref<number[] | null>(null)
const countingRow = ref(-1)
const rowY = (p: number) => spots.value.box.y + spots.value.box.h * (0.16 + p * 0.225)
const rowX = (k: number) => spots.value.box.x + spots.value.box.w * 0.24 + k * layout.value.cw * 0.34
async function countUp(): Promise<boolean> {
  if (reducedMotion()) return true
  if (!(await wait(700))) return false
  tally.value = [0, 0, 0, 0]
  const list = scores.value
  for (let p = 0; p < 4; p++) {
    countingRow.value = p
    const reds = list[p].reds
    for (let k = 0; k < reds.length; k++) {
      const c = reds[k]
      staged.set(c, { x: rowX(k), y: rowY(p), r: (Math.random() - 0.5) * 8, s: 0.52, f: 1, z: 900 + p * 30 + k })
      sync([c], { dur: 320, arc: layout.value.cw * 0.4 })
      if (!(await wait(140))) return false
      tally.value = tally.value.map((v, i) => (i === p ? v + cardPoints(c) : v))
    }
    if (!(await wait(reds.length ? 380 : 200))) return false
  }
  countingRow.value = -1
  return wait(700)
}

async function newRound() {
  cancelAll()
  menuOpen.value = false
  resultOpen.value = false
  selected.value = null
  awaitFlip.value = false
  message.value = ''
  staged.clear()
  moods.fill('idle')
  phase.value = 'deal'
  busy.value = true
  tally.value = null
  countingRow.value = -1
  gathered.value = true
  sync(ALL, { stagger: 7, dur: 360, arc: 0 })
  if (!(await wait(52 * 7 + 480))) return
  seed = (seed * 1664525 + 1013904223) >>> 0
  state.value = dealRedPoint(seed)
  void deal()
}

// ── 保存進度並退出 ──
/** 玩家自己有沒有動過（還沒動過就離開：不必按兩次、也不需要存檔） */
const acted = ref(!!saved)
const canSave = computed(() => phase.value === 'play' && acted.value)
/** 目前的進度（可以存檔時才有；還沒動過、已經結束就是 null） */
function snapshot(): Saved | null {
  if (!canSave.value) return null
  const data: Saved = { state: state.value, opponents: opponents.map((o) => o.id), seed, rng }
  return data
}
function saveAndExit() {
  const data = snapshot()
  if (data) emit('save', data)
}
// 給外框用：切走分頁、離開視窗時自動暫停並存下進度
defineExpose({ pause: () => phase.value !== 'over' && !resultOpen.value && (menuOpen.value = true), snapshot })

// ── 你的操作 ──
const myTurn = computed(() => phase.value === 'play' && !busy.value && state.value.turn === ME && state.value.phase === 'play')
// 滑鼠移到自己的手牌上：桌上能跟它配的牌先淡淡亮起來（預覽），點下去才選起
const hoverCard = ref<Card | null>(null)
/** 規則設定的「提示可以吃的牌」（預設關）；翻牌後要選吃哪張時一定會亮 */
const showHints = props.options.hints === true
const peekHits = computed<Card[]>(() => {
  const c = hoverCard.value
  if (c === null || !myTurn.value || selected.value !== null || !state.value.hands[ME].includes(c)) return []
  return targetsFor(state.value, c)
})
const hits = computed<Card[]>(() => {
  if (awaitFlip.value) return targetsFor(state.value, state.value.pile[0])
  return selected.value !== null ? targetsFor(state.value, selected.value) : []
})

function tapCard(c: Card) {
  const s = state.value
  if (awaitFlip.value) {
    if (hits.value.includes(c)) void finishFlip(ME, s.pile[0], c)
    return
  }
  if (!myTurn.value) return
  if (s.hands[ME].includes(c)) {
    playSound('cardPick')
    message.value = ''
    selected.value = selected.value === c ? null : c
    sync()
    return
  }
  // 點桌上能吃的牌 = 直接用選起的手牌去吃
  if (selected.value !== null && s.table.includes(c) && matches(selected.value, c)) void playCard(ME, selected.value, c)
}

/** 時間到：出牌階段＝整回合跳過；翻牌時還沒選要吃哪張＝翻出的牌留在桌上 */
async function onTimeout() {
  if (awaitFlip.value) {
    awaitFlip.value = false
    busy.value = true
    const top = state.value.pile[0]
    staged.delete(top)
    if (!act({ type: 'timeout', player: ME })) return
    message.value = S.common.timedOut
    playSound('error')
    sync([top], { dur: 320, arc: 10 })
    if (!(await wait(520))) return
    return nextTurn()
  }
  if (!myTurn.value) return
  acted.value = true
  selected.value = null
  if (!act({ type: 'timeout', player: ME })) return
  message.value = S.common.timedOut
  playSound('error')
  sync()
  void nextTurn()
}

function playSelected() {
  if (!myTurn.value || selected.value === null) return
  const targets = hits.value
  if (targets.length >= 2) {
    message.value = T.pickTarget
    playSound('error')
    return
  }
  void playCard(ME, selected.value, targets[0])
}

const scores = computed(() => scoreRedPoint(state.value))
const status = computed(() => {
  if (message.value) return message.value
  const s = state.value
  if (phase.value === 'deal') return ''
  if (phase.value === 'over' && countingRow.value >= 0) return T.counting
  if (phase.value === 'over') return winners(s).includes(ME) ? T.win : T.lose(names[winners(s)[0]])
  if (s.turn !== ME) return s.phase === 'flip' ? T.flipping(names[s.turn]) : T.waiting(names[s.turn])
  // 沒開提示：不說這張會不會吃到
  if (selected.value === null || !showHints) return T.yourTurn
  return hits.value.length ? (hits.value.length >= 2 ? T.pickTarget : T.willTake) : T.willDiscard
})
const resultTitle = computed(() => {
  const w = winners(state.value)
  if (w.includes(ME)) return w.length > 1 ? T.tie : T.win
  return T.lose(names[w[0]])
})
const rankText = (c: Card) => RANK_LABELS[rankOf(c)]
</script>

<template>
  <section ref="stageEl" class="felt">
    <!-- 輪到誰：那個人那一側淡淡亮起 -->
    <TurnGlow v-for="(side, p) in (['bottom', 'right', 'top', 'left'] as const)" :key="side" :side="side" :on="phase === 'play' && state.phase !== 'over' && state.turn === p" />
    <TurnTimer v-if="timed" :side="(['bottom', 'right', 'top', 'left'] as const)[state.turn]" :active="phase === 'play' && state.phase !== 'over' && !(grace && state.turn === 0)" :paused="menuOpen || resultOpen" :seconds="TURN_SECONDS.cards" :turn-key="state" @timeout="onTimeout" />
    <!-- 數牌：每一列一個人，左邊名字、右邊累加的分數 -->
    <template v-if="tally && !resultOpen">
      <div v-for="p in 4" :key="`tl${p}`" class="tally" :class="{ now: countingRow === p - 1 }" :style="{ left: `${spots.box.x + spots.box.w * 0.03}px`, width: `${spots.box.w * 0.94}px`, top: `${rowY(p - 1)}px` }">
        <span class="t-black tn">{{ names[p - 1] }}</span>
        <span :key="tally[p - 1]" class="t-slab tp pop">{{ tally[p - 1] }}</span>
      </div>
    </template>
    <div class="table-box" :style="{ left: `${spots.box.x}px`, top: `${spots.box.y}px`, width: `${spots.box.w}px`, height: `${spots.box.h}px` }">
      <span class="t-label lab">TABLE</span>
    </div>
    <span v-if="!tally" class="t-label pile-lab" :style="{ left: `${spots.pile.x}px`, top: `${spots.pile.y + layout.cw * 0.8}px` }">{{ T.pile }} · {{ state.pile.length }}</span>

    <!-- 座位上的人＋目前的分數 -->
    <template v-for="(seat, p) in layout.seats" :key="p">
      <div class="who" :class="{ active: phase === 'play' && state.turn === p }" :style="{ left: `${seat.kid.x - seat.kid.w / 2}px`, top: `${seat.kid.y - seat.kid.w}px`, width: `${seat.kid.w}px`, height: `${seat.kid.w}px` }">
        <Avatar :look="looks[p]" :mood="moods[p]" :flip="p === 1" />
      </div>
      <div v-if="p !== ME" class="tag" :class="[`al-${seat.label.align}`, { active: phase === 'play' && state.turn === p }]" :style="{ left: `${seat.label.x}px`, top: `${seat.label.y}px` }">
        <span class="nm t-black"><span class="hl" />{{ names[p] }}</span>
        <span class="t-slab pts">{{ scores[p].points }}</span>
      </div>
    </template>
    <div class="my-pts" :style="{ left: `${layout.seats[0].kid.x}px`, bottom: `${layout.seats[0].kid.w + 14}px` }">
      <span class="t-label">{{ S.common.you }}</span>
      <span class="t-slab pts">{{ scores[ME].points }}</span>
    </div>

    <div class="cards">
      <div
        v-for="c in ALL"
        :key="c"
        :ref="(el) => stage.attach(c, el as HTMLElement | null)"
        class="sprite"
        :class="{ mine: state.hands[ME].includes(c), sel: selected === c, hit: (showHints || awaitFlip) && hits.includes(c), peekhit: showHints && peekHits.includes(c), red: isRed(c) }"
        :style="{ width: `${layout.cw}px`, height: `${ch}px`, marginLeft: `${-layout.cw / 2}px`, marginTop: `${-ch / 2}px` }"
        @click="tapCard(c)"
        @pointerenter="$event.pointerType === 'mouse' && (hoverCard = c)"
        @pointerleave="hoverCard === c && (hoverCard = null)"
      >
        <svg class="face" viewBox="-2 -2 78 108" aria-hidden="true"><CardArt :rank="rankText(c)" :suit="suitOf(c)" /></svg>
        <svg class="back" viewBox="-2 -2 78 108" aria-hidden="true"><CardArt back /></svg>
      </div>
    </div>

    <p class="status" :class="{ mine: (myTurn || awaitFlip) && !message, warn: !!message && !awaitFlip }" :style="{ bottom: `${layout.cw * 1.9}px` }">{{ status }}</p>

    <div class="corner"><IconBtn icon="menu" :label="S.common.menu" @click="menuOpen = true" /></div>
    <div class="actions">
      <Btn v-if="phase !== 'over'" class="rise" tone="red" size="lg" arrow block :disabled="!myTurn || selected === null" @click="playSelected">{{ T.play }}</Btn>
      <Btn v-else class="rise" tone="ink" size="lg" arrow block @click="resultOpen = true">{{ T.howTitle }}</Btn>
    </div>

    <CursorGlow />
    <GameMenu :open="menuOpen" :game="game" :options="props.options" @close="menuOpen = false" @restart="newRound" @exit="emit('exit')" :can-save="canSave" @save-exit="saveAndExit" />

    <Dialog flip :open="resultOpen" :title="resultTitle" :label="T.resultLabel" tone="red" wide @close="resultOpen = false">
      <table class="score">
        <thead>
          <tr>
            <th>{{ T.colPlayer }}</th>
            <th>{{ T.colReds }}</th>
            <th>{{ T.colPoints }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(sc, p) in scores" :key="p" class="rise" :class="{ winner: winners(state).includes(p) }" :style="{ '--i': p + 2 }">
            <td class="who-cell">
              <span class="who-in">
                <span class="mini"><Avatar :look="looks[p]" :mood="winners(state).includes(p) ? 'happy' : 'sad'" /></span>
                <span class="t-black">{{ names[p] }}</span>
                <Burst v-if="winners(state).includes(p)" class="pop" tone="red" size="1.9rem" style="--i: 6">{{ S.bigtwo.result.winnerStamp }}</Burst>
              </span>
            </td>
            <td class="reds">
              <svg v-for="c in sc.reds" :key="c" viewBox="-2 -2 78 108" class="tiny"><CardArt :rank="rankText(c)" :suit="suitOf(c)" :shadow="false" /></svg>
            </td>
            <td class="num t-slab" :class="{ red: winners(state).includes(p) }">{{ sc.points }}</td>
          </tr>
        </tbody>
      </table>
      <p class="how"><b class="t-black">{{ T.howTitle }}</b>{{ T.how }}</p>
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
.pile-lab {
  position: absolute;
  transform: translateX(-50%);
  font-size: 0.5rem;
  white-space: nowrap;
  color: var(--color-ink-2);
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
.sprite.mine,
.sprite.hit {
  cursor: pointer;
}
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
/* 可以吃的桌上牌：一圈鈷藍細框＋淡淡的藍光，輕輕放大縮小（不墊顏色） */
.sprite.hit::before {
  content: '';
  position: absolute;
  inset: -5% -6%;
  border: 0.16rem solid var(--color-blue);
  border-radius: 10%;
  box-shadow: 0 0 0.9rem rgb(35 64 217 / 0.35);
  animation: hit 1.1s ease-in-out infinite;
  pointer-events: none;
}
/* 滑鼠預覽：能配的牌先出現藍色虛線框 */
.sprite.peekhit::before {
  content: '';
  position: absolute;
  inset: -5% -6%;
  border: 0.14rem dashed var(--color-blue);
  border-radius: 10%;
  pointer-events: none;
}
/* 可以吃的牌：藍框輕輕放大、縮小（呼吸），不上下搖 */
@keyframes hit {
  50% {
    transform: scale(1.05);
  }
}
/* 數牌：每一列的名字與分數；正在數的那一列亮起來 */
.tally {
  position: absolute;
  z-index: 950;
  display: flex;
  align-items: center;
  justify-content: space-between;
  translate: 0 -50%;
  padding: 0 0.6rem;
  pointer-events: none;
  animation: rise 360ms var(--ease-out) both;
}
.tally .tn {
  font-size: 0.85rem;
  opacity: 0.45;
  transition: opacity 200ms ease;
}
.tally .tp {
  font-size: 1.4rem;
  color: var(--color-red);
  opacity: 0.45;
}
.tally.now .tn,
.tally.now .tp {
  opacity: 1;
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
  line-height: 1.15;
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
.pts {
  font-size: 1rem;
  color: var(--color-red);
}
.my-pts {
  position: absolute;
  z-index: 2;
  display: flex;
  align-items: baseline;
  gap: 0.35rem;
  transform: translateX(-50%);
}
.my-pts .pts {
  font-size: 1.3rem;
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
.actions {
  position: absolute;
  right: max(1rem, env(safe-area-inset-right));
  bottom: 0.7rem;
  width: 8.4rem;
  z-index: 700;
}
.score {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
  line-height: 1.4;
}
.score th {
  padding: 0 0.5rem 0.2rem;
  border-bottom: 0.14rem solid var(--color-ink);
  font-size: 0.6rem;
  font-weight: 900;
  letter-spacing: 0.15em;
  color: var(--color-ink-2);
  text-align: left;
}
.score th:last-child {
  text-align: right;
}
.score td {
  padding: 0.12rem 0.5rem;
  border-bottom: 0.07rem solid var(--color-ink);
}
.who-cell {
  vertical-align: middle;
}
.who-in {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  white-space: nowrap;
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
.reds {
  line-height: 0;
}
.tiny {
  display: inline-block;
  width: 1.35rem;
  height: 1.9rem;
  margin-right: -0.55rem;
}
.score .num {
  text-align: right;
  font-size: 1.1rem;
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
/* 滑鼠移到自己的手牌上：那張牌先浮起一點（預覽要出哪張） */
@media (hover: hover) and (pointer: fine) {
  .sprite.mine {
    transition: translate 160ms var(--ease-out);
  }
  .sprite.mine:hover {
    translate: 0 -7%;
  }
}
</style>
