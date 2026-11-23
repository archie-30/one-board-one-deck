<script setup lang="ts">
// 大老二牌桌：你在下方，三位隨機入座的對手在左、上、右。
// 每張牌都是獨立的精靈（cardStage.ts），發牌、出牌、收牌都是一張一張飛。
import { useGrace } from '@/core/grace'
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { playSound } from '@/core/audio'
import { afterReveal } from '@/core/launch'
import { opponentById, pickOpponents } from '@/core/opponents'
import { bringInto, isWatching, joinLiveMatch, matchOpponents, matchPlayers, rotate, sendAct, toAbs, toLocal, watchSeats } from '@/core/onlineMatch'
import { recordBest, recordResult, stats } from '@/core/settings'
import { asCardLevel, bigtwoAt, bigtwoLevel, extraThink } from '@/engine/common/difficulty'
import { myLook } from '@/core/profile'
import { S } from '@/data/strings'
import { chooseBigTwoAction, legalPlays } from '@/engine/bigtwo/ai'
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
import RematchBtn from '@/ui/RematchBtn.vue'
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
/** 連線對局：伺服器發牌、當裁判（沒有就是一般的單人對電腦） */
const net = saved ? null : joinLiveMatch(props.game.id)
/** 觀戰：從下方那位玩家的角度看，但看不到他的手牌、不能操作、不記戰績 */
const watching = !!net && isWatching(net)
/** 規則設定：連線時照房主的（只有「影響公平」的那些；自動過牌、手牌分兩排這種還是用自己的） */
const rules = net ? { ...props.options, ...net.opts } : props.options

/** 瘋狂大老二：同一個畫面，用兩副牌（104 張、每人 26 張） */
const crazy = props.game.id === 'crazybigtwo'
const options = net ? ((net.start as { options: BigTwoOptions }).options) : ({ ...props.options, decks: crazy ? 2 : 1 } as unknown as BigTwoOptions)
const record = crazy ? stats.crazybigtwo : stats.bigtwo
/** 規則設定的「倒數計時」 */
const timed = rules.timer !== false
/** 難度：只決定電腦多強 */
/** 難度：簡單／困難（只決定電腦多強） */
const difficulty = asCardLevel(rules.difficulty)
const level = bigtwoLevel(difficulty)
const T = S.bigtwo
const ME = 0
const ALL: Card[] = Array.from({ length: crazy ? 104 : 52 }, (_, i) => i)
/** 發牌時每張牌的間隔（兩副牌發快一點，總時間差不多） */
const DEAL_GAP = crazy ? 13 : 24

// 這一桌的三位對手：坐下時隨機挑，離開前都是同一批人
// 困難模式不會出現新手打法的電腦
const opponents = reactive(net ? matchOpponents(net) : saved ? saved.opponents.map(opponentById) : pickOpponents(3, Date.now(), difficulty === 'high'))
const seated = watching ? matchPlayers(net!) : null
const names = reactive(seated ? seated.map((o) => o.name) : [S.common.you, ...opponents.map((o) => o.name)])
// 連線：有人離開房間、改由電腦代打時，名字換成「＿（電腦代打）」
if (net)
  watchSeats(net, (ps) =>
    ps.forEach((o, i) => {
      if (i > 0) ((opponents[i - 1] = o), (names[i] = o.name))
      else if (watching) names[0] = o.name
    }),
  )
const looks = seated ? seated.map((o) => o.look) : [myLook(), ...opponents.map((o) => o.look)]
const tableTotals = ref(saved ? saved.tableTotals.slice() : [0, 0, 0, 0])

