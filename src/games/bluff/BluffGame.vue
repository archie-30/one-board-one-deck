<script setup lang="ts">
// 吹牛：你在下面，三位電腦在左、上、右。牌都蓋著出，邊出邊喊點數（可以說謊）。
// 點手牌選起來（最多 4 張）；帶頭時在桌上選要喊的點數，再按「出牌」。跟牌時可以「過」；上一家剛出牌時可以喊「吹牛！」抓他。
// 每張牌都是獨立的精靈（沿用大老二的 CardStage）：出牌蓋著飛到桌中間、被抓時那一手翻開給大家看、整疊飛到吃牌的人手上、大家都過就收到左邊。
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef } from 'vue'
import { playSound } from '@/core/audio'
import { useGrace } from '@/core/grace'
import { afterReveal } from '@/core/launch'
import { opponentById, pickOpponents } from '@/core/opponents'
import { bringInto, isWatching, joinLiveMatch, matchOpponents, matchPlayers, rotate, sendAct, toAbs, toLocal, watchSeats } from '@/core/onlineMatch'
import { recordResult, stats } from '@/core/settings'
import { myLook } from '@/core/profile'
import { S } from '@/data/strings'
import { TURN_SECONDS } from '@/data/timer'
import { asCardLevel, bluffAt } from '@/engine/common/difficulty'
import { seedRng, nextInt, type RngState } from '@/engine/common/rng'
import { chooseBluffAction } from '@/engine/bluff/ai'
import { applyBluff, canCall, dealBluff, MAX_PLAY, mustLead, pileCount, placings, quadCards, RANK_LABELS, rankOf, suitOf, takeQuads, type BluffAction, type BluffEvent, type BluffState, type Card } from '@/engine/bluff/rules'
import { CardStage } from '@/games/bigtwo/cardStage'
import type { GameDef } from '@/games/types'
import Avatar from '@/ui/art/Avatar.vue'
import CardArt from '@/ui/art/Card.vue'
import type { Mood } from '@/ui/art/look'
import Btn from '@/ui/Btn.vue'
import RematchBtn from '@/ui/RematchBtn.vue'
import CursorGlow from '@/ui/CursorGlow.vue'
import Dialog from '@/ui/Dialog.vue'
import GameMenu from '@/ui/GameMenu.vue'
import IconBtn from '@/ui/IconBtn.vue'
import TurnGlow from '@/ui/TurnGlow.vue'
import TurnTimer from '@/ui/TurnTimer.vue'
import { bluffLayout, bluffPoses, type BluffLayout } from './layout'

const props = defineProps<{ game: GameDef; options: Record<string, string | boolean>; resume?: unknown }>()
const emit = defineEmits<{ exit: []; save: [data: unknown] }>()

interface Saved {
  state: BluffState
  opponents: number[]
  seed: number
  rng: number
}
const saved = (props.resume ?? null) as Saved | null
/** 連線對局：伺服器發牌、當裁判（沒有就是一般的單人對電腦） */
const net = saved ? null : joinLiveMatch('bluff')
/** 觀戰：從下方那位玩家的角度看，但看不到他的手牌、不能操作、不記戰績 */
const watching = !!net && isWatching(net)
/** 看不到的手牌從第幾位開始（觀戰時下方那位的也看不到） */
const H0 = watching ? 0 : 1
const rules = net ? { ...props.options, ...net.opts } : props.options

const T = S.bluff
const ME = 0
const ALL: Card[] = Array.from({ length: 52 }, (_, i) => i)
const SIDES = ['bottom', 'right', 'top', 'left'] as const
const RANKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
const timed = rules.timer !== false
const difficulty = asCardLevel(rules.difficulty)

let seed = saved ? saved.seed : (Date.now() >>> 0) % 2147483647
let rng: RngState = saved ? saved.rng : seedRng(seed + 7)
const opponents = reactive(net ? matchOpponents(net) : saved ? saved.opponents.map(opponentById) : pickOpponents(3, Date.now(), difficulty === 'high'))
const seated = watching ? matchPlayers(net!) : null
const names = reactive(seated ? seated.map((o) => o.name) : [S.common.you, ...opponents.map((o) => o.name)])
if (net)
  watchSeats(net, (ps) =>
    ps.forEach((o, i) => {
      if (i > 0) ((opponents[i - 1] = o), (names[i] = o.name))
      else if (watching) names[0] = o.name
    }),
  )
const looks = seated ? seated.map((o) => o.look) : [myLook(), ...opponents.map((o) => o.look)]

/** 規則設定「四張一樣棄牌」（預設開） */
const bluffOpts = { fourDiscard: rules.fourDiscard !== false }
const state = shallowRef<BluffState>(net ? netStart() : saved ? saved.state : dealBluff(seed, bluffOpts))
/** 畫面上照這個局面擺牌（被抓、收牌時先停在動作之前的樣子一下，再換成 state） */
const shown = shallowRef<BluffState>(state.value)
/** 正在翻開給大家看的那一手；revealOpen＝已經翻成正面（還沒翻時先拿起來） */
const revealCards = shallowRef<Card[] | null>(null)
const revealOpen = ref(false)
const grace = useGrace(props.options, state, () => state.value.turn === ME)
const phase = ref<'deal' | 'play' | 'over'>(saved ? 'play' : 'deal')
const gathered = ref(!saved)
const selected = ref<Card[]>([])
/** 帶頭時要喊的點數 */
const leadRank = ref<number | null>(null)
const message = ref('')
/** 桌上的大字（抓到了、說真話、收牌…） */
const banner = ref('')
const menuOpen = ref(false)
const resultOpen = ref(false)
const moods = reactive<Mood[]>(['idle', 'idle', 'idle', 'idle'])
/** 桌上「誰說了什麼」（最新的在最上面；留到下一個人做事，下一位想多久都看得到） */
const log = ref<{ id: number; p: number; text: string; hot: boolean }[]>([])
let logId = 0
/** 正在播動畫（被抓翻牌、收牌）：這段時間不能操作 */
const busy = ref(false)

