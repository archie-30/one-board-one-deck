// 吹牛（撲克牌）：四個人，每人 13 張。牌都蓋著出，邊出邊「喊」是什麼點數，可以說謊。
// 一輪：帶頭的人自由喊一個點數，蓋 1～4 張下去（例如「兩張 7」）；之後輪到的人只能跟同一個點數（一樣蓋 1～4 張）或過。
// 輪到你時，如果上一手是上一家出的（中間沒人過），可以先喊「吹牛」抓他：翻開他剛剛蓋的牌——
//   有一張不是喊的點數 → 他說謊，桌上整疊牌都給他；全部都對 → 你抓錯，整疊牌給你。抓贏的人帶下一輪。
// 出牌之後其他人都過（又輪回出牌的人），桌上這疊牌收掉（不算任何人的），最後出牌的人帶下一輪。
// 手牌出完、而且下一家沒抓（或抓錯）就出線；剩下的人繼續打到排出 1～4 名（只剩一個人有牌就結束）。
// 規則設定「四張一樣棄牌」（預設開，使用者要的）：手上湊齊四張同點數（開局發到、吃下整疊時）就自動翻開棄掉，
// 大家都看得到（quads）；靠棄牌把手牌棄光也算出線。
// 純函式，狀態可序列化成 JSON。
import { nextInt, seedRng, shuffle } from '../common/rng'
import type { Result } from '../common/types'

export const PLAYERS = 4
/** 一次最多蓋幾張（使用者定的：1～4 張） */
export const MAX_PLAY = 4
/** 動作數上限：超過就照手牌多寡排名次（理論上不會到） */
export const MAX_MOVES = 1500
/** 牌：0～51。花色 = card / 13（0 梅花、1 方塊、2 紅心、3 黑桃），點數 = card % 13 + 1（1 = A … 13 = K） */
export type Card = number
export const suitOf = (c: Card) => Math.floor(c / 13)
export const rankOf = (c: Card) => (c % 13) + 1
export const makeCard = (suit: number, rank: number): Card => suit * 13 + rank - 1
export const RANK_LABELS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const

/** 桌上的一手（蓋著）：誰出的、哪幾張（只有引擎知道）、喊了幾張 */
export interface BluffPlay {
  player: number
  cards: Card[]
}

/** 剛剛發生的事（畫面播動畫、伺服器轉送用） */
export type BluffEvent =
  | { type: 'play'; player: number; count: number; rank: number }
  | { type: 'pass'; player: number }
  /** 抓：caller 抓 target；cards＝翻開的那一手；liar＝target 說謊；taker＝拿走整疊的人；pile＝整疊有幾張 */
  | { type: 'call'; player: number; target: number; cards: Card[]; liar: boolean; taker: number; pile: number }
  /** 大家都過：桌上這疊收掉 */
  | { type: 'clear'; player: number; pile: number }
  /** 四張一樣自動棄掉 */
  | { type: 'quad'; player: number; rank: number }

export interface BluffOptions {
  /** 四張一樣自動棄牌（預設開） */
  fourDiscard: boolean
}
export const DEFAULT_BLUFF_OPTIONS: BluffOptions = { fourDiscard: true }

export interface BluffState {
  hands: Card[][]
  /** 這一輪桌上蓋著的牌，照出牌順序一手一手 */
  plays: BluffPlay[]
  /** 這一輪喊的點數（null＝輪到的人要帶頭、自己喊） */
  claim: number | null
  turn: number
  /** 這一輪桌上最後那手是誰出的（null＝還沒人出） */
  last: number | null
  /** 最後那手之後連續過了幾個人 */
  passes: number
  /** 收掉的牌（不屬於任何人） */
  discard: Card[]
  /** 出線順序（第 1 名在最前面） */
  out: number[]
  /** 四張一樣棄掉的（公開；舊存檔沒有） */
  quads?: { player: number; rank: number }[]
  /** 規則設定（舊存檔沒有＝不棄牌） */
  opts?: BluffOptions
  moves: number
  /** 剛剛發生的事（可能一次好幾件：例如過牌後大家都過、牌收掉） */
  events: BluffEvent[]
  over: boolean
}

export type BluffAction =
  | { type: 'play'; player: number; cards: Card[]; rank?: number }
  | { type: 'pass'; player: number }
  | { type: 'call'; player: number }
  | { type: 'timeout'; player: number }
export type BluffError = 'over' | 'notYourTurn' | 'notInHand' | 'count' | 'needRank' | 'wrongRank' | 'mustLead' | 'cantCall' | 'deadRank'

const sortHand = (h: Card[]) => h.slice().sort((a, b) => rankOf(a) - rankOf(b) || suitOf(a) - suitOf(b))

