// 各玩法在伺服器上怎麼跑：發牌、套用動作、輪到誰、電腦怎麼出、時間到怎麼辦、每個人看得到什麼。
// 規則本身直接用前端同一套引擎（src/engine，純函式），伺服器只是當裁判。
//
// 「每個人看得到什麼」：
//   - 開局（start）：自己的手牌、別人剩幾張、桌上公開的牌、輪到誰。別人的手牌、牌堆一律不給。
//   - 每個動作（render）：大家看到的版本（pub）；有些動作只有做的人看得到細節（own，例如排七蓋了哪張牌）。
//   - 結束（reveal）：整局攤牌（算分、看別人剩什麼牌）。
import { chooseBigTwoAction } from '../../../src/engine/bigtwo/ai'
import type { Card } from '../../../src/engine/bigtwo/cards'
import { applyBigTwo, dealBigTwo, PLAYER_COUNT, type BigTwoAction, type BigTwoState } from '../../../src/engine/bigtwo/game'
import { DEFAULT_BIGTWO_OPTIONS, type BigTwoOptions } from '../../../src/engine/bigtwo/options'
import { asCardLevel, bigtwoAt, bigtwoLevel, bluffAt, extraThink, ninetyNineAt, sevensAt } from '../../../src/engine/common/difficulty'
import { chooseBluffAction } from '../../../src/engine/bluff/ai'
import { applyBluff, canCall, dealBluff, mustLead, PLAYERS as BLUFF_PLAYERS, type BluffAction, type BluffState } from '../../../src/engine/bluff/rules'
import { PERSONAS } from '../../../src/engine/common/personas'
import type { RngState } from '../../../src/engine/common/rng'
import { chooseNinetyNineAction } from '../../../src/engine/ninetynine/ai'
import { tieNinetyNine, applyNinetyNine, dealNinetyNine, PLAYERS as NN_PLAYERS, type NinetyNineAction, type NinetyNineState } from '../../../src/engine/ninetynine/rules'
import { chooseRedPointAction } from '../../../src/engine/redpoint/ai'
import { applyRedPoint, dealRedPoint, type RedPointAction, type RedPointState } from '../../../src/engine/redpoint/rules'
import { chooseSevensAction } from '../../../src/engine/sevens/ai'
import { applySevens, dealSevens, type SevensAction, type SevensState } from '../../../src/engine/sevens/rules'
import { TURN_SECONDS } from '../../../src/data/timer'
import { BOARD_DEFS } from './boardDefs'

export type Options = Record<string, string | boolean>

/** 一個動作給大家看的樣子；own 有值時，做動作的那一位看到的是 own（別人看到 pub） */
export interface Rendered {
  pub: unknown
  own?: unknown
  /** own 給哪一方看（引擎的座位；沒填就是做動作的那一位）。例如吹牛被抓時，吃下整疊牌的人才知道是哪些牌 */
  ownSide?: number
}

