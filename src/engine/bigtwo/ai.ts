// 大老二 AI：依「打法」打分。輸入狀態與打法，輸出動作，不碰 UI。
import { nextRandom, type RngState } from '../common/rng'
import { PRESET_STYLES, type BigTwoStyle } from '../common/personas'
import type { Difficulty } from '../common/types'
import { RANK_2, RANK_A, cardPower, faceOf, isClubThree, rankOf, suitOf, type Card } from './cards'
import { canBeat, comboStrength, identifyCombo, isBomb, isFiveCard, type Combo } from './combos'
import { PLAYER_COUNT, type BigTwoAction, type BigTwoState } from './game'
import type { BigTwoOptions } from './options'

function subsets<T>(items: readonly T[], k: number): T[][] {
  if (k === 0) return [[]]
  if (items.length < k) return []
  const [head, ...rest] = items
  return [...subsets(rest, k - 1).map((s) => [head, ...s]), ...subsets(rest, k)]
}

/** 順子可能的點數組合（含 A2345、23456） */
const STRAIGHT_RANKS: number[][] = [
  [RANK_A, RANK_2, 0, 1, 2],
  [RANK_2, 0, 1, 2, 3],
  ...Array.from({ length: 8 }, (_, i) => [i, i + 1, i + 2, i + 3, i + 4]),
]

/** 小順（三張連號）可能的點數組合 */
const SMALL_STRAIGHT_RANKS: number[][] = [[RANK_A, RANK_2, 0], [RANK_2, 0, 1], ...Array.from({ length: 10 }, (_, i) => [i, i + 1, i + 2])]

/** 每種牌面只留一張（兩副牌時同一張牌有兩張，組出來的牌型一模一樣，不必算兩次） */
const uniqFaces = (cards: readonly Card[]): Card[] => {
  const seen = new Set<number>()
  return cards.filter((c) => (seen.has(faceOf(c)) ? false : (seen.add(faceOf(c)), true)))
}
/** 同點數的牌取 k 張的組合，牌面一樣的組合只留一個 */
const groupsOf = (group: readonly Card[], k: number): Card[][] => {
  const seen = new Set<string>()
  return subsets(group, k).filter((g) => {
    const sig = g.map(faceOf).sort((a, b) => a - b).join(',')
    return seen.has(sig) ? false : (seen.add(sig), true)
  })
}

/** 列出手牌能組出的所有合法牌型（兩副牌時牌面一樣的只列一次） */
export function listCombos(hand: readonly Card[], opts: BigTwoOptions): Combo[] {
  const byRank = new Map<number, Card[]>()
  for (const c of hand) byRank.set(rankOf(c), [...(byRank.get(rankOf(c)) ?? []), c])
  const byRankU = new Map<number, Card[]>()
  for (const [r, g] of byRank) byRankU.set(r, uniqFaces(g))
  const kickers = uniqFaces(hand)
  const out: Combo[] = []
  const seen = new Set<string>()
  const push = (cards: Card[]) => {
    const sig = cards.map(faceOf).sort((a, b) => a - b).join(',')
    if (seen.has(sig)) return
    seen.add(sig)
    const combo = identifyCombo(cards, opts)
    if (combo) out.push(combo)
  }

  for (const c of kickers) push([c])
  const pairsOf = new Map<number, Card[][]>()
  for (const [rank, group] of byRank) {
    pairsOf.set(rank, groupsOf(group, 2))
    for (const pair of pairsOf.get(rank)!) push(pair)
    if (opts.allowTriple) for (const t of groupsOf(group, 3)) push(t)
  }
  for (const [rank, group] of byRank) {
    for (const triple of groupsOf(group, 3)) {
      for (const [r2, pairs] of pairsOf) {
        if (r2 === rank) continue
        for (const pair of pairs) push([...triple, ...pair])
      }
    }
    for (const four of groupsOf(group, 4)) for (const kicker of kickers) if (rankOf(kicker) !== rank) push([...four, kicker])
  }
  const runs = (rankLists: number[][]) => {
    for (const ranks of rankLists) {
      const groups = ranks.map((r) => byRankU.get(r) ?? [])
      if (groups.some((g) => g.length === 0)) continue
      let partial: Card[][] = [[]]
      for (const g of groups) partial = partial.flatMap((p) => g.map((c) => [...p, c]))
      for (const cards of partial) push(cards)
    }
  }
  runs(STRAIGHT_RANKS)
  if (opts.allowSmallStraight) runs(SMALL_STRAIGHT_RANKS)
  if (opts.allowTwoPair) {
    const pairRanks = [...pairsOf.entries()].filter(([, ps]) => ps.length)
    for (let i = 0; i < pairRanks.length; i++) {
      for (let j = i + 1; j < pairRanks.length; j++) {
        const [r1, ps1] = pairRanks[i]
        const [r2, ps2] = pairRanks[j]
        const ks = kickers.filter((c) => rankOf(c) !== r1 && rankOf(c) !== r2)
        for (const p1 of ps1) for (const p2 of ps2) for (const k of ks) push([...p1, ...p2, k])
      }
    }
  }
  if (opts.allowFlush) {
    for (let suit = 0; suit < 4; suit++) {
      const same = hand.filter((c) => suitOf(c) === suit)
      for (const five of subsets(same, 5)) push(five)
    }
  }
  return out
}