const timers = new Set<number>()
function later(fn: () => void, ms: number) {
  const id = window.setTimeout(() => {
    timers.delete(id)
    if (menuOpen.value && !net) later(fn, 250)
    else fn()
  }, ms)
  timers.add(id)
}

// ── 版面與動畫 ──
const stageEl = ref<HTMLElement>()
const L = shallowRef<BluffLayout>(bluffLayout(844, 390))
const ch = computed(() => (L.value.cw * 108) / 78)
const stage = new CardStage()
let lastLand = 0
stage.onLand = () => {
  const now = performance.now()
  if (now - lastLand > 45) playSound(phase.value === 'deal' ? 'deal' : 'card')
  lastLand = now
}
function sync(fly: Card[] = [], opts: { stagger?: number; dur?: number; arc?: number; order?: (c: Card) => number; z?: number } = {}, instant = false) {
  const poses = bluffPoses(L.value, shown.value, selected.value, gathered.value, revealCards.value, phase.value === 'over', revealOpen.value)
  for (const c of ALL) {
    let pose = poses.get(c)
    if (!pose) continue
    if (watching && phase.value !== 'over' && shown.value.hands[ME].includes(c)) pose = { ...pose, f: 0 }
    const fi = fly.indexOf(c)
    if (fi >= 0) {
      const k = opts.order ? opts.order(c) : fi
      const v = Math.random()
      const st = opts.stagger ?? 0
      stage.move(c, pose, { delay: k * st + v * st * 0.4, dur: (opts.dur ?? 420) * (0.88 + v * 0.3), arc: (opts.arc ?? L.value.cw * 0.8) * (0.65 + Math.random() * 0.7), flightZ: (opts.z ?? 600) + k, land: true, instant })
    } else stage.move(c, pose, { dur: 240, instant })
  }
}
let observer: ResizeObserver | undefined
onMounted(() => {
  const el = stageEl.value!
  const measure = () => {
    L.value = bluffLayout(el.clientWidth, el.clientHeight)
    sync([], {}, true)
  }
  measure()
  observer = new ResizeObserver(measure)
  observer.observe(el)
  if (saved) nextTurn()
  else void afterReveal().then(() => later(deal, 120))
})
onBeforeUnmount(() => {
  observer?.disconnect()
  stage.destroy()
  timers.forEach((t) => window.clearTimeout(t))
})

// ── 流程 ──
function deal() {
  phase.value = 'deal'
  playSound('shuffle')
  gathered.value = false
  const order = new Map<Card, number>()
  state.value.hands.forEach((h, seat) => h.forEach((c, k) => order.set(c, k * 4 + seat)))
  sync(ALL, { stagger: 24, dur: 320, arc: 16, order: (c) => order.get(c) ?? 0 })
  later(() => {
    phase.value = 'play'
    // 開局就湊齊四張的：寫在桌上
    for (const q of state.value.quads ?? []) noteQuad(q.player, q.rank)
    nextTurn()
  }, 52 * 24 + 420)
}
/** 某人棄掉四張一樣的：桌上記一句、對他來說是好事 */
function noteQuad(p: number, rank: number) {
  note(p, T.quad(RANK_LABELS[rank]))
  flash(p, 'smug', 1400)
}

/** 記一句「某某：2 張 7」到桌上（只留最近兩句） */
function note(p: number, text: string, hot = false) {
  log.value = [{ id: ++logId, p, text, hot }, ...log.value].slice(0, 2)
}

let scheduledFor: BluffState | null = null
function nextTurn() {
  if (net) return pump()
  const s = state.value
  if (s.over || phase.value !== 'play' || busy.value) return
  if (scheduledFor === s) return
  scheduledFor = s
  moods.forEach((m, i) => m === 'think' && (moods[i] = 'idle'))
  if (s.turn === ME) return
  const p = s.turn
  moods[p] = 'think'
  const st = bluffAt(opponents[p - 1].persona.bigtwo, difficulty)
  const at = state.value
  later(
    () => {
      if (state.value !== at || at.over || phase.value !== 'play') return
      let a: BluffAction
      ;[a, rng] = chooseBluffAction(state.value, st, rng)
      act(a)
    },
    // 電腦想一下：帶頭、抓不抓要想久一點
    (mustLead(s) || canCall(s) ? 1900 : 1300) + Math.random() * 1100,
  )
}

