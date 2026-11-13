// 撿紅點 AI：依打法選出哪張牌、吃哪張。輸入狀態與打法，輸出動作，不碰 UI。
import { nextRandom, type RngState } from '../common/rng'
import { PRESET_STYLES, type RedPointStyle } from '../common/personas'
import type { Difficulty } from '../common/types'
import type { Card } from '../bigtwo/cards'
import { PLAYERS, cardPoints, matches, targetsFor, type RedPointAction, type RedPointState } from './rules'

export type RedPointAiStyle = Difficulty | RedPointStyle
const styleOf = (s: RedPointAiStyle): RedPointStyle => (typeof s === 'string' ? PRESET_STYLES[s].redpoint : s)

/** 我看不到的牌（別人的手牌＋牌堆） */
function unseen(state: RedPointState, me: number): Card[] {
  const seen = new Set<Card>([...state.hands[me], ...state.table, ...state.captured.flat()])
  const out: Card[] = []
  for (let c = 0; c < 52; c++) if (!seen.has(c)) out.push(c)
  return out
}

/** 把 card 留在桌上，被別人吃走的風險（大約的分數損失） */
function risk(card: Card, hidden: Card[]): number {
  const takers = hidden.filter((h) => matches(card, h))
  if (!takers.length) return 0
  const best = Math.max(...takers.map(cardPoints))
  const chance = Math.min(1, takers.length / 3)
  return (cardPoints(card) + best * 0.5) * chance
}

interface Option {
  card: Card
  target?: Card
  value: number
}

export function legalOptions(state: RedPointState): Option[] {
  const out: Option[] = []
  for (const card of state.hands[state.turn]) {
    const targets = targetsFor(state, card)
    if (targets.length) for (const target of targets) out.push({ card, target, value: 0 })
    else out.push({ card, value: 0 })
  }
  return out
}

export function chooseRedPointAction(state: RedPointState, style: RedPointAiStyle, rng: RngState): [RedPointAction, RngState] {
  const s = styleOf(style)
  const player = state.turn
  let r: number
  ;[r, rng] = nextRandom(rng)

  if (state.phase === 'flip') {
    const top = state.pile[0]
    const targets = targetsFor(state, top)
    if (targets.length <= 1) return [{ type: 'flip', player }, rng]
    // 翻到的牌能配兩張以上：會算的人挑分數高的
    const sorted = targets.slice().sort((a, b) => cardPoints(b) - cardPoints(a))
    const pick = r < s.skill ? sorted[0] : sorted[Math.floor(r * 1000) % sorted.length]
    return [{ type: 'flip', player, target: pick }, rng]
  }

  const options = legalOptions(state)
  if (r < s.blunder) {
    let v: number
    ;[v, rng] = nextRandom(rng)
    const o = options[Math.floor(v * options.length)]
    return [{ type: 'play', player, card: o.card, target: o.target }, rng]
  }

  const hidden = unseen(state, player)
  const late = state.pile.length <= PLAYERS * 2
  let best = options[0]
  let bestV = -Infinity
  for (const o of options) {
    let v: number
    if (o.target !== undefined) {
      // 吃牌：看得到的分數，貪心的人更看重
      v = (cardPoints(o.card) + cardPoints(o.target)) * (1 + s.greed) + 6
      // 吃掉之後，桌上留下的牌被別人吃的風險不變；但用掉這張手牌可能可惜（留著日後吃大牌）
      v -= s.skill * Math.max(0, ...hidden.filter((h) => matches(o.card, h)).map(cardPoints)) * 0.15
    } else {
      // 墊牌：會算的人挑別人最難吃、分數最低的牌留在桌上
      v = -cardPoints(o.card) * (0.6 + s.greed * 0.4) - risk(o.card, hidden) * s.skill * (late ? 1.4 : 1)
    }
    let n: number
    ;[n, rng] = nextRandom(rng)
    v += (n - 0.5) * (1 - s.skill) * 14
    if (v > bestV) {
      bestV = v
      best = o
    }
  }
  return [{ type: 'play', player, card: best.card, target: best.target }, rng]
}