/** 發牌開局（同一個 seed 會發出同一副牌）；誰先帶頭用亂數 */
export function dealBluff(seed: number, opts: BluffOptions = DEFAULT_BLUFF_OPTIONS): BluffState {
  const [deck, r2] = shuffle(
    Array.from({ length: 52 }, (_, i) => i),
    seedRng(seed),
  )
  const [first] = nextInt(r2, PLAYERS)
  return createBluff(
    Array.from({ length: PLAYERS }, (_, p) => deck.slice(p * 13, p * 13 + 13)),
    first,
    opts,
  )
}

/** 用指定的手牌開局（測試、教學用） */
export function createBluff(hands: Card[][], turn = 0, opts: BluffOptions = { fourDiscard: false }): BluffState {
  const s: BluffState = { hands: hands.map(sortHand), plays: [], claim: null, turn, last: null, passes: 0, discard: [], out: [], moves: 0, events: [], over: false, quads: [], opts }
  return opts.fourDiscard ? autoQuads(s) : s
}

/** 某個點數的四張牌 */
export const quadCards = (rank: number): Card[] => [0, 1, 2, 3].map((suit) => makeCard(suit, rank))
/** 手上湊齊四張的點數 */
export function quadRanks(hand: readonly Card[]): number[] {
  const n = new Map<number, number>()
  for (const c of hand) n.set(rankOf(c), (n.get(rankOf(c)) ?? 0) + 1)
  return [...n].filter(([, k]) => k >= 4).map(([r]) => r)
}
/** player 棄掉這幾個點數的四張（翻開、公開）；手牌棄光就出線 */
export function takeQuads(s: BluffState, player: number, ranks: readonly number[]): BluffState {
  if (!ranks.length) return s
  const hands = s.hands.map((h, i) => (i === player ? h.filter((c) => !ranks.includes(rankOf(c))) : h))
  const quads = [...(s.quads ?? []), ...ranks.map((rank) => ({ player, rank }))]
  const events = [...s.events, ...ranks.map((rank) => ({ type: 'quad' as const, player, rank }))]
  const out = !hands[player].length && !s.out.includes(player) ? [...s.out, player] : s.out
  return { ...s, hands, quads, events, out }
}
/** 每個人手上湊齊四張的都棄掉（規則設定開著時） */
export function autoQuads(s: BluffState): BluffState {
  let t = s
  for (let p = 0; p < PLAYERS; p++) t = takeQuads(t, p, quadRanks(t.hands[p]))
  return t
}

/** 桌上這一輪一共蓋了幾張 */
export const pileCount = (s: BluffState) => s.plays.reduce((t, p) => t + p.cards.length, 0)
/** 還有牌的人 */
export const activePlayers = (s: BluffState) => s.hands.map((h, i) => (h.length ? i : -1)).filter((i) => i >= 0)
/** 輪到的人可以抓上一手嗎（上一手是上一家剛出的、中間沒人過） */
export const canCall = (s: BluffState, player = s.turn) => !s.over && s.turn === player && s.last !== null && s.last !== player && s.passes === 0 && s.plays.length > 0
/** 輪到的人要帶頭（自己喊點數、不能過） */
export const mustLead = (s: BluffState) => s.claim === null

/** from 之後下一個還有牌的人（不含 from 自己；都沒有就 -1） */
function nextActive(s: BluffState, from: number): number {
  for (let k = 1; k <= PLAYERS; k++) {
    const p = (from + k) % PLAYERS
    if (s.hands[p].length) return p
  }
  return -1
}

/** 上一手出完牌的人：下一家沒抓（出牌或過了）就出線 */
function settleFinisher(s: BluffState): BluffState {
  const f = s.last
  if (f === null || s.hands[f].length || s.out.includes(f)) return s
  return { ...s, out: [...s.out, f] }
}

/** 只剩一個人（或沒人）有牌：結束，剩下的人照手牌多寡排在後面 */
function checkOver(s: BluffState): BluffState {
  const act = activePlayers(s)
  // 還有人剛出完最後的牌、等下一家決定抓不抓：還沒結束
  const pending = s.last !== null && !s.hands[s.last].length && !s.out.includes(s.last)
  if (pending) return s
  if (act.length > 1 && s.moves < MAX_MOVES) return s
  const rest = [0, 1, 2, 3].filter((p) => !s.out.includes(p)).sort((a, b) => s.hands[a].length - s.hands[b].length || a - b)
  return { ...s, out: [...s.out, ...rest], over: true }
}

