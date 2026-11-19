<script setup lang="ts">
// 九九：你在下面，三位電腦在左、上、右。桌子中間由左到右是牌堆、出過的牌、大大的總數（旁邊的箭頭是現在的方向）。
// 點手牌選起來再按「出牌」；10、Q 出現「加」「減」兩顆，5 出現每位還在場上的人讓你指定。
// 輪到你而手上每一張都會超過 99：狀態列寫「爆了」，過一下自動出局（牌攤開）。你出局之後電腦會打快一點。
// 每張牌都是獨立的精靈（沿用大老二的 CardStage）：發牌、出牌、補牌、洗牌都一張一張飛。
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
import { asCardLevel, ninetyNineAt } from '@/engine/common/difficulty'
import { seedRng, nextInt, type RngState } from '@/engine/common/rng'
import { chooseNinetyNineAction } from '@/engine/ninetynine/ai'
import { applyNinetyNine, canPlay, dealNinetyNine, kindOf, legalCards, mustOut, needsSign, nextAlive, RANK_LABELS, rankOf, ranks, suitOf, winners, type Card, type NinetyNineAction, type NinetyNineState } from '@/engine/ninetynine/rules'
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
import { ninetyNineLayout, ninetyNinePoses, type NinetyNineLayout } from './layout'
import { cardPreview } from './preview'

const props = defineProps<{ game: GameDef; options: Record<string, string | boolean>; resume?: unknown }>()
const emit = defineEmits<{ exit: []; save: [data: unknown] }>()

interface Saved {
  state: NinetyNineState
  opponents: number[]
  seed: number
  rng: number
}
const saved = (props.resume ?? null) as Saved | null
/** 連線對局：伺服器發牌、當裁判（沒有就是一般的單人對電腦） */
const net = saved ? null : joinLiveMatch('ninetynine')
/** 觀戰：從下方那位玩家的角度看，但看不到他的手牌、不能操作、不記戰績 */
const watching = !!net && isWatching(net)
/** 看不到的牌從第幾位開始（觀戰時下方那位的牌也看不到） */
const H0 = watching ? 0 : 1
const rules = net ? { ...props.options, ...net.opts } : props.options

const T = S.ninetynine
const ME = 0
const ALL: Card[] = Array.from({ length: 52 }, (_, i) => i)
const SIDES = ['bottom', 'right', 'top', 'left'] as const
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