/** 輪到的玩家現在能出的所有牌（不含過牌） */
export function legalPlays(state: BigTwoState): Combo[] {
  if (state.winner >= 0) return []
  let combos = listCombos(state.hands[state.turn], state.options)
  if (state.firstTurn) combos = combos.filter((c) => c.cards.some(isClubThree))
  const table = state.table
  if (table) combos = combos.filter((c) => canBeat(c, table.combo, state.options))
  return combos
}

/** 出這手牌會拆掉多少原本成組的牌 */
function breakCost(combo: Combo, hand: readonly Card[]): number {
  if (combo.cards.length >= 5) return 0
  const same = hand.filter((c) => rankOf(c) === rankOf(combo.cards[0])).length
  return same > combo.cards.length ? (same - combo.cards.length) * 6 : 0
}

/** 這手牌裡用掉了幾張「王牌」（2、A、炸彈） */
function premium(combo: Combo): number {
  if (isBomb(combo.type)) return 3
  return combo.cards.filter((c) => rankOf(c) >= RANK_A).length
}

const top = (combo: Combo) => Math.max(...combo.cards.map(rankOf))

function leadValue(combo: Combo, s: BigTwoStyle, hand: readonly Card[], danger: boolean): number {
  const n = combo.cards.length
  // 牌型偏好
  const pref = {
    small: n === 1 ? 8 : n === 2 ? 5 : 3,
    combo: n === 5 ? 16 : n >= 2 ? 6 : 0,
    pairs: n === 2 ? 14 : n === 5 ? 8 : 0,
    big: top(combo) * 1.6 + (n === 5 ? 6 : 0),
    mixed: n === 5 ? 10 : n >= 2 ? 7 : 2,
  }[s.lead]
  let v = pref + n * 4 * s.skill
  // 出小牌比較划算（大牌留著）；「big」打法反而愛先亮大牌
  if (s.lead !== 'big') v -= top(combo) * (1 + s.skill * 1.4)
  v -= breakCost(combo, hand) * s.skill
  v -= premium(combo) * s.hoard * (hand.length > 5 ? 8 : 1)
  if (isBomb(combo.type) && hand.length > 6) v -= 20 * (1 - s.bomb)
  // 下家只剩一張：別出小單張放他走
  if (danger && n === 1) v += (top(combo) * 5 - 32) * (0.3 + s.block)
  return v
}

function followValue(combo: Combo, s: BigTwoStyle, state: BigTwoState): number {
  const table = state.table!
  const hand = state.hands[state.turn]
  const threat = state.hands[table.player].length
  const bombOverSmall = isBomb(combo.type) && !isBomb(table.combo.type) && !isFiveCard(table.combo.type)
  let v = 30 - (comboStrength(combo) - comboStrength(table.combo)) * (0.25 + s.skill * 0.5)
  v -= breakCost(combo, hand) * s.skill
  v -= premium(combo) * s.hoard * (hand.length > 5 ? 9 : 2)
  if (bombOverSmall) v += (s.bomb - 0.6) * 40
  if (threat <= 3) v += s.block * (24 - threat * 5)
  return v
}