/** 套用一個動作並播動畫；done：動畫播完後（連線時拿下一個動作） */
function act(a: BluffAction): boolean {
  const before = state.value
  const r = applyBluff(before, a)
  if (!r.ok) {
    message.value = T.errors[r.reason]
    playSound('error')
    return false
  }
  state.value = r.state
  if (a.player === ME) {
    selected.value = []
    leadRank.value = null
  } else selected.value = selected.value.filter((c) => r.state.hands[ME].includes(c))
  message.value = ''
  const p = a.player
  if (moods[p] === 'think') moods[p] = 'idle'
  const evs = r.state.events
  const newlyOut = r.state.out.filter((x) => !before.out.includes(x))
  let wait = 520
  const ev = evs[0] as BluffEvent
  if (ev.type === 'play') {
    note(p, T.said(ev.count, RANK_LABELS[ev.rank]))
    const played = r.state.plays[r.state.plays.length - 1].cards
    shown.value = r.state
    // 一張張蓋到桌上：平順地滑過去、途中翻成背面（不往上拋）
    sync(played, { stagger: 90, dur: 560, arc: L.value.cw * 0.25, z: 1100 })
  } else if (ev.type === 'pass') {
    note(p, T.passed)
    playSound('pass')
    const clear = evs.find((e) => e.type === 'clear')
    if (clear) {
      // 大家都過：停一下，桌上這疊收到左邊
      busy.value = true
      shown.value = { ...r.state, plays: before.plays, discard: before.discard }
      sync()
      wait = 1500
      later(() => {
        banner.value = T.cleared
        shown.value = r.state
        playSound('collect')
        sync(before.plays.flatMap((x) => x.cards), { stagger: 30, dur: 460, arc: L.value.cw * 0.3 })
        later(() => (banner.value = ''), 1400)
        busy.value = false
      }, 800)
    } else {
      shown.value = r.state
      sync()
    }
  } else if (ev.type === 'call') {
    // 抓：喊「吹牛！」→ 那一手翻開 → 說謊／說真話 → 整疊飛到吃牌的人手上
    busy.value = true
    note(p, T.call, true)
    moods[ev.target] = 'shock'
    playSound('reveal')
    shown.value = before
    // 先把那一手從牌堆裡拿起來（還蓋著），停一下再一張張翻開
    revealCards.value = ev.cards
    revealOpen.value = false
    sync(ev.cards, { stagger: 70, dur: 380, arc: L.value.cw * 0.15, z: 1100 })
    wait = 3300
    later(() => {
      revealOpen.value = true
      playSound('flip')
      sync(ev.cards, { stagger: 160, dur: 460, arc: L.value.cw * 0.2, z: 1100 })
    }, 650)
    later(() => {
      banner.value = ev.liar ? T.lied(names[ev.target]) : T.honest(names[ev.target])
      flash(ev.liar ? p : ev.target, 'smug', 1600)
      flash(ev.taker, 'sad', 1800)
      playSound(ev.liar ? 'correct' : 'error')
    }, 1450)
    later(() => {
      banner.value = T.takes(names[ev.taker], ev.pile)
      revealCards.value = null
      revealOpen.value = false
      shown.value = state.value
      playSound('collect')
      // 整疊一張張飛到吃牌的人手上（湊齊四張的直接翻開飛到桌上棄牌區）
      sync([...before.plays.flatMap((x) => x.cards), ...evs.flatMap((e) => (e.type === 'quad' ? quadCards(e.rank) : []))], { stagger: 40, dur: 560, arc: L.value.cw * 0.4, z: 1100 })
      for (const e of evs) if (e.type === 'quad') noteQuad(e.player, e.rank)
      later(() => (banner.value = ''), 1200)
      busy.value = false
    }, 2500)
  } else {
    shown.value = r.state
    sync()
  }
  for (const x of newlyOut) {
    later(() => {
      note(x, T.place(r.state.out.indexOf(x) + 1))
      flash(x, 'happy', 2000)
    }, wait - 300)
  }
  if (r.state.over && !net) later(finish, wait + 700)
  else later(nextTurn, wait)
  return true
}

function flash(p: number, mood: Mood, ms: number) {
  moods[p] = mood
  later(() => moods[p] === mood && phase.value === 'play' && (moods[p] = 'idle'), ms)
}

const places = computed(() => placings(state.value))
function finish() {
  phase.value = 'over'
  message.value = ''
  banner.value = ''
  shown.value = state.value
  revealCards.value = null
  revealOpen.value = false
  const pl = places.value
  for (let p = 0; p < 4; p++) moods[p] = pl[p] === 1 ? 'happy' : pl[p] === 4 ? 'sad' : 'idle'
  sync()
  if (!watching) {
    stats.bluff.rounds++
    if (pl[ME] === 1) stats.bluff.wins++
    // 表現：名次越前面越好
    recordResult('bluff', difficulty, pl[ME] === 1 ? 'w' : 'l', pl[ME] === 1 ? 0.6 : (4 - pl[ME]) / 3)
  }
  playSound(pl[ME] === 1 && !watching ? 'win' : 'lose')
  later(() => (resultOpen.value = true), 900)
}

function newRound() {
  if (net) return
  timers.forEach((t) => window.clearTimeout(t))
  timers.clear()
  menuOpen.value = false
  resultOpen.value = false
  selected.value = []
  leadRank.value = null
  message.value = ''
  banner.value = ''
  log.value = []
  moods.fill('idle')
  busy.value = false
  revealCards.value = null
  phase.value = 'deal'
  gathered.value = true
  sync(ALL, { stagger: 7, dur: 360, arc: 0 })
  later(() => {
    let k: number
    ;[k, rng] = nextInt(rng, 2147483646)
    seed = k + 1
    state.value = dealBluff(seed, bluffOpts)
    shown.value = state.value
    acted.value = false
    deal()
  }, 52 * 7 + 480)
}