export interface MatchDef<S, A> {
  seats: number
  /** 每一手幾秒（倒數計時） */
  seconds: number
  deal(seed: number, opts: Options): S
  apply(s: S, a: A): S | null
  /** 輪到哪個座位（-1 = 結束了） */
  turn(s: S): number
  /** 客戶端送來的動作：檢查格式，player 一律換成他自己的座位 */
  parse(raw: unknown, seat: number): A | null
  bot(s: S, botId: number, opts: Options, rng: RngState): [A, RngState]
  /** 電腦每一手想多久（毫秒） */
  think(s: S, botId: number, opts: Options, r: number): number
  timeout(seat: number): A
  render(before: S, after: S, a: A): Rendered
  /** 開局時 viewer（引擎的座位，-1＝觀戰）看得到的牌局 */
  start(s: S, viewer: number): unknown
  /** 結束攤牌（s0：開局的樣子；圍棋算死活要用亂數） */
  reveal(s: S, s0: S, rng: RngState): unknown
  /** 開局前要先猜拳決定誰先（兩人的棋類） */
  rps?: boolean
  /** 可以悔棋（要對方同意） */
  undo?: boolean
  /** 悔棋退到這一方「連著走的那一串」的第一步之前（暗棋連吃） */
  undoRun?: boolean
  /** 並列第一並結算（九九：只剩你跟電腦時）：isHuman(side) 那一方是不是在場的真人；不能結算就回 null */
  tie?(s: S, side: number, isHuman: (side: number) => boolean): S | null
  /** 認輸（任何時候都可以）：side 這一方認輸後的局面 */
  resign?(s: S, side: number): S | null
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const isCard = (v: unknown, max: number) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < max
const counts = (hands: readonly unknown[][]) => hands.map((h) => h.length)

// ── 大老二（一副牌）／瘋狂大老二（兩副牌）──

/** 規則設定 → 引擎的選項 */
function bigtwoOptions(opts: Options, decks: 1 | 2): BigTwoOptions {
  // 「玩到分出名次」預設開（跟註冊表的預設一樣；房主沒送就當開著）
  const o: BigTwoOptions = { ...DEFAULT_BIGTWO_OPTIONS, playToRank: true, decks }
  for (const k of Object.keys(DEFAULT_BIGTWO_OPTIONS) as (keyof BigTwoOptions)[]) {
    if (k in opts && typeof opts[k] === typeof DEFAULT_BIGTWO_OPTIONS[k]) (o as unknown as Options)[k] = opts[k]
  }
  if (decks === 2) o.dragon = false
  return o
}

function bigtwoDef(decks: 1 | 2): MatchDef<BigTwoState, BigTwoAction> {
  const total = decks * 52
  return {
    seats: PLAYER_COUNT,
    seconds: decks === 2 ? TURN_SECONDS.crazy : TURN_SECONDS.cards,
    deal: (seed, opts) => dealBigTwo(seed, bigtwoOptions(opts, decks)),
    apply: (s, a) => {
      const r = applyBigTwo(s, a)
      return r.ok ? r.state : null
    },
    turn: (s) => (s.winner >= 0 ? -1 : s.turn),
    parse(raw, seat) {
      if (!isObj(raw)) return null
      if (raw.type === 'pass') return { type: 'pass', player: seat }
      if (raw.type === 'play' && Array.isArray(raw.cards) && raw.cards.length >= 1 && raw.cards.length <= 5 && raw.cards.every((c) => isCard(c, total))) return { type: 'play', player: seat, cards: raw.cards as Card[] }
      return null
    },
    bot(s, botId, opts, rng) {
      const level = bigtwoLevel(asCardLevel(opts.difficulty))
      return chooseBigTwoAction(s, bigtwoAt(PERSONAS[botId].bigtwo, level, botId), rng)
    },
    think(_s, botId, opts, r) {
      const level = bigtwoLevel(asCardLevel(opts.difficulty))
      const st = bigtwoAt(PERSONAS[botId].bigtwo, level, botId)
      return 2900 + st.skill * 1000 + (1 - st.aggression) * 600 + extraThink(level) * 0.6 + r * 800
    },
    timeout: (seat) => ({ type: 'timeout', player: seat }),
    // 出的牌、過牌都是公開的
    render: (_b, _a, a) => ({ pub: a }),
    start: (s, v) => ({ hand: v >= 0 ? s.hands[v] : [], counts: counts(s.hands), turn: s.turn, firstTurn: s.firstTurn, winner: s.winner, options: s.options }),
    // 攤牌時連開局的手牌一起給（結算後「檢視牌組」用）
    reveal: (s, s0) => ({ ...s, startHands: s0.hands }),
  }
}

// ── 排七 ──

const sevensDef: MatchDef<SevensState, SevensAction> = {
  seats: 4,
  seconds: TURN_SECONDS.cards,
  deal: (seed) => dealSevens(seed),
  apply: (s, a) => {
    const r = applySevens(s, a)
    return r.ok ? r.state : null
  },
  turn: (s) => (s.over ? -1 : s.turn),
  parse(raw, seat) {
    if (!isObj(raw) || !isCard(raw.card, 52)) return null
    if (raw.type === 'play' || raw.type === 'cover') return { type: raw.type, player: seat, card: raw.card as number }
    return null
  },
  bot: (s, botId, opts, rng) => chooseSevensAction(s, sevensAt(PERSONAS[botId].bigtwo, asCardLevel(opts.difficulty)), rng),
  think: (_s, _id, _o, r) => 3800 + r * 2200,
  timeout: (seat) => ({ type: 'timeout', player: seat }),
  // 時間到：換成實際做的事（接了哪張、還是蓋了一張）；蓋的牌只有自己看得到是哪張
  render(_b, after, a) {
    const m = after.lastMove!
    if (!m.covered) return { pub: { type: 'play', player: a.player, card: m.card } }
    return { pub: { type: 'cover', player: a.player, card: -1 }, own: { type: 'cover', player: a.player, card: m.card } }
  },
  start: (s, v) => ({ hand: v >= 0 ? s.hands[v] : [], counts: counts(s.hands), turn: s.turn, first: s.first }),
  // 攤牌：最後的局面＋每個人開局的牌（結算「檢視牌組」用）
  reveal: (s, s0) => ({ ...s, startHands: s0.hands }),
}

// ── 九九 ──
// 出的牌、加減、指定誰、誰爆了（攤開的牌）都公開；補到哪張牌只有自己看得到（own 的 draw）。
// 洗牌用的亂數（state.rng）、牌堆的順序絕對不送出去。

const ninetynineDef: MatchDef<NinetyNineState, NinetyNineAction> = {
  seats: NN_PLAYERS,
  seconds: TURN_SECONDS.cards,
  deal: (seed) => dealNinetyNine(seed),
  apply: (s, a) => {
    const r = applyNinetyNine(s, a)
    return r.ok ? r.state : null
  },
  turn: (s) => (s.over ? -1 : s.turn),
  parse(raw, seat) {
    if (!isObj(raw)) return null
    if (raw.type === 'out') return { type: 'out', player: seat }
    if (raw.type !== 'play' || !isCard(raw.card, 52)) return null
    const target = typeof raw.target === 'number' && Number.isInteger(raw.target) && raw.target >= 0 && raw.target < NN_PLAYERS ? raw.target : undefined
    return { type: 'play', player: seat, card: raw.card as number, minus: raw.minus === true, ...(target !== undefined ? { target } : {}) }
  },
  bot: (s, botId, opts, rng) => chooseNinetyNineAction(s, ninetyNineAt(PERSONAS[botId].bigtwo, asCardLevel(opts.difficulty)), rng),
  think: (s, _id, _o, r) => (s.lastMove?.type === 'out' ? 2200 : 1500) + r * 1200,
  timeout: (seat) => ({ type: 'timeout', player: seat }),
  render(before, after, a) {
    const m = after.lastMove!
    if (m.type === 'out') return { pub: { type: 'out', player: m.player, cards: m.cards } }
    const pub = { type: 'play', player: m.player, card: m.card, minus: m.minus, target: m.target }
    if (!m.drew) return { pub }
    const drawn = after.hands[a.player].find((c) => !before.hands[a.player].includes(c))
    return { pub, own: { ...pub, draw: drawn } }
  },
  start: (s, v) => ({ hand: v >= 0 ? s.hands[v] : [], counts: counts(s.hands), deck: s.deck.length, turn: s.turn, total: s.total, dir: s.dir }),
  // 攤牌：大家最後的手牌（牌堆順序、亂數不給）
  reveal: (s) => ({ ...s, rng: 0 }),
  // 剩下的另一位是電腦（或不在的人）才可以
  tie(s, side, isHuman) {
    const other = s.alive.findIndex((v, i) => v && i !== side)
    if (other < 0 || isHuman(other)) return null
    return tieNinetyNine(s, side)
  },
}

// ── 吹牛 ──
// 牌都蓋著出：大家只看到「誰喊了幾張什麼點數」，出的是哪幾張只有自己知道（own）。
// 被抓時那一手翻開給大家看；整疊牌是哪些，只有吃下的人知道（own 給 taker）。

const bluffDef: MatchDef<BluffState, BluffAction> = {
  seats: BLUFF_PLAYERS,
  seconds: TURN_SECONDS.cards,
  deal: (seed, opts) => dealBluff(seed, { fourDiscard: opts.fourDiscard !== false }),
  apply: (s, a) => {
    const r = applyBluff(s, a)
    return r.ok ? r.state : null
  },
  turn: (s) => (s.over ? -1 : s.turn),
  parse(raw, seat) {
    if (!isObj(raw)) return null
    if (raw.type === 'pass' || raw.type === 'call') return { type: raw.type, player: seat }
    if (raw.type !== 'play' || !Array.isArray(raw.cards) || raw.cards.length < 1 || raw.cards.length > 4 || !raw.cards.every((c) => isCard(c, 52))) return null
    const rank = typeof raw.rank === 'number' && Number.isInteger(raw.rank) && raw.rank >= 1 && raw.rank <= 13 ? raw.rank : undefined
    return { type: 'play', player: seat, cards: raw.cards as number[], ...(rank !== undefined ? { rank } : {}) }
  },
  bot: (s, botId, opts, rng) => chooseBluffAction(s, bluffAt(PERSONAS[botId].bigtwo, asCardLevel(opts.difficulty)), rng),
  think: (s, _id, _o, r) => (mustLead(s) || canCall(s) ? 1900 : 1300) + r * 1100,
  timeout: (seat) => ({ type: 'timeout', player: seat }),
  // 湊齊四張棄掉的（quads）公開：大家都看得到是誰、哪個點數
  render(before, after, a) {
    const ev = after.events[0]
    const qs = after.events.flatMap((e) => (e.type === 'quad' ? [{ player: e.player, rank: e.rank }] : []))
    const quads = qs.length ? { quads: qs } : {}
    if (ev.type === 'play') {
      const cards = after.plays[after.plays.length - 1].cards
      return { pub: { type: 'play', player: a.player, count: ev.count, rank: ev.rank }, own: { type: 'play', player: a.player, count: ev.count, rank: ev.rank, cards } }
    }
    if (ev.type === 'call') {
      const pub = { type: 'call', player: a.player, cards: ev.cards, liar: ev.liar, taker: ev.taker, pile: ev.pile, ...quads }
      return { pub, own: { ...pub, pileCards: before.plays.flatMap((x) => x.cards) }, ownSide: ev.taker }
    }
    return { pub: { type: 'pass', player: a.player, ...quads } }
  },
  start: (s, v) => ({ hand: v >= 0 ? s.hands[v] : [], counts: counts(s.hands), turn: s.turn, quads: s.quads ?? [] }),
  // 攤牌：最後的局面（大家剩的手牌、收掉的牌）
  reveal: (s) => ({ ...s, events: [] }),
}

// ── 撿紅點 ──

const redpointDef: MatchDef<RedPointState, RedPointAction> = {
  seats: 4,
  seconds: TURN_SECONDS.cards,
  deal: (seed) => dealRedPoint(seed),
  apply: (s, a) => {
    const r = applyRedPoint(s, a)
    return r.ok ? r.state : null
  },
  turn: (s) => (s.phase === 'over' ? -1 : s.turn),
  parse(raw, seat) {
    if (!isObj(raw)) return null
    if (raw.target !== undefined && !isCard(raw.target, 52)) return null
    const target = raw.target as number | undefined
    if (raw.type === 'play' && isCard(raw.card, 52)) return { type: 'play', player: seat, card: raw.card as number, ...(target !== undefined ? { target } : {}) }
    if (raw.type === 'flip') return { type: 'flip', player: seat, ...(target !== undefined ? { target } : {}) }
    return null
  },
  bot: (s, botId, _opts, rng) => chooseRedPointAction(s, PERSONAS[botId].redpoint, rng),
  think: (s, _id, _o, r) => (s.phase === 'flip' ? 900 + r * 700 : 1800 + r * 1400),
  timeout: (seat) => ({ type: 'timeout', player: seat }),
  // 出的牌公開；輪到翻牌時，牌堆最上面那張翻開（top），大家都看得到
  render: (_b, after, a) => ({ pub: { ...a, ...(after.phase === 'flip' ? { top: after.pile[0] } : {}) } }),
  start: (s, v) => ({ hand: v >= 0 ? s.hands[v] : [], counts: counts(s.hands), table: s.table, pile: s.pile.length, turn: s.turn, phase: s.phase, ...(s.phase === 'flip' ? { top: s.pile[0] } : {}) }),
  reveal: (s) => s,
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const MATCH_DEFS: Record<string, MatchDef<any, any>> = {
  bigtwo: bigtwoDef(1),
  crazybigtwo: bigtwoDef(2),
  sevens: sevensDef,
  ninetynine: ninetynineDef,
  bluff: bluffDef,
  redpoint: redpointDef,
  ...BOARD_DEFS,
}