function passValue(s: BigTwoStyle, state: BigTwoState): number {
  const hand = state.hands[state.turn]
  const threat = state.hands[state.table!.player].length
  let v = (1 - s.aggression) * 46 - 8
  if (threat <= 3) v -= s.block * 30
  if (hand.length <= 4) v -= 12 * s.skill
  return v
}

// ── 規劃式出牌（最強的電腦用）──
// 不只看這一手：先把剩下的手牌拆成「最少要出幾手」，再看哪些是全場最大、出了一定拿回出牌權的牌（「王牌」）。
// 只用自己的手牌和公開資訊（已經出過的牌、每個人剩幾張），不偷看別人的牌。

/** 還沒出現過的牌（別人手上或還沒出，自己不知道在哪）：整副牌 − 自己手上 − 已出過的 */
function unseenOf(state: BigTwoState, me: number): Card[] {
  const decks = state.options.decks === 2 ? 2 : 1
  const gone = new Map<number, number>()
  const add = (c: Card) => gone.set(faceOf(c), (gone.get(faceOf(c)) ?? 0) + 1)
  for (const c of state.hands[me]) add(c)
  for (const c of state.played ?? []) add(c)
  const out: Card[] = []
  for (let f = 0; f < 52; f++) for (let k = gone.get(f) ?? 0; k < decks; k++) out.push(f + k * 52)
  return out
}

/** 這一手要用的判斷工具：外面最大的單張、最大的一對算一次就好，之後每張牌直接比 */
interface Judge {
  opts: BigTwoOptions
  topSingle: Combo | null
  topPair: Combo | null
  memo: Map<string, number>
}
function judgeOf(unseen: readonly Card[], opts: BigTwoOptions): Judge {
  let topSingle: Combo | null = null
  for (const c of unseen) {
    const s = identifyCombo([c], opts)!
    if (!topSingle || canBeat(s, topSingle, opts)) topSingle = s
  }
  let topPair: Combo | null = null
  const byRank = new Map<number, Card[]>()
  for (const c of unseen) byRank.set(rankOf(c), [...(byRank.get(rankOf(c)) ?? []), c])
  for (const g of byRank.values())
    for (let i = 0; i < g.length; i++)
      for (let j = i + 1; j < g.length; j++) {
        const p = identifyCombo([g[i], g[j]], opts)
        if (p && (!topPair || canBeat(p, topPair, opts))) topPair = p
      }
  return { opts, topSingle, topPair, memo: new Map() }
}
/** 是不是「王牌」：外面已經沒有壓得過它的同類牌。五張牌型很難被壓，當作壓得住 */
function isBoss(combo: Combo, j: Judge): boolean {
  const n = combo.cards.length
  if (n === 1) return !j.topSingle || !canBeat(j.topSingle, combo, j.opts)
  if (n === 2) return !j.topPair || !canBeat(j.topPair, combo, j.opts)
  return true
}
/** 一手牌的負擔：王牌很輕（一定拿回出牌權）；不是王牌的單張、對子越小越難脫手 */
function unitCost(combo: Combo, j: Judge): number {
  if (isBoss(combo, j)) return 3
  if (combo.cards.length >= 5) return 7
  return 10 + (12 - Math.max(...combo.cards.map(rankOf))) * 0.5
}