const state = shallowRef<NinetyNineState>(net ? netStart() : saved ? saved.state : dealNinetyNine(seed))
const grace = useGrace(props.options, state, () => state.value.turn === ME)
const phase = ref<'deal' | 'play' | 'over'>(saved ? 'play' : 'deal')
const gathered = ref(!saved)
const selected = ref<Card | null>(null)
const message = ref('')
const menuOpen = ref(false)
const resultOpen = ref(false)
const moods = reactive<Mood[]>(['idle', 'idle', 'idle', 'idle'])
/** 正在攤牌的人（爆了） */
const bust = shallowRef<{ player: number; cards: Card[] } | null>(null)
/** 總數旁邊跳出來的字（迴轉！、PASS、直接 99！…） */
const effect = ref<{ text: string; key: number } | null>(null)
/** 總數剛變的時候彈一下 */
const bump = ref(0)

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
const L = shallowRef<NinetyNineLayout>(ninetyNineLayout(844, 390))
const ch = computed(() => (L.value.cw * 108) / 78)
const stage = new CardStage()
let lastLand = 0
stage.onLand = () => {
  const now = performance.now()
  if (now - lastLand > 45) playSound(phase.value === 'deal' ? 'deal' : 'card')
  lastLand = now
}
function sync(fly: Card[] = [], opts: { stagger?: number; dur?: number; arc?: number; order?: (c: Card) => number } = {}, instant = false) {
  const poses = ninetyNinePoses(L.value, state.value, selected.value, gathered.value, bust.value)
  for (const c of ALL) {
    let pose = poses.get(c)
    if (!pose) continue
    if (watching && phase.value !== 'over' && state.value.hands[ME].includes(c)) pose = { ...pose, f: 0 }
    const fi = fly.indexOf(c)
    if (fi >= 0) {
      const k = opts.order ? opts.order(c) : fi
      const v = Math.random()
      const st = opts.stagger ?? 0
      stage.move(c, pose, { delay: k * st + v * st * 0.4, dur: (opts.dur ?? 420) * (0.88 + v * 0.3), arc: (opts.arc ?? L.value.cw * 0.8) * (0.65 + Math.random() * 0.7), flightZ: 600 + k, land: true, instant })
    } else stage.move(c, pose, { dur: 240, instant })
  }
}
let observer: ResizeObserver | undefined
onMounted(() => {
  const el = stageEl.value!
  const measure = () => {
    L.value = ninetyNineLayout(el.clientWidth, el.clientHeight)
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
  // 牌堆原本就疊在發牌的位置（gathered 時的樣子），只有發出去的牌會飛，一張一張從頂上拿
  sync([...order.keys()], { stagger: 70, dur: 360, arc: 16, order: (c) => order.get(c) ?? 0 })
  later(() => {
    phase.value = 'play'
    nextTurn()
  }, 20 * 70 + 480)
}

const meOut = computed(() => !watching && !state.value.alive[ME])
let scheduledFor: NinetyNineState | null = null
function nextTurn() {
  if (net) return pump()
  const s = state.value
  if (s.over || phase.value !== 'play') return
  if (scheduledFor === s) return
  scheduledFor = s
  moods.forEach((m, i) => m === 'think' && (moods[i] = 'idle'))
  if (s.turn === ME) {
    // 沒牌可以出：讓你看一下，自動爆掉
    if (mustOut(s)) {
      message.value = T.mustOut
      later(() => state.value === s && act({ type: 'out', player: ME }), 1500)
    }
    return
  }
  const p = s.turn
  moods[p] = 'think'
  const st = ninetyNineAt(opponents[p - 1].persona.bigtwo, difficulty)
  const at = state.value
  later(
    () => {
      if (state.value !== at || at.over || phase.value !== 'play') return
      let a: NinetyNineAction
      ;[a, rng] = chooseNinetyNineAction(state.value, st, rng)
      act(a)
    },
    // 電腦每一手想一下：約 1.5～2.9 秒；你出局之後打快一點
    meOut.value ? 450 + Math.random() * 300 : 1500 + st.skill * 500 + Math.random() * 900,
  )
}

function act(a: NinetyNineAction): boolean {
  const before = state.value
  const r = applyNinetyNine(before, a)
  if (!r.ok) {
    message.value = T.errors[r.reason]
    playSound('error')
    return false
  }
  state.value = r.state
  if (a.player === ME || (selected.value !== null && !r.state.hands[ME].includes(selected.value))) selected.value = null
  message.value = ''
  const p = a.player
  if (moods[p] === 'think') moods[p] = 'idle'
  const m = r.state.lastMove!
  if (m.type === 'out') {
    // 爆了：牌先在他面前攤開，再收到出過的牌底下
    bust.value = { player: p, cards: m.cards }
    moods[p] = 'sad'
    playSound('lose')
    flashEffect(T.busted(names[p]))
    sync(m.cards, { dur: 420, arc: L.value.cw * 0.4 })
    later(() => {
      bust.value = null
      sync(m.cards, { stagger: 40, dur: 380 })
      if (r.state.over && !net) later(finish, 700)
      else later(nextTurn, 450)
    }, 1500)
    return true
  }
  // 出牌：那張飛到出過的牌上，補的牌從牌堆飛到手上；牌堆洗過的話先把舊牌收回去
  const drawn = m.drew ? r.state.hands[p].find((c) => !before.hands[p].includes(c)) : undefined
  bump.value++
  const kind = kindOf(m.card)
  if (kind === 'max') {
    flashEffect(T.effect.max)
    flash(p, 'smug', 1100)
  } else if (kind === 'zero') {
    flashEffect(T.effect.zero)
    flash(p, 'smug', 1100)
  } else if (kind === 'reverse') flashEffect(T.effect.reverse)
  else if (kind === 'pass') flashEffect(T.effect.pass)
  else if (kind === 'target') flashEffect(T.effect.target(names[m.target]))
  if (m.total >= 90 && kind !== 'max') flash(nextAlive(r.state, p, r.state.dir), 'shock', 1000)
  if (m.reshuffled) {
    playSound('shuffle')
    flashEffect(T.effect.reshuffle)
  }
  // 一次排好：出的牌先飛，補的牌晚一點從牌堆飛到手上；洗牌的話舊牌同時收回牌堆
  const fly = [m.card, ...(m.reshuffled ? r.state.deck : []), ...(drawn !== undefined ? [drawn] : [])]
  sync(fly, { stagger: 280, dur: 440, arc: L.value.cw * 0.8, order: (c) => (c === drawn ? 1 : 0) })
  if (r.state.over && !net) later(finish, 900)
  else later(nextTurn, 560)
  return true
}

let effectKey = 0
function flashEffect(text: string) {
  effect.value = { text, key: ++effectKey }
  const k = effectKey
  later(() => effect.value?.key === k && (effect.value = null), 1300)
}
function flash(p: number, mood: Mood, ms: number) {
  if (!state.value.alive[p]) return
  moods[p] = mood
  later(() => moods[p] === mood && phase.value === 'play' && (moods[p] = 'idle'), ms)
}

const rk = computed(() => ranks(state.value))
const won = computed(() => winners(state.value))
function finish() {
  phase.value = 'over'
  message.value = ''
  const w = won.value
  for (let p = 0; p < 4; p++) moods[p] = w.includes(p) ? 'happy' : 'sad'
  if (!watching) {
    stats.ninetynine.rounds++
    if (w.includes(ME)) stats.ninetynine.wins++
    // 表現：名次越前面越好（第 1 名 1、第 4 名 0）
    const perf = (4 - rk.value[ME]) / 3
    recordResult('ninetynine', difficulty, !w.includes(ME) ? 'l' : w.length > 1 ? 'd' : 'w', perf)
  }
  playSound(w.includes(ME) && !watching ? 'win' : 'lose')
  later(() => (resultOpen.value = true), 900)
}

/**
 * 快速結算（只有單人對電腦、你已經爆了的時候）：剩下的電腦一瞬間照原本的打法打完，直接結算，不用等他們一手一手出。
 */
function quickFinish() {
  if (net || !meOut.value || state.value.over || phase.value !== 'play') return
  timers.forEach((t) => window.clearTimeout(t))
  timers.clear()
  bust.value = null
  effect.value = null
  let s = state.value
  while (!s.over) {
    const p = s.turn
    let a: NinetyNineAction
    ;[a, rng] = chooseNinetyNineAction(s, ninetyNineAt(opponents[p - 1].persona.bigtwo, difficulty), rng)
    const r = applyNinetyNine(s, a)
    if (!r.ok) break
    s = r.state
  }
  state.value = s
  playSound('shuffle')
  sync(ALL, { stagger: 6, dur: 380, arc: 12 })
  later(finish, 500)
}

function newRound() {
  if (net) return
  timers.forEach((t) => window.clearTimeout(t))
  timers.clear()
  menuOpen.value = false
  resultOpen.value = false
  selected.value = null
  message.value = ''
  bust.value = null
  effect.value = null
  moods.fill('idle')
  phase.value = 'deal'
  gathered.value = true
  sync(ALL, { stagger: 7, dur: 360, arc: 0 })
  later(() => {
    let k: number
    ;[k, rng] = nextInt(rng, 2147483646)
    seed = k + 1
    state.value = dealNinetyNine(seed)
    acted.value = false
    deal()
  }, 52 * 7 + 480)
}

// ── 連線對局 ──
// 伺服器送來的每個動作（包括自己的）照順序套用；動畫播完（nextTurn）再拿下一個。
// 別人的手牌、牌堆在這裡只是背面（還沒看過的牌隨便放）：別人出某張牌時把那張換到他手上；
// 自己補到的牌伺服器會說是哪張（own），套用後換成真的；有人爆了，伺服器給他攤開的牌，先換到他手上再套用。
const sending = ref(false)
let waiting = false
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
function fromServer(s: NinetyNineState): NinetyNineState {
  const m = net!
  const lm = s.lastMove
  return {
    ...s,
    hands: rotate(m, s.hands),
    alive: rotate(m, s.alive),
    out: s.out.map((p) => toLocal(m, p)),
    turn: toLocal(m, s.turn),
    lastMove: lm ? (lm.type === 'play' ? { ...lm, player: toLocal(m, lm.player), target: lm.target >= 0 ? toLocal(m, lm.target) : -1 } : { ...lm, player: toLocal(m, lm.player) }) : null,
  }
}
function netStart(): NinetyNineState {
  const m = net!
  const st = m.start as { hand: Card[]; counts: number[]; deck: number; turn: number; total: number; dir: 1 | -1 }
  const counts = rotate(m, st.counts)
  const unknown = ALL.filter((c) => !st.hand.includes(c))
  let k = 0
  const hands = counts.map((n, p) => (p === ME && !watching ? st.hand.slice() : unknown.slice(k, (k += n))))
  return { hands, deck: unknown.slice(k, k + st.deck), played: [], total: st.total, turn: toLocal(m, st.turn), dir: st.dir, alive: [true, true, true, true], out: [], moves: 0, reshuffles: 0, rng: seedRng(1), lastMove: null, over: false }
}
function mine(a: NinetyNineAction): boolean {
  if (!net) return act(a)
  if (sending.value) return false
  const r = applyNinetyNine(state.value, a)
  if (!r.ok) {
    message.value = T.errors[r.reason]
    playSound('error')
    return false
  }
  sending.value = true
  acted.value = true
  sendAct(a.type === 'play' ? { ...a, player: toAbs(net, a.player), target: a.target !== undefined && a.target >= 0 ? toAbs(net, a.target) : -1 } : { ...a, player: toAbs(net, a.player) })
  return true
}
/** 看不到的牌放在哪幾疊：別人的手牌（觀戰時連下方那位的也算），最後一疊是牌堆；第 p - H0 疊是第 p 位的手牌 */
function hiddenZones(s: NinetyNineState): number[][] {
  return [...s.hands.slice(H0).map((h) => h.slice()), s.deck.slice()]
}
function withZones(s: NinetyNineState, z: number[][]): NinetyNineState {
  const n = 4 - H0
  return { ...s, hands: [...s.hands.slice(0, H0), ...z.slice(0, n)], deck: z[n] }
}
function pump() {
  const m = net!
  const e = m.queue.shift()
  if (!e) {
    waiting = true
    const s = state.value
    if (s.over || phase.value !== 'play') return
    moods.forEach((v, i) => v === 'think' && (moods[i] = 'idle'))
    if (s.turn === ME && !watching) {
      // 沒牌可以出：自己送出「爆了」
      if (mustOut(s) && !sending.value) {
        message.value = T.mustOut
        later(() => state.value === s && mine({ type: 'out', player: ME }), 1500)
      }
    } else moods[s.turn] = 'think'
    return
  }
  if (e.end) return reveal(e.ev as NinetyNineState)
  const raw = e.ev as { type: 'play' | 'out'; player: number; card?: number; minus?: boolean; target?: number; cards?: number[]; draw?: number }
  const p = toLocal(m, raw.player)
  if (p === ME) sending.value = false
  const hidden = p !== ME || watching
  if (raw.type === 'out') {
    if (hidden) {
      const z = hiddenZones(state.value)
      const keep: number[] = []
      for (const c of raw.cards ?? []) {
        const pair = bringInto(z, p - H0, c, keep)
        if (pair) stage.adopt([[pair[1], pair[0]], [pair[0], pair[1]]])
        keep.push(c)
      }
      state.value = withZones(state.value, z)
    }
    if (!act({ type: 'out', player: p })) later(nextTurn, 50)
    return
  }
  const card = raw.card!
  if (hidden) {
    const z = hiddenZones(state.value)
    const pair = bringInto(z, p - H0, card)
    if (pair) stage.adopt([[pair[1], pair[0]], [pair[0], pair[1]]])
    state.value = withZones(state.value, z)
  }
  const target = raw.target !== undefined && raw.target >= 0 ? toLocal(m, raw.target) : undefined
  const before = state.value
  if (!act({ type: 'play', player: p, card, minus: !!raw.minus, target })) {
    const why = applyNinetyNine(before, { type: 'play', player: p, card, minus: !!raw.minus, target })
    console.warn('online: 套用不了伺服器送來的動作', JSON.stringify(raw), !why.ok && why.reason, 'turn', before.turn, 'total', before.total, 'hand', JSON.stringify(before.hands[p]), 'seq', e.seq)
    later(nextTurn, 50)
    return
  }
  // 自己補到的牌：換成伺服器說的那張（它在別人手上或牌堆裡，跟剛剛補到的那張對調）
  if (p === ME && !watching && raw.draw !== undefined) {
    const s = state.value
    const got = s.hands[ME].find((c) => !before.hands[ME].includes(c))
    if (got !== undefined && got !== raw.draw) {
      const z = hiddenZones(s)
      const zi = z.findIndex((zone) => zone.includes(raw.draw!))
      if (zi >= 0) {
        z[zi][z[zi].indexOf(raw.draw)] = got
        // 先換好別人的手牌、牌堆（got 放到 draw 原本的位置），再把自己手上的 got 換成 draw
        const zoned = withZones(s, z)
        const hand = zoned.hands[ME].map((c) => (c === got ? raw.draw! : c))
        state.value = { ...zoned, hands: zoned.hands.map((h, i) => (i === ME ? hand : h)) }
        stage.adopt([[got, raw.draw], [raw.draw, got]])
        sync()
      }
    }
  }
}
/** 伺服器攤牌：背面的牌換成真的（位置不動），再結算 */
function reveal(fin: NinetyNineState) {
  const real = fromServer(fin)
  const pairs: [number, number][] = []
  const b = hiddenZones(state.value)
  const r = hiddenZones(real)
  b.forEach((zone, i) => zone.forEach((c, k) => r[i][k] !== undefined && r[i][k] !== c && pairs.push([c, r[i][k]])))
  if (pairs.length) stage.adopt(pairs)
  state.value = { ...state.value, hands: real.hands, deck: real.deck, alive: real.alive, out: real.out, over: true }
  sync()
  later(finish, 600)
}

// ── 你的操作 ──
const myTurn = computed(() => !watching && phase.value === 'play' && !state.value.over && state.value.turn === ME && !bust.value)
const myLegal = computed(() => legalCards(state.value, ME))
/** 選起來的這張要不要再選加減、指定 */
const sel = computed(() => selected.value)
const selKind = computed(() => (sel.value === null ? null : kindOf(sel.value)))
const chooseSign = computed(() => sel.value !== null && needsSign(sel.value))
const aliveOthers = computed(() => [1, 2, 3].filter((p) => state.value.alive[p]))
const chooseTarget = computed(() => selKind.value === 'target' && aliveOthers.value.length > 1)
const signValue = computed(() => (sel.value !== null && rankOf(sel.value) === 12 ? 20 : 10))
const status = computed(() => {
  if (message.value) return message.value
  const s = state.value
  if (phase.value === 'deal') return ''
  if (s.over) return won.value.includes(ME) ? T.win : T.lose
  if (meOut.value) return T.youOut
  if (!myTurn.value) return (watching ? `${S.online.watchingNow}・` : '') + T.waiting(names[s.turn])
  if (mustOut(s)) return T.mustOut
  // 選起一張牌：說明這張打出去會怎樣
  if (preview.value) return preview.value.text
  return T.yourTurn
})
/** 選起來的牌會有什麼效果（輪到你時才顯示在狀態列） */
const preview = computed(() => (myTurn.value && selected.value !== null && state.value.hands[ME].includes(selected.value) ? cardPreview(state.value.total, selected.value) : null))

function tapCard(c: Card) {
  if (watching || phase.value !== 'play' || !state.value.hands[ME].includes(c)) return
  selected.value = selected.value === c ? null : c
  message.value = ''
  playSound('cardPick')
  sync()
}
function playSelected(extra: { minus?: boolean; target?: number } = {}) {
  const c = selected.value
  if (!myTurn.value || c === null) return
  acted.value = true
  mine({ type: 'play', player: ME, card: c, ...extra })
}
function onTimeout() {
  if (net) return
  if (!myTurn.value) return
  acted.value = true
  act({ type: 'timeout', player: ME })
}

// ── 保存進度並退出 ──
const acted = ref(!!saved)
const canSave = computed(() => !net && phase.value === 'play' && acted.value && !bust.value)
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
/** 名次表：第 1 名在最上面 */
const order = computed(() => [0, 1, 2, 3].sort((a, b) => rk.value[a] - rk.value[b]))
const outIndex = (p: number) => state.value.out.indexOf(p)
</script>

<template>
  <section ref="stageEl" class="felt">
    <TurnGlow v-for="(side, p) in SIDES" :key="side" :side="side" :on="phase === 'play' && !state.over && state.turn === p" />
    <TurnTimer v-if="timed" :side="SIDES[state.turn]" :active="phase === 'play' && !state.over && !bust && !(grace && state.turn === ME)" :paused="!net && (menuOpen || resultOpen)" :seconds="TURN_SECONDS.cards" :turn-key="state" @timeout="onTimeout" />

    <div class="table-box" :style="{ left: `${L.box.x}px`, top: `${L.box.y}px`, width: `${L.box.w}px`, height: `${L.box.h}px` }">
      <span class="t-label lab">TABLE</span>
    </div>
    <!-- 總數＋方向 -->
    <div class="total" :style="{ left: `${L.totalAt.x}px`, top: `${L.totalAt.y}px` }">
      <span class="t-label tl">{{ T.total }}</span>
      <span :key="bump" class="num t-slab" :class="{ hot: state.total >= 90 }">{{ state.total }}</span>
      <svg class="dir" :class="{ ccw: state.dir === 1 }" viewBox="-12 -12 24 24" aria-hidden="true">
        <path d="M -7 -4 A 8 8 0 1 1 -4 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
        <path d="M -9.5 -8 L -7 -3 L -2.5 -6.2" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <Transition name="fx">
        <span v-if="effect" :key="effect.key" class="fx t-black">{{ effect.text }}</span>
      </Transition>
    </div>
    <span v-if="phase !== 'deal'" class="deck-n t-label" :style="{ left: `${L.deckAt.x}px`, top: `${L.deckAt.y + ch * L.tableScale * 0.5 + 6}px` }">{{ T.deckLeft(state.deck.length) }}</span>

    <!-- 座位上的人 -->
    <template v-for="(seat, p) in L.seats" :key="p">
      <div class="who" :class="{ active: phase === 'play' && state.turn === p, gone: !state.alive[p] }" :style="{ left: `${seat.kid.x - seat.kid.w / 2}px`, top: `${seat.kid.y - seat.kid.w}px`, width: `${seat.kid.w}px`, height: `${seat.kid.w}px` }">
        <Avatar :look="looks[p]" :mood="moods[p]" :flip="p === 1" :talk="p !== ME" />
      </div>
      <div v-if="p !== ME || watching" class="tag" :class="[`al-${seat.label.align}`, { active: phase === 'play' && state.turn === p }]" :style="{ left: `${seat.label.x}px`, top: `${seat.label.y}px` }">
        <span class="nm t-black"><span class="hl" />{{ names[p] }}</span>
        <span class="t-label tg">{{ p === ME ? seated![0].tag : opponents[p - 1].tag }}</span>
      </div>
      <span v-if="!state.alive[p] && !(bust && bust.player === p)" class="stamp t-black" :style="p === ME ? { left: `${seat.kid.x + L.cw * 1.5}px`, top: `${seat.kid.y - seat.kid.w * 0.55}px` } : { left: `${seat.stamp.x}px`, top: `${seat.stamp.y}px` }">{{ T.outTag }}<small>{{ T.rankTag(rk[p]) }}</small></span>
    </template>

    <div class="cards">
      <div
        v-for="c in ALL"
        :key="c"
        :ref="(el) => stage.attach(c, el as HTMLElement | null)"
        class="sprite"
        :class="{ mine: !watching && state.hands[ME].includes(c), sel: selected === c, dim: myTurn && state.hands[ME].includes(c) && !myLegal.includes(c) }"
        :style="{ width: `${L.cw}px`, height: `${ch}px`, marginLeft: `${-L.cw / 2}px`, marginTop: `${-ch / 2}px` }"
        @click="tapCard(c)"
      >
        <svg class="face" viewBox="-2 -2 78 108" aria-hidden="true"><CardArt :rank="rankText(c)" :suit="suitOf(c)" /></svg>
        <svg class="back" viewBox="-2 -2 78 108" aria-hidden="true"><CardArt back /></svg>
      </div>
    </div>

    <p class="status" :class="{ mine: myTurn && !message, warn: !!message || (myTurn && mustOut(state)) || (!message && !!preview?.bad) }" :style="{ top: `${L.box.y + L.box.h - 4}px` }">{{ status }}</p>

    <div class="corner"><IconBtn icon="menu" :label="S.common.menu" @click="menuOpen = true" /></div>
    <div class="actions" :class="{ over: phase === 'over' }">
      <!-- 按鈕換組（出牌 ↔ 加／減 ↔ 指定誰）：舊的往下沉、淡掉，新的一顆顆往上彈出來 -->
      <Transition v-if="phase !== 'over' && !watching && !meOut" name="swap" mode="out-in" :duration="{ enter: 540, leave: 160 }">
        <!-- 10、Q：加或減 -->
        <div v-if="chooseSign" :key="`sign${signValue}`" class="grp">
          <Btn tone="red" block style="--i: 0" :disabled="!myTurn || sending || !canPlay(state.total, sel!)" @click="playSelected({ minus: false })">{{ T.plus(signValue) }}</Btn>
          <Btn tone="ink" block style="--i: 1" :disabled="!myTurn || sending" @click="playSelected({ minus: true })">{{ T.minus(signValue) }}</Btn>
        </div>
        <!-- 5：指定誰接 -->
        <div v-else-if="chooseTarget" key="target" class="grp">
          <Btn v-for="(q, i) in aliveOthers" :key="q" size="sm" tone="red" block :style="{ '--i': i }" :disabled="!myTurn || sending" @click="playSelected({ target: q })">{{ names[q] }}</Btn>
        </div>
        <div v-else key="play" class="grp">
          <Btn tone="red" size="lg" arrow block style="--i: 0" :disabled="!myTurn || selected === null || sending || !myLegal.includes(selected)" @click="playSelected({ target: aliveOthers[0] })">{{ T.play }}</Btn>
        </div>
      </Transition>
      <!-- 你爆了（單人）：可以直接快速結算，不用等電腦打完 -->
      <Btn v-else-if="meOut && !net && phase === 'play'" class="rise" tone="ink" size="lg" arrow block @click="quickFinish">{{ T.quickFinish }}</Btn>
      <template v-else-if="phase === 'over'">
        <Btn class="rise" size="sm" icon="exit" @click="emit('exit')">{{ net ? S.online.backRoom : S.common.quit }}</Btn>
        <Btn v-if="!net" class="rise" size="sm" icon="again" style="--i: 1" @click="newRound">{{ S.common.again }}</Btn>
        <RematchBtn v-else class="rise" size="sm" style="--i: 1" />
        <Btn class="rise" tone="ink" size="lg" arrow style="--i: 2" @click="resultOpen = true">{{ S.common.showResult }}</Btn>
      </template>
    </div>

    <CursorGlow />
    <GameMenu :open="menuOpen" :game="game" :options="props.options" :can-save="canSave" @close="menuOpen = false" @restart="newRound" @exit="emit('exit')" @save-exit="saveAndExit" />

    <Dialog flip :open="resultOpen" :title="watching ? S.online.watchWin(won.map((p) => names[p]).join('、')) : won.includes(ME) ? (won.length > 1 ? T.tie : T.win) : T.lose" :label="T.resultLabel" tone="red" wide @close="resultOpen = false">
      <table class="score">
        <thead>
          <tr>
            <th>{{ T.colRank }}</th>
            <th>{{ T.colPlayer }}</th>
            <th>{{ T.colOut }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(p, i) in order" :key="p" class="rise" :class="{ winner: won.includes(p) }" :style="{ '--i': i + 2 }">
            <td class="rk t-slab" :class="{ red: won.includes(p) }">{{ rk[p] }}</td>
            <td>
              <span class="who-in">
                <span class="mini"><Avatar :look="looks[p]" :mood="won.includes(p) ? 'happy' : 'sad'" /></span>
                <span class="t-black">{{ names[p] }}</span>
              </span>
            </td>
            <td>{{ outIndex(p) >= 0 ? T.outAt(outIndex(p) + 1) : T.alive }}</td>
          </tr>
        </tbody>
      </table>
      <p class="how">{{ T.how }}</p>
      <p v-if="!watching" class="lifetime t-black">{{ T.record(stats.ninetynine.rounds, stats.ninetynine.wins) }}</p>
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
.total {
  position: absolute;
  z-index: 3;
  display: flex;
  translate: -50% -50%;
  flex-direction: column;
  align-items: center;
  pointer-events: none;
  animation: rise 520ms var(--ease-out) both;
}
.tl {
  font-size: 0.6rem;
  color: var(--color-ink-2);
}
.num {
  font-size: clamp(2.6rem, 9vh, 4.4rem);
  line-height: 1;
  font-variant-numeric: tabular-nums;
  animation: bump 320ms var(--ease-back);
}
.num.hot {
  color: var(--color-red);
}
@keyframes bump {
  from {
    transform: scale(1.25);
  }
}
.dir {
  width: 1.6rem;
  height: 1.6rem;
  margin-top: 0.2rem;
  color: var(--color-ink-2);
  transform: scaleX(-1);
  transition: transform 420ms var(--ease-back);
}
/* 0→1→2→3（下→右→上→左）是逆時針 */
.dir.ccw {
  transform: none;
}
.fx {
  position: absolute;
  top: -1.4rem;
  white-space: nowrap;
  padding: 0.05rem 0.5rem;
  background: var(--color-yellow);
  border: 0.12rem solid var(--color-ink);
  font-size: 0.85rem;
}
.fx-enter-active {
  animation: fx-in 360ms var(--ease-back);
}
.fx-leave-active {
  transition: opacity 200ms;
}
.fx-leave-to {
  opacity: 0;
}
@keyframes fx-in {
  from {
    opacity: 0;
    transform: translateY(0.4rem) scale(0.7);
  }
}
.deck-n {
  position: absolute;
  z-index: 3;
  translate: -50% 0;
  font-size: 0.55rem;
  color: var(--color-ink-2);
  white-space: nowrap;
  pointer-events: none;
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
/* 輪到你時出不了的牌（加上去會超過 99）：淡一點 */
.sprite.dim svg {
  opacity: 0.55;
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
.who {
  position: absolute;
  z-index: 2;
  pointer-events: none;
  transition:
    transform 300ms var(--ease-back),
    opacity 400ms;
}
.who.active {
  transform: translateY(-0.25rem);
}
.who.gone {
  opacity: 0.4;
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
/* 爆了的印章 */
.stamp {
  position: absolute;
  z-index: 650;
  display: flex;
  translate: -50% -50%;
  flex-direction: column;
  align-items: center;
  padding: 0.1rem 0.55rem;
  border: 0.16rem solid var(--color-red);
  color: var(--color-red);
  background: rgb(251 248 241 / 0.85);
  font-size: 1.05rem;
  line-height: 1.1;
  rotate: -8deg;
  pointer-events: none;
  animation: stamp 360ms var(--ease-back) both;
}
.stamp small {
  font-size: 0.6rem;
}
@keyframes stamp {
  from {
    opacity: 0;
    transform: scale(1.6);
  }
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
.grp {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
/* 按鈕換組：舊的往下沉、淡掉（0.16 秒），新的一顆顆往上彈（每顆晚 0.06 秒） */
.swap-leave-active {
  transition:
    opacity 160ms ease-in,
    transform 160ms ease-in;
}
.swap-leave-to {
  opacity: 0;
  transform: translateY(0.7rem);
}
.swap-enter-active > * {
  animation: pop-up 340ms var(--ease-back) calc(var(--i, 0) * 60ms) both;
}
@keyframes pop-up {
  from {
    opacity: 0;
    transform: translateY(0.9rem) scale(0.94);
  }
}
@media (prefers-reduced-motion: reduce) {
  .swap-leave-active {
    transition: none;
  }
  .swap-enter-active > * {
    animation: none;
  }
}
.actions.over {
  width: auto;
  flex-direction: row;
  align-items: flex-end;
  gap: 0.6rem;
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
  text-align: center;
}
.score td {
  padding: 0.25rem 0.5rem;
  border-bottom: 0.07rem solid var(--color-ink);
  text-align: center;
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
.rk {
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
  .num,
  .stamp,
  .fx-enter-active {
    animation: none;
  }
}
</style>
