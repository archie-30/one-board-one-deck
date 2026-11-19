// 九九（台灣常見玩法）：四個人，每人 5 張。桌上有一個總數，從 0 開始。
// 輪到你就出一張牌、照牌改總數，再從牌堆補一張。總數不能超過 99：手上每一張都會超過 99 就「爆了」出局。
// 數字牌照點數加（A＝1）；功能牌：
//   4＝迴轉（換方向）、5＝指定下一個人、10＝加或減 10、J＝PASS（總數不變）、Q＝加或減 20、K＝總數直接變 99、黑桃 A＝總數歸零。
//   減的時候最少減到 0。功能牌（4、5、10、J、Q、K、黑桃 A）任何時候都能出，所以只有手上全是「會超過 99 的數字牌」才會爆。
// 淘汰到剩一個人：最後留下的人贏，名次照出局的先後。
// 牌堆抽完：把出過的牌（最上面那張留著）洗一洗變成新的牌堆。
// 純函式，狀態可序列化成 JSON（洗牌用存在狀態裡的亂數）。
import { nextInt, seedRng, shuffle, type RngState } from '../common/rng'
import type { Result } from '../common/types'

export const PLAYERS = 4
export const HAND = 5
export const LIMIT = 99
/** 太久沒分出勝負（理論上很少發生）：還在場上的人一起算贏 */
export const MAX_MOVES = 600

/** 牌：0～51。花色 = card / 13（0 梅花、1 方塊、2 紅心、3 黑桃），點數 = card % 13 + 1（1 = A … 13 = K） */
export type Card = number
export const suitOf = (c: Card) => Math.floor(c / 13)
export const rankOf = (c: Card) => (c % 13) + 1
export const makeCard = (suit: number, rank: number): Card => suit * 13 + rank - 1
export const SPADE_ACE = makeCard(3, 1)
export const RANK_LABELS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const

/** 這張牌的作用 */
export type Kind = 'num' | 'reverse' | 'target' | 'ten' | 'pass' | 'twenty' | 'max' | 'zero'
export function kindOf(c: Card): Kind {
  if (c === SPADE_ACE) return 'zero'
  switch (rankOf(c)) {
    case 4:
      return 'reverse'
    case 5:
      return 'target'
    case 10:
      return 'ten'
    case 11:
      return 'pass'
    case 12:
      return 'twenty'
    case 13:
      return 'max'
    default:
      return 'num'
  }
}
/** 功能牌：任何時候都能出 */
export const isSpecial = (c: Card) => kindOf(c) !== 'num'
/** 要選加或減的牌（10、Q） */
export const needsSign = (c: Card) => kindOf(c) === 'ten' || kindOf(c) === 'twenty'

export interface NinetyNineState {
  hands: Card[][]
  /** 牌堆：deck[0] 是最上面（下一張要抽的） */
  deck: Card[]
  /** 出過的牌：最後一張是最上面 */
  played: Card[]
  total: number
  turn: number
  /** 1＝照 0→1→2→3 輪，-1＝反過來 */
  dir: 1 | -1
  alive: boolean[]
  /** 出局的順序（先出局的在前面） */
  out: number[]
  moves: number
  /** 牌堆洗過幾次 */
  reshuffles: number
  /** 洗牌用的亂數（伺服器不會把它送給玩家） */
  rng: RngState
  lastMove: LastMove | null
  over: boolean
}
export type LastMove =
  | { type: 'play'; player: number; card: Card; minus: boolean; target: number; before: number; total: number; drew: boolean; reshuffled: boolean }
  | { type: 'out'; player: number; cards: Card[] }

export type NinetyNineAction =
  | { type: 'play'; player: number; card: Card; minus?: boolean; target?: number }
  | { type: 'out'; player: number }
  | { type: 'timeout'; player: number }
export type NinetyNineError = 'over' | 'notYourTurn' | 'notInHand' | 'tooBig' | 'badTarget' | 'canPlay'

/** 打出這張牌之後總數變多少（不檢查能不能出） */
export function totalAfter(total: number, c: Card, minus = false): number {
  switch (kindOf(c)) {
    case 'zero':
      return 0
    case 'max':
      return LIMIT
    case 'ten':
      return minus ? Math.max(0, total - 10) : total + 10
    case 'twenty':
      return minus ? Math.max(0, total - 20) : total + 20
    case 'num':
      return total + rankOf(c)
    default:
      return total
  }
}

/** 這張牌現在能不能出（10、Q 用減的一定能出） */
export function canPlay(total: number, c: Card, minus = false): boolean {
  return totalAfter(total, c, minus) <= LIMIT
}
/** 這張牌有沒有任何出法 */
export const playable = (total: number, c: Card) => canPlay(total, c) || (needsSign(c) && canPlay(total, c, true))
/** player 現在能出的牌 */
export const legalCards = (s: NinetyNineState, player = s.turn): Card[] => s.hands[player].filter((c) => playable(s.total, c))
/** 輪到的人有沒有牌可以出（沒有就只能爆掉出局） */
export const mustOut = (s: NinetyNineState, player = s.turn) => !s.over && legalCards(s, player).length === 0

const sortHand = (h: Card[]) => h.slice().sort((a, b) => rankOf(a) - rankOf(b) || suitOf(a) - suitOf(b))

/** 發牌開局（同一個 seed 會發出同一副牌、同一個人先出） */
export function dealNinetyNine(seed: number): NinetyNineState {
  let rng = seedRng(seed)
  let deck: Card[]
  ;[deck, rng] = shuffle(
    Array.from({ length: 52 }, (_, i) => i),
    rng,
  )
  let first: number
  ;[first, rng] = nextInt(rng, PLAYERS)
  const hands = Array.from({ length: PLAYERS }, (_, p) => deck.slice(p * HAND, p * HAND + HAND))
  return { ...createNinetyNine(hands, deck.slice(PLAYERS * HAND), first), rng }
}