/** 剩下的牌照點數分成對子與單張（三條不能單出時就是一對＋一張） */
function leftoverCost(cards: readonly Card[], j: Judge): number {
  const byRank = new Map<number, Card[]>()
  for (const c of cards) byRank.set(rankOf(c), [...(byRank.get(rankOf(c)) ?? []), c])
  let cost = 0
  for (const g of byRank.values()) {
    const sorted = g.slice().sort((a, b) => cardPower(a, j.opts.suitOrder) - cardPower(b, j.opts.suitOrder))
    let i = sorted.length
    while (i >= 2) {
      const p = identifyCombo([sorted[i - 2], sorted[i - 1]], j.opts)
      cost += p ? unitCost(p, j) : 20
      i -= 2
    }
    if (i === 1) cost += unitCost(identifyCombo([sorted[0]], j.opts)!, j)
  }
  return cost
}

/**
 * 一手牌拆開後的總負擔（越小越好）：先挑五張牌型（一副牌最多試兩手；牌多時一手一手貪心挑），
 * 剩下的分成對子與單張。fives 是整副手牌能組的五張牌型（只算一次），這裡只用完全在手上的。
 */
function planCost(hand: readonly Card[], fives: readonly Combo[], j: Judge): number {
  if (!hand.length) return -100
  const key = hand.slice().sort((a, b) => a - b).join(',')
  const hit = j.memo.get(key)
  if (hit !== undefined) return hit
  const inHand = new Set(hand)
  const mine = fives.filter((f) => f.cards.every((c) => inHand.has(c)))
  const rest = (used: Set<Card>) => hand.filter((c) => !used.has(c))
  let best = leftoverCost(hand, j)
  if (hand.length <= 16) {
    for (let a = 0; a < mine.length; a++) {
      const u1 = new Set(mine[a].cards)
      const ca = unitCost(mine[a], j)
      best = Math.min(best, ca + leftoverCost(rest(u1), j))
      for (let b = a + 1; b < mine.length; b++) {
        if (mine[b].cards.some((c) => u1.has(c))) continue
        const u2 = new Set([...u1, ...mine[b].cards])
        best = Math.min(best, ca + unitCost(mine[b], j) + leftoverCost(rest(u2), j))
      }
    }
  } else {
    let used = new Set<Card>()
    let acc = 0
    for (;;) {
      let pick: Combo | null = null
      let pickV = acc + leftoverCost(rest(used), j)
      for (const f of mine) {
        if (f.cards.some((c) => used.has(c))) continue
        const u = new Set([...used, ...f.cards])
        const v = acc + unitCost(f, j) + leftoverCost(rest(u), j)
        if (v < pickV) ((pickV = v), (pick = f))
      }
      if (!pick) break
      acc += unitCost(pick, j)
      used = new Set([...used, ...pick.cards])
      best = Math.min(best, pickV)
    }
  }
  j.memo.set(key, best)
  return best
}

/** 規劃式選牌：自由出牌時挑「出完之後剩下最好收尾」的一手；跟牌時比較「過牌」與「壓下去」哪個划算 */
function plannedAction(state: BigTwoState, plays: Combo[]): Combo | null {
  const me = state.turn
  const hand = state.hands[me]
  const opts = state.options
  const j = judgeOf(unseenOf(state, me), opts)
  // 五張牌型只從整副手牌找一次；兩副牌時只留比較小的前 40 手（太多算不完）
  let fives = listCombos(hand, opts).filter((c) => c.cards.length === 5)
  if (fives.length > 40) fives = fives.sort((a, b) => comboStrength(a) - comboStrength(b)).slice(0, 40)
  const without = (c: Combo) => hand.filter((x) => !c.cards.includes(x))
  const others = state.hands.map((h, p) => (p === me ? 99 : h.length))
  const minOther = Math.min(...others)
  /** 別人有人剛好剩這麼多張：出同樣張數又壓不住的牌，會放他走 */
  const risky = (c: Combo) => others.some((k) => k === c.cards.length) && !isBoss(c, j)

  if (!state.table) {
    // 收尾：手上只剩一手會輸掉出牌權的牌（其他都是王牌）時，先打王牌，最後才出那手
    const closing = planCost(hand, fives, j) < 20
    let best = plays[0]
    let bestV = Infinity
    for (const c of plays) {
      let v = planCost(without(c), fives, j)
      if (closing && isBoss(c, j)) v -= 12
      // 同樣好收尾時先出小的
      v += Math.max(...c.cards.map(rankOf)) * 0.15
      // 王牌留著搶出牌權；快出完才用
      if (isBoss(c, j) && c.cards.length < 5 && hand.length - c.cards.length > 3) v += 4
      if (risky(c)) v += 25
      if (v < bestV) ((bestV = v), (best = c))
    }
    return best
  }

  const threat = state.hands[state.table.player].length
  let best: Combo | null = null
  // 過牌：手牌不變，出牌權留在別人手上；有人快出完時過牌很危險
  let bestV = planCost(hand, fives, j) + (threat <= 2 || minOther <= 2 ? 30 : 0)
  for (const c of plays) {
    let v = planCost(without(c), fives, j)
    // 壓得住就拿回出牌權；有人快出完時更要用壓得住的牌擋
    v -= isBoss(c, j) ? (minOther <= 2 ? 16 : 6) : 1.5
    // 不必要時別浪費 2、炸彈
    if (hand.length > 6 && threat > 3) v += premium(c) * 2.5
    if (v < bestV) ((bestV = v), (best = c))
  }
  return best
}