/** 桌上這疊收掉（大家都過了） */
function clearPile(s: BluffState, events: BluffEvent[]): BluffState {
  const last = s.last!
  const pile = s.plays.flatMap((p) => p.cards)
  events.push({ type: 'clear', player: last, pile: pile.length })
  // 最後出牌的人帶下一輪；他已經出線了就換他的下一家
  const leader = s.hands[last].length ? last : nextActive(s, last)
  return { ...s, discard: [...s.discard, ...pile], plays: [], claim: null, last: null, passes: 0, turn: leader < 0 ? s.turn : leader }
}

export function applyBluff(state: BluffState, action: BluffAction): Result<BluffState, BluffError> {
  if (state.over) return { ok: false, reason: 'over' }
  if (action.player !== state.turn) return { ok: false, reason: 'notYourTurn' }
  const p = action.player
  let a = action
  if (a.type === 'timeout') {
    // 時間到：要帶頭就照實蓋最小的一張（喊它真正的點數）；跟牌時就過
    a = mustLead(state) ? { type: 'play', player: p, cards: [state.hands[p][0]], rank: rankOf(state.hands[p][0]) } : { type: 'pass', player: p }
  }
  const events: BluffEvent[] = []
  const base = { ...state, moves: state.moves + 1, events }

  if (a.type === 'call') {
    if (!canCall(state, p)) return { ok: false, reason: 'cantCall' }
    const target = state.last!
    const lastPlay = state.plays[state.plays.length - 1]
    const liar = lastPlay.cards.some((c) => rankOf(c) !== state.claim)
    const taker = liar ? target : p
    const winner = liar ? p : target
    const pile = state.plays.flatMap((x) => x.cards)
    const hands = state.hands.map((h, i) => (i === taker ? sortHand([...h, ...pile]) : h))
    events.push({ type: 'call', player: p, target, cards: lastPlay.cards, liar, taker, pile: pile.length })
    let s: BluffState = { ...base, hands, plays: [], claim: null, last: null, passes: 0 }
    // 被抓的人沒說謊、而且那手是他最後的牌：出線
    if (!liar && !hands[target].length && !s.out.includes(target)) s = { ...s, out: [...s.out, target] }
    // 吃下整疊湊齊四張：自動棄掉（棄光也算出線）
    if (s.opts?.fourDiscard) s = takeQuads(s, taker, quadRanks(s.hands[taker]))
    // 抓贏的人帶下一輪（他出線了就換他的下一家）
    const leader = s.hands[winner].length ? winner : nextActive(s, winner)
    s = { ...s, turn: leader < 0 ? p : leader }
    return { ok: true, state: checkOver(s) }
  }

  if (a.type === 'pass') {
    if (mustLead(state)) return { ok: false, reason: 'mustLead' }
    events.push({ type: 'pass', player: p })
    let s = settleFinisher({ ...base, passes: state.passes + 1 })
    // 除了最後出牌的人，其他還有牌的人都過了：收牌
    const needed = activePlayers(s).filter((x) => x !== s.last).length
    if (s.passes >= needed) s = clearPile(s, events)
    else s = { ...s, turn: nextActive(s, p) }
    return { ok: true, state: checkOver(s) }
  }

  // 出牌
  const cards = a.cards
  if (!cards.length || cards.length > MAX_PLAY || new Set(cards).size !== cards.length) return { ok: false, reason: 'count' }
  if (cards.some((c) => !state.hands[p].includes(c))) return { ok: false, reason: 'notInHand' }
  let rank = state.claim
  if (rank === null) {
    if (!a.rank || a.rank < 1 || a.rank > 13) return { ok: false, reason: 'needRank' }
    // 四張都棄掉的點數不能喊
    if (state.quads?.some((q) => q.rank === a.rank)) return { ok: false, reason: 'deadRank' }
    rank = a.rank
  } else if (a.rank !== undefined && a.rank !== rank) return { ok: false, reason: 'wrongRank' }
  let s = settleFinisher(base)
  const hands = s.hands.map((h, i) => (i === p ? h.filter((c) => !cards.includes(c)) : h))
  events.push({ type: 'play', player: p, count: cards.length, rank })
  s = { ...s, hands, plays: [...s.plays, { player: p, cards: cards.slice() }], claim: rank, last: p, passes: 0 }
  const next = nextActive(s, p)
  // 沒有別人有牌了（出完最後的牌、又沒人能抓）：直接結束
  if (next < 0) return { ok: true, state: checkOver({ ...settleFinisher(s), turn: p }) }
  s = { ...s, turn: next }
  return { ok: true, state: checkOver(s) }
}

/** 名次（over 之後）：rank[p] = 第幾名（1 起算） */
export function placings(s: BluffState): number[] {
  const r = [0, 0, 0, 0]
  s.out.forEach((p, i) => (r[p] = i + 1))
  return r
}