// ── 連線對局 ──
// 伺服器送來的每個動作（包括自己的）照順序套用；動畫播完再拿下一個。
// 別人的手牌、桌上蓋著的牌、收掉的牌在這裡只是「沒看過的牌」：別人出牌時從他手上拿幾張背面蓋到桌上；
// 有人被抓時伺服器才說那一手是哪幾張，換到那一手的位置；整疊被你吃下時伺服器告訴你是哪些牌，換進你手上。
const sending = ref(false)
let waiting = false
/** 看不到的牌裡，已經知道真面目、位置也對的牌（翻開過的） */
const known = new Set<Card>()
if (net)
  net.onEvent = () => {
    if (!waiting) return
    waiting = false
    pump()
  }
if (net)
  net.onReject = () => {
    sending.value = false
    playSound('error')
  }
onBeforeUnmount(() => {
  if (net) net.onEvent = net.onReject = null
})
function fromServer(s: BluffState): BluffState {
  const m = net!
  const loc = (p: number) => toLocal(m, p)
  return { ...s, hands: rotate(m, s.hands), plays: s.plays.map((x) => ({ ...x, player: loc(x.player) })), turn: loc(s.turn), last: s.last === null ? null : loc(s.last), out: s.out.map(loc), events: [] }
}
function netStart(): BluffState {
  const m = net!
  const st = m.start as { hand: Card[]; counts: number[]; turn: number; quads?: { player: number; rank: number }[] }
  const counts = rotate(m, st.counts)
  const quads = (st.quads ?? []).map((q) => ({ player: toLocal(m, q.player), rank: q.rank }))
  const gone = quads.flatMap((q) => quadCards(q.rank))
  const unknown = ALL.filter((c) => !st.hand.includes(c) && !gone.includes(c))
  let k = 0
  const hands = counts.map((n, p) => (p === ME && !watching ? st.hand.slice() : unknown.slice(k, (k += n))))
  // 棄牌由伺服器說（別人的手牌在這裡是假的，本機算不出誰湊齊四張）
  return { hands, plays: [], claim: null, turn: toLocal(m, st.turn), last: null, passes: 0, discard: [], out: [], moves: 0, events: [], over: false, quads, opts: { fourDiscard: false } }
}
function mine(a: BluffAction): boolean {
  if (!net) return act(a)
  if (sending.value) return false
  const r = applyBluff(state.value, a)
  if (!r.ok) {
    message.value = T.errors[r.reason]
    playSound('error')
    return false
  }
  sending.value = true
  acted.value = true
  sendAct({ ...a, player: toAbs(net, a.player) })
  return true
}
/** 看不到的牌放在哪幾疊：別人的手牌（觀戰時連下方那位）、桌上每一手、收掉的牌 */
function hiddenZones(s: BluffState): number[][] {
  return [...s.hands.slice(H0).map((h) => h.slice()), ...s.plays.map((x) => x.cards.slice()), s.discard.slice()]
}
function withZones(s: BluffState, z: number[][]): BluffState {
  const n = 4 - H0
  return { ...s, hands: [...s.hands.slice(0, H0), ...z.slice(0, n)], plays: s.plays.map((x, i) => ({ ...x, cards: z[n + i] })), discard: z[n + s.plays.length] }
}
/** 把 cards 換進第 into 疊（畫面上的牌跟著換身分，位置不動） */
function bringAll(z: number[][], into: number, cards: readonly Card[], keep: readonly Card[]) {
  for (const c of cards) {
    const pair = bringInto(z, into, c, keep)
    if (pair) stage.adopt([[pair[1], pair[0]], [pair[0], pair[1]]])
  }
}
function pump() {
  const m = net!
  const e = m.queue.shift()
  if (!e) {
    waiting = true
    const s = state.value
    if (s.over || phase.value !== 'play') return
    moods.forEach((v, i) => v === 'think' && (moods[i] = 'idle'))
    if (s.turn !== ME || watching) moods[s.turn] = 'think'
    return
  }
  if (e.end) return revealEnd(e.ev as BluffState)
  // 還在播被抓／收牌的動畫：等一下再拿
  if (busy.value) {
    m.queue.unshift(e)
    later(pump, 200)
    return
  }
  const raw = e.ev as { type: string; player: number; count?: number; rank?: number; cards?: Card[]; pileCards?: Card[]; quads?: { player: number; rank: number }[] }
  const p = toLocal(m, raw.player)
  if (p === ME) sending.value = false
  let a: BluffAction
  const s0 = state.value
  if (raw.type === 'play') {
    let cards: Card[]
    if (p === ME && !watching && raw.cards) cards = raw.cards
    else {
      // 別人出牌：從他手上拿幾張沒看過的牌蓋出去（先挑還不知道身分的）
      const hand = s0.hands[p]
      cards = [...hand.filter((c) => !known.has(c)), ...hand.filter((c) => known.has(c))].slice(0, raw.count ?? 1)
    }
    a = { type: 'play', player: p, cards, rank: raw.rank }
  } else if (raw.type === 'call') {
    // 先把翻開的牌換到被抓的那一手（自己出的那手本來就是真的）
    const s = state.value
    const lastIdx = s.plays.length - 1
    const real = raw.cards ?? []
    const target = s.plays[lastIdx]?.player
    if (lastIdx >= 0 && (target !== ME || watching)) {
      const z = hiddenZones(s)
      const into = 4 - H0 + lastIdx
      bringAll(z, into, real, real)
      state.value = withZones(s, z)
    }
    for (const c of real) known.add(c)
    a = { type: 'call', player: p }
  } else a = { type: 'pass', player: p }
  if (!act(a)) {
    console.warn('online: 套用不了伺服器送來的動作', a)
    later(nextTurn, 50)
    return
  }
  // 整疊被你吃下：伺服器說了是哪些牌，換進你手上
  if (raw.type === 'call' && raw.pileCards && !watching) {
    const s = state.value
    const z = [s.hands[ME].slice(), ...s.hands.slice(1).map((h) => h.slice()), s.discard.slice()]
    const keep = [...raw.pileCards, ...s0.hands[ME]]
    for (const c of raw.pileCards) {
      const pair = bringInto(z, 0, c, keep)
      if (pair) stage.adopt([[pair[1], pair[0]], [pair[0], pair[1]]])
    }
    state.value = { ...s, hands: z.slice(0, 4).map((h, i) => (i === 0 ? h.slice().sort((x, y) => rankOf(x) - rankOf(y) || suitOf(x) - suitOf(y)) : h)), discard: z[4] }
    for (const c of raw.pileCards) known.delete(c)
  }
  // 伺服器說有人湊齊四張棄掉：把那四張換到他手上（畫面上換身分），再從手上拿掉
  for (const q of raw.quads ?? []) {
    const qp = toLocal(m, q.player)
    const cards = quadCards(q.rank)
    let s = state.value
    if (qp !== ME || watching) {
      const z = hiddenZones(s)
      bringAll(z, qp - H0, cards, cards)
      s = withZones(s, z)
    }
    s = takeQuads(s, qp, [q.rank])
    // 他棄光了又剛好輪到他：換下一個還有牌的人
    if (!s.hands[s.turn].length) for (let k = 1; k <= 4; k++) if (s.hands[(s.turn + k) % 4].length) ((s = { ...s, turn: (s.turn + k) % 4 }), (k = 9))
    state.value = s
    shown.value = s
    for (const c of cards) known.delete(c)
    later(() => noteQuad(qp, q.rank), raw.type === 'call' ? 2600 : 0)
  }
  if (raw.quads?.length) later(() => sync(raw.quads!.flatMap((q) => quadCards(q.rank)), { stagger: 40, dur: 520, z: 1100 }), raw.type === 'call' ? 2550 : 0)
}
/** 伺服器攤牌：背面的牌換成真的（位置不動），再結算 */
function revealEnd(fin: BluffState) {
  const real = fromServer(fin)
  const pairs: [number, number][] = []
  const b = hiddenZones(state.value)
  const r = hiddenZones(real)
  b.forEach((zone, i) => zone.forEach((c, k) => r[i]?.[k] !== undefined && r[i][k] !== c && pairs.push([c, r[i][k]])))
  if (pairs.length) stage.adopt(pairs)
  state.value = real
  shown.value = real
  sync()
  later(finish, 600)
}