let seed = saved ? saved.seed : (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0
let rng = saved ? saved.rng : seedRng(seed)
const timers = new Set<number>()
const later = (fn: () => void, ms: number) => {
  const id = window.setTimeout(() => {
    timers.delete(id)
    // 暫停中（選單打開）：電腦也停下來，等繼續再走（連線對局不能暫停，別人還在打）
    if (menuOpen.value && !net) later(fn, 250)
    else fn()
  }, ms)
  timers.add(id)
}

const state = shallowRef<BigTwoState>(net ? netStart() : saved ? saved.state : dealBigTwo(seed, options))
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
/** 結算後回到牌桌檢視牌組：每個人開局的牌，已經出掉的蓋一層淡色（沒有開局手牌的舊存檔只看剩下的牌） */
const reviewOpen = ref(false)
function openReview() {
  resultOpen.value = false
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
  return { hands: state.value.hands, selected: selected.value, pile: pile.value, discard: discard.value, gathered: gathered.value, deck: ALL.length, twoRows: props.options.twoRows === true }
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
    let pose = poses.get(c)
    if (!pose) continue
    // 觀戰：下方那位的手牌也是背面（結束攤牌後才翻開）
    if (watching && phase.value !== 'over' && state.value.hands[ME].includes(c)) pose = { ...pose, f: 0 }
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
  sync({ cards: ALL, stagger: DEAL_GAP, dur: 320, arc: 16, order: (c) => order.get(c) ?? 0 })
  later(() => {
    phase.value = 'play'
    nextTurn()
  }, ALL.length * DEAL_GAP + 420)
}

function nextTurn() {
  if (net) return pump()
  const s = state.value
  if (s.winner >= 0 || phase.value !== 'play') return
  moods.forEach((_, i) => {
    if (moods[i] === 'think') moods[i] = 'idle'
  })
  if (s.turn === ME) return autoPass()
  const opp = opponents[s.turn - 1]
  moods[s.turn] = 'think'
  const st = bigtwoAt(opp.persona.bigtwo, level, opp.id)
  // 電腦每一手想一下再出：約 2.1～4.8 秒（會算的、愛保留的想比較久；困難再多想一點）
  const think = 2900 + st.skill * 1000 + (1 - st.aggression) * 600 + extraThink(level) * 0.6 + Math.random() * 800
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
    // 出完最後一手時，如果其他人這一輪早就都過牌了，引擎直接清空桌面（table 是 null）：牌型改從出的牌判斷。
    // 以前這裡直接讀 s.table 會出錯、整局卡住（電腦出完拿第一名後大家都不動）
    const check = s.table ? null : checkPlay(before, p, action.cards)
    const combo = s.table?.combo ?? (check && check.ok ? check.state : null)
    if (!combo) return true
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
    // 玩到分出名次：有人出完但還沒結束——標名次，剩下的人繼續打
    const nowOut = s.out?.length ?? 0
    if (s.winner < 0 && nowOut > (before.out?.length ?? 0)) {
      flash(p, 'happy', 1600)
      message.value = T.result.outNow(p === ME && !watching ? S.common.you : names[p], nowOut)
    }
    // 單人玩到分出名次：自己出完、拿到名次了，不用看電腦打完，直接算完剩下的、結算
    if (!net && !watching && s.winner < 0 && p === ME && s.out?.includes(ME)) {
      later(quickFinish, landed + 700)
      return true
    }
    if (s.winner >= 0) {
      // 連線：等伺服器攤牌（別人剩什麼牌）再結算
      if (net) later(nextTurn, landed + 300)
      else later(finish, landed + 500)
      return true
    }
    // 出完的人那一手大家早就過牌了：這一輪結束，桌上的牌推到旁邊
    if (!s.table) {
      later(() => {
        const cards = pile.value.flatMap((g) => g.cards)
        discard.value = [...discard.value, ...cards]
        pile.value = []
        caption.value = null
        passed.fill(false)
        sync({ cards, stagger: 22, dur: 380, arc: 10 })
        later(nextTurn, cards.length * 22 + 420)
      }, landed + 300)
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

/**
 * 快速結算（單人、玩到分出名次、自己已經出完）：剩下的電腦照原本的打法一瞬間打完，排出名次後直接結算。
 * 分數本來就照第一個人出完那一刻的手牌算，打不打完不影響分數，只決定其他人的名次。
 */
function quickFinish() {
  if (net || phase.value !== 'play' || state.value.winner >= 0) return
  timers.forEach((t) => window.clearTimeout(t))
  timers.clear()
  let s = state.value
  for (let guard = 0; guard < 2000 && s.winner < 0; guard++) {
    const opp = opponents[s.turn - 1]
    if (!opp) break
    let a: BigTwoAction
    ;[a, rng] = chooseBigTwoAction(s, bigtwoAt(opp.persona.bigtwo, level, opp.id), rng)
    const r = applyBigTwo(s, a)
    if (!r.ok) break
    s = r.state
  }
  state.value = s
  // 打掉的牌全部收到棄牌堆
  discard.value = (s.played ?? []).slice()
  pile.value = []
  caption.value = null
  passed.fill(false)
  playSound('shuffle')
  sync({ cards: ALL, stagger: 6, dur: 380, arc: 12 })
  later(finish, 600)
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
  // 觀戰不記戰績
  if (!watching) {
    record.rounds++
    if (s.winner === ME) record.wins++
    record.totals[ME] = (record.totals[ME] ?? 0) + scores.value[ME].points
    recordBest(crazy ? 'crazybigtwo' : 'bigtwo', difficulty, scores.value[ME].points)
    // 表現：贏的話看別人平均剩幾張，輸的話看自己出掉幾成
    const startN = crazy ? 26 : 13
    const left = (s.scoreHands ?? s.hands).map((h) => h.length)
    const perf = s.winner === ME ? (left.reduce((a, b) => a + b, 0) / 3) / startN : 1 - left[ME] / startN
    recordResult(props.game.id, difficulty, s.winner === ME ? 'w' : 'l', perf)
  }
  for (let p = 0; p < 4; p++) moods[p] = p === s.winner ? 'happy' : 'sad'
  // 輸家的牌翻開給你看
  playSound(s.winner === ME && !watching ? 'win' : 'lose')
  later(() => (resultOpen.value = true), 900)
}

function newRound() {
  // 連線對局：再來一局要回房間大家重新準備
  if (net) return
  cancelAutoPass()
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
  }, ALL.length * 7 + 480)
}

// ── 保存進度並退出 ──
/** 玩家自己有沒有動過（還沒動過就離開：不必按兩次、也不需要存檔） */
const acted = ref(!!saved)
const canSave = computed(() => !net && phase.value === 'play' && acted.value)
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

// ── 連線對局 ──
// 伺服器送來的每個動作（包括自己的）照順序套用；動畫播完（nextTurn）再拿下一個。
// 自己出牌：先送給伺服器，等它送回來才真的出（不會跟別人看到的不一樣）。
/** 正在等伺服器確認自己的出牌（不能連按） */
const sending = ref(false)
let waiting = false
if (net) net.onEvent = () => {
  if (!waiting) return
  waiting = false
  pump()
}
if (net) net.onReject = () => {
  sending.value = false
  playSound('error')
}
onBeforeUnmount(() => {
  if (net) net.onEvent = net.onReject = null
})
/** 伺服器座位的牌局 → 自己的視角（自己是 0） */
function fromServer(s: BigTwoState): BigTwoState {
  const m = net!
  const L = (p: number) => (p < 0 ? p : toLocal(m, p))
  return {
    ...s,
    hands: rotate(m, s.hands),
    lastMoves: rotate(m, s.lastMoves),
    turn: L(s.turn),
    winner: L(s.winner),
    table: s.table ? { ...s.table, player: L(s.table.player) } : null,
    ...(s.dragon !== undefined ? { dragon: L(s.dragon) } : {}),
    ...(s.out ? { out: s.out.map(L) } : {}),
    ...(s.scoreHands ? { scoreHands: rotate(m, s.scoreHands) } : {}),
  }
}
/** 開局：自己的手牌是真的；別人的手牌只知道張數，先用「沒看過的牌」當背面 */
function netStart(): BigTwoState {
  const m = net!
  const st = m.start as { hand: Card[]; counts: number[]; turn: number; firstTurn: boolean; winner: number; options: BigTwoOptions }
  const counts = rotate(m, st.counts)
  const unknown = ALL.filter((c) => !st.hand.includes(c))
  let k = 0
  const hands = counts.map((n, p) => (p === ME && !watching ? st.hand.slice() : unknown.slice(k, (k += n))))
  return { options: st.options, hands, turn: toLocal(m, st.turn), table: null, lastMoves: [null, null, null, null], passCount: 0, firstTurn: st.firstTurn, winner: st.winner >= 0 ? toLocal(m, st.winner) : -1, played: [] }
}
/** 自己的動作：連線時送給伺服器，單人時直接套用 */
function mine(a: BigTwoAction) {
  if (!net) return act(a)
  if (sending.value) return false
  sending.value = true
  acted.value = true
  sendAct({ ...a, player: toAbs(net, a.player) })
  return true
}
/** 拿下一個伺服器送來的動作來套用；還沒有就等 */
function pump() {
  const m = net!
  const e = m.queue.shift()
  if (!e) {
    waiting = true
    const s = state.value
    if (s.winner >= 0 || phase.value !== 'play') return
    moods.forEach((_, i) => {
      if (moods[i] === 'think') moods[i] = 'idle'
    })
    if (s.turn === ME && !watching) autoPass()
    else moods[s.turn] = 'think'
    return
  }
  if (e.end) return reveal(e.ev as BigTwoState & { startHands?: Card[][] })
  const raw = e.ev as BigTwoAction
  const a = { ...raw, player: toLocal(m, raw.player) } as BigTwoAction
  if (a.player === ME) ((sending.value = false), cancelAutoPass(), (selected.value = []))
  // 別人打出的牌：先把那幾張換到他手上的背面位置，看起來就是從他手上打出來
  if (a.type === 'play' && (a.player !== ME || watching)) {
    const hands = state.value.hands.map((h) => h.slice())
    for (const c of a.cards) {
      const pair = bringInto(hands, a.player, c, a.cards)
      if (pair) stage.adopt([[pair[1], pair[0]], [pair[0], pair[1]]])
    }
    state.value = { ...state.value, hands }
  }
  if (!act(a)) {
    console.warn('online: 套用不了伺服器送來的動作', a)
    later(nextTurn, 50)
    return
  }
  if (a.type === 'timeout' && a.player === ME) message.value = S.common.timedOut
}
/** 伺服器攤牌：換上每個人真正的牌（背面的牌換成真的，位置不動），再結算 */
function reveal(fin: BigTwoState & { startHands?: Card[][] }) {
  const real = fromServer(fin)
  const pairs: [number, number][] = []
  for (let p = watching ? 0 : 1; p < 4; p++) state.value.hands[p].forEach((c, i) => real.hands[p][i] !== undefined && real.hands[p][i] !== c && pairs.push([c, real.hands[p][i]]))
  if (pairs.length) stage.adopt(pairs)
  state.value = real
  if (fin.startHands) startHands.value = rotate(net!, fin.startHands)
  later(finish, 300)
}

// ── 你的操作 ──
/** 玩到分出名次：第幾名出完（還沒出完是 0） */
const placeOf = (p: number) => (state.value.out ? state.value.out.indexOf(p) + 1 : 0)
const myTurn = computed(() => !watching && phase.value === 'play' && state.value.turn === ME && state.value.winner < 0)
const canPass = computed(() => myTurn.value && state.value.table !== null)
/** 取消選取：選起的牌全部放回手牌 */
function clearSelection() {
  if (!selected.value.length) return
  selected.value = []
  // 選起來往上抬的牌一起放回手牌的位置
  playSound('cardPick')
  sync()
}
const selectedCombo = computed(() => (selected.value.length ? identifyCombo(selected.value, options) : null))
const status = computed(() => {
  if (message.value) return message.value
  const s = state.value
  if (phase.value === 'deal') return ''
  if (s.winner >= 0) return s.winner === ME ? T.result.win : T.result.lose(names[s.winner])
  if (!myTurn.value) return (watching ? `${S.online.watchingNow}・` : '') + T.waiting(names[s.turn])
  // 有選牌：說清楚這手能不能出（以前只寫選了什麼牌型，選兩張時寫「對子」，看起來像在叫你出對子）
  const onTable = s.table ? T.combos[s.table.combo.type] : ''
  if (selected.value.length) {
    if (!selectedCombo.value) return T.notCombo
    const name = T.combos[selectedCombo.value.type]
    const check = checkPlay(s, ME, selected.value)
    if (check.ok) return T.canPlay(name)
    if (check.reason === 'wrongType') return T.needType(onTable)
    if (check.reason === 'tooSmall') return T.cantBeat(name, onTable)
    return T.errors[check.reason]
  }
  if (s.firstTurn) return T.firstLead
  return s.table ? T.yourTurnBeat(onTable) : T.yourLead
})

function tapCard(c: Card) {
  if (watching) return
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
  mine({ type: 'play', player: ME, cards })
}

// 過牌：按一下就過（大老二不用二次確認）
/** 自動過牌（規則設定可關，預設開）：桌上有牌、而你手上確定沒有任何能壓過的牌，就提示一下再幫你過牌 */
// 自動過牌：右下的「過牌」按鈕變成灰色的「按一次以取消」＋倒數條，1.2 秒內沒按就幫你過牌。
// 倒數中按那顆按鈕、或去點手牌，就取消這一次的自動過牌（改成自己決定）。
const AUTO_PASS_MS = 1200
const autoPassing = ref(false)
const autoTick = ref(0)
let autoToken = 0
function autoPass() {
  const s = state.value
  if (props.options.autoPass === false || !s.table || legalPlays(s).length || selected.value.length) return
  const token = ++autoToken
  autoTick.value = token
  message.value = T.autoPassed
  autoPassing.value = true
  later(() => {
    if (token !== autoToken) return
    autoPassing.value = false
    if (state.value !== s || !canPass.value || props.options.autoPass === false) return
    mine({ type: 'pass', player: ME })
  }, AUTO_PASS_MS)
}
/** 取消這一次的自動過牌 */
function cancelAutoPass() {
  if (!autoPassing.value) return
  autoToken++
  autoPassing.value = false
  if (message.value === T.autoPassed) message.value = ''
}
watch(selected, (v) => v.length && cancelAutoPass())
function pass() {
  if (autoPassing.value) return cancelAutoPass()
  if (!canPass.value) return
  selected.value = []
  acted.value = true
  mine({ type: 'pass', player: ME })
}
/** 時間到：這一手跳過（桌上有牌＝過牌；輪到你首出＝改由下一位首出） */
function onTimeout() {
  // 連線對局：時間到由伺服器決定（它會送來「逾時」）
  if (net) return
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
  if (options.doubleOverTen) notes.push(crazy ? S.crazybigtwo.overTwenty : T.result.overTen)
  if (options.doubleTwos && !crazy) notes.push(T.result.twos)
  return notes.length ? notes.join('') : T.result.noDoubles
})
const rankText = (c: Card) => RANK_LABELS[rankOf(c)]
</script>