/** 用指定的手牌、牌堆開局（測試、教學用） */
export function createNinetyNine(hands: Card[][], deck: Card[] = [], first = 0, total = 0): NinetyNineState {
  return {
    hands: hands.map(sortHand),
    deck: deck.slice(),
    played: [],
    total,
    turn: first,
    dir: 1,
    alive: hands.map(() => true),
    out: [],
    moves: 0,
    reshuffles: 0,
    rng: seedRng(1),
    lastMove: null,
    over: false,
  }
}

/** 從 from 照方向往下數，下一個還在場上的人 */
export function nextAlive(s: Pick<NinetyNineState, 'alive' | 'dir'>, from: number, dir = s.dir): number {
  const n = s.alive.length
  for (let k = 1; k <= n; k++) {
    const p = (((from + dir * k) % n) + n) % n
    if (s.alive[p]) return p
  }
  return from
}
const aliveCount = (s: NinetyNineState) => s.alive.filter(Boolean).length

/** 時間到：能出就幫他出一張「最不可惜」的（數字牌最小的、PASS、迴轉…），10、Q 用減的；沒得出就爆 */
export function timeoutPlay(s: NinetyNineState, player = s.turn): NinetyNineAction {
  const legal = legalCards(s, player)
  if (!legal.length) return { type: 'out', player }
  const ORDER: Kind[] = ['num', 'pass', 'reverse', 'target', 'ten', 'twenty', 'max', 'zero']
  const pick = legal.slice().sort((a, b) => ORDER.indexOf(kindOf(a)) - ORDER.indexOf(kindOf(b)) || rankOf(a) - rankOf(b))[0]
  const target = nextAlive(s, player)
  return { type: 'play', player, card: pick, minus: needsSign(pick) && !canPlay(s.total, pick), target }
}

export function applyNinetyNine(state: NinetyNineState, action: NinetyNineAction): Result<NinetyNineState, NinetyNineError> {
  if (state.over) return { ok: false, reason: 'over' }
  if (action.player !== state.turn) return { ok: false, reason: 'notYourTurn' }
  const a = (action.type === 'timeout' ? timeoutPlay(state, action.player) : action) as Exclude<NinetyNineAction, { type: 'timeout' }>
  const p = a.player
  if (a.type === 'out') {
    // 只有真的沒牌可以出才能爆
    if (legalCards(state, p).length) return { ok: false, reason: 'canPlay' }
    const cards = state.hands[p]
    const alive = state.alive.map((v, i) => (i === p ? false : v))
    const s: NinetyNineState = {
      ...state,
      hands: state.hands.map((h, i) => (i === p ? [] : h)),
      // 爆掉那個人的牌攤開，放到出過的牌最下面（之後洗牌會用到）
      played: [...cards, ...state.played],
      alive,
      out: [...state.out, p],
      moves: state.moves + 1,
      lastMove: { type: 'out', player: p, cards },
    }
    if (alive.filter(Boolean).length <= 1) return { ok: true, state: { ...s, over: true } }
    return { ok: true, state: { ...s, turn: nextAlive(s, p) } }
  }
  const card = a.card
  if (!state.hands[p].includes(card)) return { ok: false, reason: 'notInHand' }
  const minus = needsSign(card) && !!a.minus
  if (!canPlay(state.total, card, minus)) return { ok: false, reason: 'tooBig' }
  const kind = kindOf(card)
  let target = -1
  if (kind === 'target') {
    target = a.target ?? -1
    // 只剩兩個人：一定是另一位
    if (aliveCount(state) === 2) target = nextAlive(state, p)
    if (target === p || !state.alive[target]) return { ok: false, reason: 'badTarget' }
  }
  const total = totalAfter(state.total, card, minus)
  const dir: 1 | -1 = kind === 'reverse' ? (state.dir === 1 ? -1 : 1) : state.dir
  // 補一張牌；牌堆空了先把出過的牌（最上面那張留著）洗成新牌堆
  let deck = state.deck
  let played = [...state.played, card]
  let rng = state.rng
  let reshuffled = false
  let reshuffles = state.reshuffles
  if (!deck.length && played.length > 1) {
    ;[deck, rng] = shuffle(played.slice(0, -1), rng)
    played = played.slice(-1)
    reshuffled = true
    reshuffles++
  }
  const drew = deck.length > 0
  const hand = state.hands[p].filter((c) => c !== card)
  if (drew) hand.push(deck[0])
  const s: NinetyNineState = {
    ...state,
    hands: state.hands.map((h, i) => (i === p ? sortHand(hand) : h)),
    deck: drew ? deck.slice(1) : deck,
    played,
    total,
    dir,
    rng,
    reshuffles,
    moves: state.moves + 1,
    lastMove: { type: 'play', player: p, card, minus, target, before: state.total, total, drew, reshuffled },
  }
  const turn = kind === 'target' ? target : nextAlive(s, p, dir)
  if (s.moves >= MAX_MOVES) return { ok: true, state: { ...s, turn, over: true } }
  return { ok: true, state: { ...s, turn } }
}

/** 贏家：最後留下的人（拖太久結束的話，還在場上的人都算贏） */
export const winners = (s: NinetyNineState): number[] => s.alive.map((v, i) => (v ? i : -1)).filter((i) => i >= 0)
/** 名次（1 是第一名）：還在場上的並列第一，之後照出局的順序倒過來排 */
export function ranks(s: NinetyNineState): number[] {
  const w = winners(s)
  const r = s.alive.map(() => 1)
  s.out.forEach((p, k) => (r[p] = w.length + (s.out.length - k)))
  return r
}