// ── 你的操作 ──
const myTurn = computed(() => !watching && phase.value === 'play' && !state.value.over && state.value.turn === ME && !busy.value)
const leading = computed(() => myTurn.value && mustLead(state.value))
const callable = computed(() => myTurn.value && canCall(state.value, ME))
/** 這一手要喊的點數 */
const claimRank = computed(() => (mustLead(state.value) ? leadRank.value : state.value.claim))
const status = computed(() => {
  if (message.value) return message.value
  const s = state.value
  if (phase.value === 'deal') return ''
  if (s.over) return places.value[ME] === 1 ? T.win : T.lose
  if (busy.value) return ''
  if (!myTurn.value) return (watching ? `${S.online.watchingNow}・` : '') + T.waiting(names[s.turn])
  if (mustLead(s)) return T.yourLead
  if (callable.value) return T.canCall(names[s.last!], RANK_LABELS[s.claim!])
  return T.yourFollow(RANK_LABELS[s.claim!])
})

function tapCard(c: Card) {
  if (watching || phase.value !== 'play' || !state.value.hands[ME].includes(c)) return
  const sel = selected.value
  if (sel.includes(c)) selected.value = sel.filter((x) => x !== c)
  else if (sel.length >= MAX_PLAY) {
    message.value = T.errors.count
    playSound('error')
    return
  } else {
    selected.value = [...sel, c]
    // 帶頭時還沒選點數：先幫你選第一張的點數
    if (leadRank.value === null) leadRank.value = rankOf(c)
  }
  message.value = ''
  playSound('cardPick')
  sync()
}
function pickRank(r: number) {
  leadRank.value = r
  playSound('tap')
}
function playSel() {
  if (!myTurn.value || !selected.value.length) return
  const rank = claimRank.value
  if (rank === null) {
    message.value = T.errors.needRank
    playSound('error')
    return
  }
  acted.value = true
  mine({ type: 'play', player: ME, cards: selected.value.slice(), rank })
}
function passTurn() {
  if (!myTurn.value || mustLead(state.value)) return
  acted.value = true
  mine({ type: 'pass', player: ME })
}
function callBluff() {
  if (!callable.value) return
  acted.value = true
  mine({ type: 'call', player: ME })
}
function onTimeout() {
  if (net) return
  if (!myTurn.value) return
  acted.value = true
  act({ type: 'timeout', player: ME })
}

