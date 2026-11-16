// 排七的電腦：只看自己的手牌和桌上排到哪裡（看不到別人的牌）。
// 有牌可以接時，挑「對自己有利、對別人幫助少」的那張：開出去的那一邊自己的牌越多越好、別人的越多越不好。
// 沒牌可以接時，蓋點數最小的（會算的人還會避開「待會兒可能輪到能接」的牌）。
// 實測（600 局，跟亂出的對手比）：亂出平均罰 8.3 分，這套平均罰 7.3 分，對手被卡到平均罰 14 分。
import { nextInt, nextRandom, type RngState } from '../common/rng'
import { legalPlays, lowestCover, rankOf, suitOf, type Card, type SevensAction, type SevensState } from './rules'

export interface SevensStyle {
  /** 0～1：會不會算 */
  skill: number
  /** 0～1：隨手亂出的機率 */
  blunder: number
}

/** 出這張牌的分數（越高越想出）：這張牌開出去的那一邊，自己還有幾張（自己的路）、別人還有幾張（幫別人開路） */
function playScore(hand: readonly Card[], c: Card, st: SevensStyle): number {
  const suit = suitOf(c)
  const r = rankOf(c)
  const dirs = r === 7 ? [-1, 1] : r < 7 ? [-1] : [1]
  let own = 0
  let other = 0
  for (const d of dirs)
    for (let k = r + d; k >= 1 && k <= 13; k += d) {
      if (hand.includes(suit * 13 + k - 1)) own++
      else other++
    }
  return own * 2 - other * 0.4 * st.skill
}

/** 蓋這張牌的代價（越低越想蓋）：點數就是罰分；會算的人也避開「快輪到能接」的牌（離桌上的頭尾近） */
function coverCost(s: SevensState, c: Card, st: SevensStyle): number {
  const r = rankOf(c)
  const row = s.rows[suitOf(c)]
  const dist = row ? Math.min(Math.abs(r - (row[0] - 1)), Math.abs(r - (row[1] + 1))) : Math.abs(r - 7)
  return r + Math.max(0, 4 - dist) * st.skill
}

export function chooseSevensAction(s: SevensState, st: SevensStyle, rng: RngState): [SevensAction, RngState] {
  const p = s.turn
  const hand = s.hands[p]
  const legal = legalPlays(s, p)
  // 手上沒牌（不該輪到他）：照規則送一個逾時，由引擎決定
  if (!hand.length) return [{ type: 'timeout', player: p }, rng]
  let r: number
  ;[r, rng] = nextRandom(rng)
  if (legal.length) {
    if (legal.length > 1 && r < st.blunder) {
      let k: number
      ;[k, rng] = nextInt(rng, legal.length)
      return [{ type: 'play', player: p, card: legal[k] }, rng]
    }
    let best = legal[0]
    let bestV = -Infinity
    for (const c of legal) {
      let n: number
      ;[n, rng] = nextRandom(rng)
      const v = playScore(hand, c, st) + (n - 0.5) * 6 * (1 - st.skill)
      if (v > bestV) ((bestV = v), (best = c))
    }
    return [{ type: 'play', player: p, card: best }, rng]
  }
  if (r < st.blunder * 0.5) {
    let k: number
    ;[k, rng] = nextInt(rng, hand.length)
    return [{ type: 'cover', player: p, card: hand[k] }, rng]
  }
  const pick = st.skill < 0.2 ? lowestCover(hand) : hand.reduce((a, b) => (coverCost(s, b, st) < coverCost(s, a, st) ? b : a))
  return [{ type: 'cover', player: p, card: pick }, rng]
}