<template>
  <section ref="stageEl" class="felt">
    <!-- 輪到誰：那個人那一側淡淡亮起 -->
    <TurnGlow v-for="(side, p) in (['bottom', 'right', 'top', 'left'] as const)" :key="side" :side="side" :me="p === 0" :on="phase === 'play' && state.winner < 0 && state.turn === p" />
    <TurnTimer v-if="timed" :side="(['bottom', 'right', 'top', 'left'] as const)[state.turn]" :active="phase === 'play' && state.winner < 0 && !(grace && state.turn === 0)" :paused="!net && (menuOpen || resultOpen)" :seconds="crazy ? TURN_SECONDS.crazy : TURN_SECONDS.cards" :turn-key="state" @timeout="onTimeout" />
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
        <Avatar :look="looks[p]" :mood="moods[p]" :flip="p === 1" :talk="p !== ME" />
      </div>
      <div v-if="p !== ME || watching" class="tag" :class="[`al-${seat.label.align}`, { active: phase === 'play' && state.turn === p }]" :style="{ left: `${seat.label.x}px`, top: `${seat.label.y}px` }">
        <span class="nm t-black"><span class="hl" />{{ names[p] }}</span>
        <span class="t-label tg">{{ p === ME ? seated![0].tag : opponents[p - 1].tag }}</span>
      </div>
      <span v-if="passed[p] && p !== ME" :key="`pass${p}`" class="stamp pop" :style="{ left: `${seat.stamp.x}px`, top: `${seat.stamp.y}px` }">{{ T.passed }}</span>
      <!-- 玩到分出名次：出完的人標名次 -->
      <span v-if="placeOf(p)" :key="`rank${p}`" class="stamp rank pop" :style="{ left: `${seat.stamp.x}px`, top: `${seat.stamp.y}px` }">{{ T.result.rank(placeOf(p)) }}</span>
    </template>

    <!-- 每一張牌（大老二 52 張、瘋狂大老二 104 張） -->
    <div class="cards">
      <div
        v-for="c in ALL"
        :key="c"
        :ref="(el) => stage.attach(c, el as HTMLElement | null)"
        class="sprite"
        :class="{ mine: !watching && state.hands[ME].includes(c), sel: selected.includes(c), old: olderPile.has(c) }"
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

    <p class="status" :class="{ mine: myTurn && !message, warn: !!message }" :style="{ top: `${layout.pile.y + layout.cw * 1.25 - 4}px` }">
      <span v-if="passed[ME]" class="stamp inline pop">{{ T.passed }}</span>
      {{ status }}
    </p>

    <div class="corner"><IconBtn icon="menu" :label="S.common.menu" @click="menuOpen = true" /></div>
    <div class="actions">
      <template v-if="phase !== 'over' && !watching">
        <!-- 有選起牌時才出現：一次把選起的牌全部放回去 -->
        <Transition name="clear-sel">
          <Btn v-if="selected.length" class="clear-sel" size="sm" icon="close" block @click="clearSelection">{{ T.clearSelection }}</Btn>
        </Transition>
        <Btn class="rise" tone="red" size="lg" arrow block :disabled="!myTurn || !selected.length || sending" @click="playSelected">{{ T.play }}</Btn>
        <!-- 自動過牌倒數中：灰色「按一次以取消」，下面一條 1.2 秒倒數條 -->
        <div class="pass-wrap rise" style="--i: 1">
          <Btn :class="{ waiting: autoPassing }" :icon="autoPassing ? undefined : 'pass'" block :disabled="!canPass || sending" @click="pass">{{ autoPassing ? T.autoPassCancel : T.pass }}</Btn>
          <span v-if="autoPassing" :key="autoTick" class="auto-bar" :style="{ '--ms': `${AUTO_PASS_MS}ms` }" />
        </div>
      </template>
      <template v-else-if="phase === 'over'">
        <Btn v-if="!reviewOpen" class="rise" size="sm" icon="book" block @click="openReview">{{ T.review.open }}</Btn>
        <Btn class="rise" tone="ink" size="lg" arrow block @click="(reviewOpen = false), (resultOpen = true)">{{ T.result.howTitle }}</Btn>
      </template>
    </div>

    <!-- 結算後回到牌桌看牌：每個人原本的 13 張、最後剩下的牌 -->
    <Transition name="review">
      <section v-if="reviewOpen && phase === 'over' && !resultOpen" class="review">
        <header class="rv-head">
          <span class="t-label">{{ T.review.label }}</span>
          <span class="t-black rv-title">{{ T.review.open }}</span>
          <button class="rv-close" :aria-label="S.common.close" @click="reviewOpen = false"><Icon name="close" /></button>
        </header>
        <div v-for="p in [0, 1, 2, 3]" :key="`rv${p}`" class="rv-row" :class="{ win: p === state.winner }">
          <span class="rv-av"><Avatar :look="looks[p]" :mood="p === state.winner ? 'happy' : 'idle'" /></span>
          <span class="rv-name t-black">{{ names[p] }}</span>
          <span class="rv-cards">
            <template v-if="(startHands ? startHands[p] : state.hands[p]).length">
              <!-- 出掉的牌不整張變透明（不然下面那張的框線會透出來），而是蓋一層紙色，牌本身還是實心的 -->
              <svg
                v-for="(c, k) in startHands ? startHands[p] : state.hands[p]"
                :key="c"
                viewBox="-2 -2 78 108"
                class="rv-card"
                :style="{ '--k': k }"
              >
                <CardArt :rank="RANK_LABELS[rankOf(c)]" :suit="suitOf(c)" :shadow="false" />
                <rect v-if="!state.hands[p].includes(c)" x="0" y="0" width="70" height="100" rx="6" class="rv-wash" />
              </svg>
            </template>
            <span v-if="!state.hands[p].length" class="rv-done t-black">{{ T.review.done }}</span>
          </span>
        </div>
        <p v-if="startHands" class="rv-note">{{ T.review.startNote }}</p>
      </section>
    </Transition>

    <CursorGlow />
    <GameMenu :open="menuOpen" :game="game" :options="props.options" @close="menuOpen = false" @restart="newRound" @exit="emit('exit')" :can-save="canSave" @save-exit="saveAndExit" />

    <Dialog flip :open="resultOpen" :title="state.winner === ME && !watching ? T.result.win : T.result.lose(names[Math.max(0, state.winner)])" :label="T.result.label" tone="red" wide @close="resultOpen = false">
      <table class="score">
        <thead>
          <tr>
            <th v-if="state.out">{{ T.result.colRank }}</th>
            <th>{{ T.result.colPlayer }}</th>
            <th>{{ T.result.colLeft }}</th>
            <th>{{ T.result.colTimes }}</th>
            <th>{{ T.result.colRound }}</th>
            <th>{{ T.result.colTotal }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(s, p) in scores" :key="p" class="rise" :class="{ winner: p === state.winner }" :style="{ '--i': p + 2 }">
            <td v-if="state.out" class="num t-slab">{{ placeOf(p) }}</td>
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
        {{ T.result.base }}{{ doubleNotes }}{{ state.out ? T.result.rankNote : '' }}
      </p>
      <p v-if="!watching" class="lifetime t-black">{{ T.result.lifetime(signed(record.totals[ME] ?? 0)) }}</p>
      <template #actions>
        <Btn icon="exit" size="sm" @click="emit('exit')">{{ net ? S.online.backRoom : S.common.quit }}</Btn>
        <Btn icon="book" size="sm" @click="openReview">{{ T.review.open }}</Btn>
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
/* 名次：橫的小膠囊（字比「過」多） */
.stamp.rank {
  width: auto;
  height: 1.7rem;
  margin: -0.85rem 0 0 -2rem;
  padding: 0 0.55rem;
  border-radius: 0.9rem;
  background: var(--color-red);
  color: var(--color-card);
  font-size: 0.8rem;
  white-space: nowrap;
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
  /* 貼在 TABLE 框裡面的最下面（top 是框的下緣，往上移一整行），不會壓到框線 */
  translate: 0 -100%;
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
  min-width: 0;
  flex: 1;
  min-height: 2.75rem;
  align-items: center;
  /* 牌太多（瘋狂大老二 26 張）放不下：左右滑動看 */
  overflow-x: auto;
  overflow-y: hidden;
  padding: 0.2rem 0.3rem 0.25rem 0;
  overscroll-behavior-x: contain;
  scrollbar-width: thin;
  touch-action: pan-x;
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
/* 已經出掉的牌：蓋一層紙色讓它變淡，牌本身不透明，被下一張壓住的框線就不會透出來 */
.rv-wash {
  fill: var(--color-card);
  opacity: 0.68;
}
.rv-title {
  font-size: 0.95rem;
}
@keyframes rv-in {
  from {
    opacity: 0;
    transform: translateY(0.4rem);
  }
}
.rv-done {
  margin-left: 0.6rem;
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
.pass-wrap {
  position: relative;
}
.pass-wrap .waiting :deep(.face) {
  color: var(--color-ink-3) !important;
}
.pass-wrap .waiting :deep(.lb) {
  font-size: 0.85em;
  font-weight: 500;
}
.auto-bar {
  position: absolute;
  left: 0.25rem;
  right: 0.45rem;
  bottom: 0.4rem;
  height: 0.22rem;
  background: var(--color-ink-3);
  transform-origin: left;
  pointer-events: none;
  animation: auto-drain var(--ms) linear both;
}
@keyframes auto-drain {
  to {
    transform: scaleX(0);
  }
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
  right: 1rem;
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