// ── 保存進度並退出 ──
const acted = ref(!!saved)
const canSave = computed(() => !net && phase.value === 'play' && acted.value && !busy.value)
function snapshot(): Saved | null {
  if (!canSave.value) return null
  return { state: state.value, opponents: opponents.map((o) => o.id), seed, rng }
}
function saveAndExit() {
  const data = snapshot()
  if (data) emit('save', data)
}
defineExpose({ pause: () => phase.value !== 'over' && !resultOpen.value && (menuOpen.value = true), snapshot })

const rankText = (c: Card) => RANK_LABELS[rankOf(c)]
/** 結算表：照名次排 */
const order = computed(() => [0, 1, 2, 3].sort((a, b) => places.value[a] - places.value[b]))
</script>

<template>
  <section ref="stageEl" class="felt">
    <TurnGlow v-for="(side, p) in SIDES" :key="side" :side="side" :me="p === ME" :on="phase === 'play' && !state.over && state.turn === p" />
    <TurnTimer v-if="timed" :side="SIDES[state.turn]" :active="phase === 'play' && !state.over && !busy && !(grace && state.turn === ME)" :paused="!net && (menuOpen || resultOpen)" :seconds="TURN_SECONDS.cards" :turn-key="state" @timeout="onTimeout" />

    <div class="table-box" :style="{ left: `${L.box.x}px`, top: `${L.box.y}px`, width: `${L.box.w}px`, height: `${L.box.h}px` }">
      <span class="t-label lab">TABLE</span>
    </div>
    <!-- 收掉幾張、桌上幾張 -->
    <span v-if="shown.discard.length" class="tiny t-label" :style="{ left: `${L.discardAt.x}px`, top: `${L.discardAt.y + ch * L.tableScale * 0.55}px` }">{{ T.discardLabel(shown.discard.length) }}</span>
    <span v-if="shown.plays.length && !revealCards" class="tiny t-label" :style="{ left: `${L.pileAt.x}px`, top: `${L.pileAt.y + ch * L.tableScale * 0.75}px` }">{{ T.pileLabel(pileCount(shown)) }}</span>
    <!-- 誰說了什麼：桌框左上角，最新一句粗黑、上一句淡淡的；留到下一個人做事 -->
    <TransitionGroup tag="ol" name="lg" class="log" :style="{ left: `${L.box.x + L.cw * 0.18}px`, top: `${L.box.y + L.cw * 0.2}px`, maxWidth: `${L.box.w * 0.36}px` }">
      <li v-for="(l, i) in log" :key="l.id" class="ln" :class="{ old: i > 0, hot: l.hot }">
        <span class="who-nm">{{ names[l.p] }}</span><span class="said">{{ l.text }}</span>
      </li>
    </TransitionGroup>
    <!-- 這一輪喊的點數 -->
    <div class="claim" :style="{ left: `${L.claimAt.x}px`, top: `${L.claimAt.y}px` }">
      <span class="t-label">{{ T.claimLabel }}</span>
      <span class="big t-slab" :class="{ none: shown.claim === null }">{{ shown.claim === null ? '－' : RANK_LABELS[shown.claim] }}</span>
    </div>
    <Transition name="pop">
      <p v-if="banner" :key="banner" class="banner t-black" :style="{ left: `${L.pileAt.x}px`, top: `${L.pileAt.y - ch * L.tableScale * 0.95}px` }">{{ banner }}</p>
    </Transition>

    <!-- 座位上的人 -->
    <template v-for="(seat, p) in L.seats" :key="p">
      <div class="who" :class="{ active: phase === 'play' && state.turn === p }" :style="{ left: `${seat.kid.x - seat.kid.w / 2}px`, top: `${seat.kid.y - seat.kid.w}px`, width: `${seat.kid.w}px`, height: `${seat.kid.w}px` }">
        <Avatar :look="looks[p]" :mood="moods[p]" :flip="p === 1" :talk="p !== ME" />
      </div>
      <div v-if="p !== ME || watching" class="tag" :class="[`al-${seat.label.align}`, { active: phase === 'play' && state.turn === p }]" :style="{ left: `${seat.label.x}px`, top: `${seat.label.y}px` }">
        <span class="nm t-black"><span class="hl" />{{ names[p] }}</span>
        <span class="t-label tg">{{ state.out.includes(p) ? T.place(state.out.indexOf(p) + 1) : p === ME ? seated![0].tag : opponents[p - 1].tag }}</span>
      </div>
    </template>

    <div class="cards">
      <div
        v-for="c in ALL"
        :key="c"
        :ref="(el) => stage.attach(c, el as HTMLElement | null)"
        class="sprite"
        :class="{ mine: !watching && state.hands[ME].includes(c), sel: selected.includes(c) }"
        :style="{ width: `${L.cw}px`, height: `${ch}px`, marginLeft: `${-L.cw / 2}px`, marginTop: `${-ch / 2}px` }"
        @click="tapCard(c)"
      >
        <svg class="face" viewBox="-2 -2 78 108" aria-hidden="true"><CardArt :rank="rankText(c)" :suit="suitOf(c)" /></svg>
        <svg class="back" viewBox="-2 -2 78 108" aria-hidden="true"><CardArt back /></svg>
      </div>
    </div>

    <!-- 帶頭：選要喊的點數 -->
    <Transition name="ranks">
      <div v-if="leading" class="ranks" :style="{ left: `${L.box.x + 8}px`, width: `${L.box.w - 16}px`, top: `${L.box.y + L.box.h - L.cw * 1.18}px` }" role="radiogroup" :aria-label="T.pickRank">
        <button v-for="r in RANKS" :key="r" class="rk t-slab" :class="{ on: leadRank === r }" role="radio" :aria-checked="leadRank === r" @click="pickRank(r)">{{ RANK_LABELS[r] }}</button>
      </div>
    </Transition>

    <p class="status" :class="{ mine: myTurn && !message, warn: !!message }" :style="{ top: `${L.box.y + L.box.h - 4}px` }">{{ status }}</p>

    <div class="corner"><IconBtn icon="menu" :label="S.common.menu" @click="menuOpen = true" /></div>
    <div class="actions" :class="{ over: phase === 'over' }">
      <template v-if="phase !== 'over' && !watching">
        <Transition name="callin">
          <Btn v-if="callable" class="callbtn" tone="yellow" size="lg" block @click="callBluff">{{ T.call }}</Btn>
        </Transition>
        <Btn v-if="!mustLead(state) && phase === 'play'" size="sm" block :disabled="!myTurn || sending" @click="passTurn">{{ T.pass }}</Btn>
        <Btn class="rise" tone="red" size="lg" block :style="{ '--fs': '1.05rem' }" :disabled="!myTurn || !selected.length || claimRank === null || sending" @click="playSel">{{ selected.length && claimRank !== null ? T.playAs(selected.length, RANK_LABELS[claimRank]) : T.play }}</Btn>
      </template>
      <template v-else-if="phase === 'over'">
        <Btn class="rise" size="sm" icon="exit" @click="emit('exit')">{{ net ? S.online.backRoom : S.common.quit }}</Btn>
        <Btn v-if="!net" class="rise" size="sm" icon="again" style="--i: 1" @click="newRound">{{ S.common.again }}</Btn>
        <RematchBtn v-else class="rise" size="sm" style="--i: 1" />
        <Btn class="rise" tone="ink" size="lg" arrow style="--i: 2" @click="resultOpen = true">{{ S.common.showResult }}</Btn>
      </template>
    </div>

    <CursorGlow />
    <GameMenu :open="menuOpen" :game="game" :options="props.options" :can-save="canSave" @close="menuOpen = false" @restart="newRound" @exit="emit('exit')" @save-exit="saveAndExit" />

    <Dialog flip :open="resultOpen" :title="watching ? S.online.watchWin(names[order[0]]) : T.resultTitle(places[ME])" :label="T.resultLabel" tone="red" wide @close="resultOpen = false">
      <table class="score">
        <thead>
          <tr>
            <th>{{ T.colPlace }}</th>
            <th>{{ T.colPlayer }}</th>
            <th>{{ T.colLeft }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(p, i) in order" :key="p" class="rise" :class="{ winner: places[p] === 1 }" :style="{ '--i': i + 2 }">
            <td class="num t-slab" :class="{ red: places[p] === 1 }">{{ places[p] }}</td>
            <td>
              <span class="who-in">
                <span class="mini"><Avatar :look="looks[p]" :mood="places[p] === 1 ? 'happy' : places[p] === 4 ? 'sad' : 'idle'" /></span>
                <span class="t-black">{{ names[p] }}</span>
              </span>
            </td>
            <td class="num t-slab">{{ state.hands[p].length }}</td>
          </tr>
        </tbody>
      </table>
      <p class="how">{{ T.how }}</p>
      <p v-if="!watching" class="lifetime t-black">{{ T.record(stats.bluff.rounds, stats.bluff.wins) }}</p>
      <template #actions>
        <Btn icon="exit" size="sm" @click="emit('exit')">{{ net ? S.online.backRoom : S.common.quit }}</Btn>
        <Btn size="sm" icon="check" @click="resultOpen = false">{{ S.common.viewBoard }}</Btn>
        <Btn v-if="!net" tone="red" icon="again" @click="newRound">{{ S.common.again }}</Btn>
        <RematchBtn v-else tone="red" />
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
.tiny {
  position: absolute;
  z-index: 3;
  translate: -50% 0;
  white-space: nowrap;
  color: var(--color-ink-2);
  pointer-events: none;
}
.claim {
  position: absolute;
  z-index: 3;
  display: flex;
  translate: -50% -50%;
  flex-direction: column;
  align-items: center;
  pointer-events: none;
}
.claim .big {
  font-size: 3.2rem;
  line-height: 1;
  color: var(--color-red);
}
.claim .big.none {
  color: var(--color-ink-3);
}
.banner {
  position: absolute;
  z-index: 950;
  translate: -50% -50%;
  padding: 0.15rem 0.7rem;
  border: 0.14rem solid var(--color-ink);
  background: var(--color-yellow);
  box-shadow: 0.2rem 0.2rem 0 var(--color-ink);
  font-size: 1rem;
  white-space: nowrap;
  pointer-events: none;
}
.pop-enter-active {
  transition:
    opacity 180ms var(--ease-out),
    scale 320ms var(--ease-back);
}
.pop-leave-active {
  transition: opacity 160ms ease-in;
}
.pop-enter-from {
  opacity: 0;
  scale: 0.6;
}
.pop-leave-to {
  opacity: 0;
}
.log {
  position: absolute;
  /* 疊在牌上面：飛過去的牌、收掉的牌都不會蓋到字 */
  z-index: 760;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  margin: 0;
  padding: 0;
  list-style: none;
  pointer-events: none;
}
.ln {
  display: flex;
  align-items: baseline;
  gap: 0.35rem;
  white-space: nowrap;
  font-size: 1.1rem;
  font-weight: 900;
  line-height: 1.25;
  transition:
    font-size 260ms var(--ease-out),
    opacity 260ms ease;
}
.who-nm {
  padding: 0 0.3rem;
  background: var(--color-ink);
  color: var(--color-card);
  font-size: 0.8em;
}
.said {
  color: var(--color-ink);
}
.ln.hot .said {
  color: var(--color-red);
}
/* 上一句：縮小、淡掉（新的一句一來就把它往下推） */
.ln.old {
  font-size: 0.72rem;
  opacity: 0.55;
}
.lg-enter-active {
  transition:
    opacity 200ms var(--ease-out),
    transform 300ms var(--ease-back);
}
.lg-enter-from {
  opacity: 0;
  transform: translateY(-0.5rem) scale(0.9);
}
.lg-leave-active {
  position: absolute;
  transition: opacity 160ms ease-in;
}
.lg-leave-to {
  opacity: 0;
}
.lg-move {
  transition: transform 260ms var(--ease-out);
}
.cards {
  position: absolute;
  inset: 0;
  isolation: isolate;
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
@media (hover: hover) and (pointer: fine) {
  .sprite.mine {
    transition: translate 160ms var(--ease-out);
  }
  .sprite.mine:hover {
    translate: 0 -7%;
  }
}
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
.ranks {
  position: absolute;
  z-index: 750;
  display: grid;
  grid-template-columns: repeat(13, 1fr);
  gap: 0.2rem;
}
.rk {
  position: relative;
  height: 1.7rem;
  border: 0.12rem solid var(--color-ink);
  background: var(--color-card);
  padding: 0;
  font-size: 0.85rem;
  box-shadow: 0.1rem 0.1rem 0 var(--color-ink);
  transition:
    background-color 140ms ease,
    color 140ms ease,
    translate 110ms var(--ease-out);
}
.rk::after {
  content: '';
  position: absolute;
  inset: -0.2rem -0.1rem;
}
.rk.on {
  background: var(--color-ink);
  color: var(--color-card);
}
.rk:active {
  translate: 0.1rem 0.1rem;
  box-shadow: none;
}
.ranks-enter-active {
  transition:
    opacity 200ms var(--ease-out),
    translate 260ms var(--ease-out);
}
/* 收起來不播動畫：出牌時牌會從這裡飛過去，不能從還在淡出的按鈕底下穿過 */
.ranks-enter-from {
  opacity: 0;
  translate: 0 0.5rem;
}
.who {
  position: absolute;
  z-index: 2;
  pointer-events: none;
  transition: transform 300ms var(--ease-back);
}
.who.active {
  transform: translateY(-0.25rem);
}
.who :deep(svg) {
  width: 100%;
  height: 100%;
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
.status {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 0;
  translate: 0 -100%;
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
  right: 1rem;
  bottom: 0.7rem;
  display: flex;
  width: 8.4rem;
  flex-direction: column;
  gap: 0.45rem;
  z-index: 700;
}
.actions.over {
  width: auto;
  flex-direction: row;
  align-items: flex-end;
  gap: 0.6rem;
}
.callbtn {
  animation: nudge 1.6s ease-in-out infinite;
}
@keyframes nudge {
  0%,
  80%,
  100% {
    rotate: 0deg;
  }
  85% {
    rotate: -3deg;
  }
  90% {
    rotate: 3deg;
  }
  95% {
    rotate: -2deg;
  }
}
.callin-enter-active {
  transition:
    opacity 200ms var(--ease-out),
    translate 300ms var(--ease-back);
}
.callin-leave-active {
  transition:
    opacity 150ms ease-in,
    translate 150ms ease-in;
}
.callin-enter-from {
  opacity: 0;
  translate: 0 0.8rem;
}
.callin-leave-to {
  opacity: 0;
  translate: 0 0.5rem;
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
  padding: 0.15rem 0.5rem;
  border-bottom: 0.07rem solid var(--color-ink);
  text-align: center;
}
.score th:nth-child(2),
.score td:nth-child(2) {
  text-align: left;
}
.score .winner td {
  background: rgb(255 194 26 / 0.3);
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
.num {
  font-size: 1rem;
}
.red {
  color: var(--color-red);
}
.how {
  padding-top: 0.5rem;
  font-size: 0.72rem;
  line-height: 1.55;
  color: var(--color-ink-2);
}
.lifetime {
  padding-top: 0.2rem;
  font-size: 0.8rem;
}
@media (prefers-reduced-motion: reduce) {
  .callbtn {
    animation: none;
  }
}
</style>