export type AiStyle = Difficulty | BigTwoStyle

const styleOf = (style: AiStyle): BigTwoStyle => (typeof style === 'string' ? PRESET_STYLES[style].bigtwo : style)

/** 選一個動作。回傳 [動作, 新的亂數狀態] */
export function chooseBigTwoAction(state: BigTwoState, style: AiStyle, rng: RngState): [BigTwoAction, RngState] {
  const s = styleOf(style)
  const player = state.turn
  const hand = state.hands[player]
  const plays = legalPlays(state)
  let r: number
  ;[r, rng] = nextRandom(rng)
  const noise = () => {
    let v: number
    ;[v, rng] = nextRandom(rng)
    return (v - 0.5) * (s.whim ?? 1 - s.skill) * 18
  }

  // 一手出完永遠優先
  const finisher = plays.find((c) => c.cards.length === hand.length)
  if (finisher) return [{ type: 'play', player, cards: finisher.cards }, rng]

  // 手滑：隨手出一手
  if (plays.length && r < s.blunder) {
    let v: number
    ;[v, rng] = nextRandom(rng)
    const pick = plays[Math.floor(v * plays.length)]
    return [{ type: 'play', player, cards: pick.cards }, rng]
  }

  // 最強的電腦：規劃式出牌
  if (s.skill >= 0.95 && plays.length) {
    const pick = plannedAction(state, plays)
    return [pick ? { type: 'play', player, cards: pick.cards } : { type: 'pass', player }, rng]
  }

  if (!state.table) {
    const next = state.hands[(player + 1) % PLAYER_COUNT].length
    const danger = next <= 1 || Math.min(...state.hands.filter((_, p) => p !== player).map((h) => h.length)) <= 1
    let best = plays[0]
    let bestV = -Infinity
    for (const c of plays) {
      const v = leadValue(c, s, hand, danger) + noise()
      if (v > bestV) {
        bestV = v
        best = c
      }
    }
    return [{ type: 'play', player, cards: best.cards }, rng]
  }

  let best: Combo | null = null
  let bestV = passValue(s, state) + noise()
  for (const c of plays) {
    const v = followValue(c, s, state) + noise()
    if (v > bestV) {
      bestV = v
      best = c
    }
  }
  return [best ? { type: 'play', player, cards: best.cards } : { type: 'pass', player }, rng]
}

/** 提示：給真人玩家一手建議的牌（沒有可出的牌回傳 null） */
export function suggestPlay(state: BigTwoState): Card[] | null {
  const plays = legalPlays(state)
  if (!plays.length) return null
  const s = PRESET_STYLES.normal.bigtwo
  if (!state.table) {
    const [action] = chooseBigTwoAction(state, s, 1)
    return action.type === 'play' ? action.cards : null
  }
  // 跟牌時一定給一手能出的（就算 AI 會選擇過牌）
  return plays.reduce((a, b) => (followValue(a, s, state) >= followValue(b, s, state) ? a : b)).cards
}
