// 九九的電腦：只看自己的手牌、桌上的總數、出過的牌、誰還在場上、方向（看不到別人的牌和牌堆）。
// 想法：
//   - 功能牌是「保命牌」（任何時候都能出），能不用就先留著；越強的越想留（K、黑桃 A ＞ Q、10 ＞ J、4、5）。
//   - 數字牌能出就先出；會算的人挑「出完總數越高越好」的，把壓力丟給下一個人，但自己手上沒保命牌時不敢衝太高。
//   - 10、Q 加或減：總數高、自己手上牌不好時用減的；會算的人能加就加（壓下一個人）。
//   - 5 指定：指定剛剛出過功能牌的人（他手上的保命牌可能用掉了），不然隨便挑。
//   - 4 迴轉：會算的人在總數很高時用它，讓剛剛出過功能牌的那位先接。
import { nextInt, nextRandom, type RngState } from '../common/rng'
import { canPlay, isSpecial, kindOf, legalCards, nextAlive, rankOf, totalAfter, type Card, type Kind, type NinetyNineAction, type NinetyNineState } from './rules'

export interface NinetyNineStyle {
  /** 0～1：會不會算 */
  skill: number
  /** 0～1：愛不愛壓人（把總數往上推） */
  aggression: number
  /** 0～1：隨手亂出的機率 */
  blunder: number
}

/** 留著這張牌的價值（越高越捨不得出） */
const KEEP: Record<Kind, number> = { num: 0, pass: 4, reverse: 4, target: 4.5, ten: 6, twenty: 7, max: 9, zero: 9.5 }

interface Move {
  card: Card
  minus: boolean
  target: number
}

/** 手上這些牌之後還有幾張「保命牌」或在 total 下還出得了的牌 */
function safeCount(hand: readonly Card[], total: number): number {
  return hand.filter((c) => isSpecial(c) || canPlay(total, c)).length
}

/** 最近出過功能牌（可能保命牌用完了）的人，越近越可疑 */
function suspect(s: NinetyNineState, me: number): number {
  const lm = s.lastMove
  if (lm && lm.type === 'play' && lm.player !== me && s.alive[lm.player] && isSpecial(lm.card)) return lm.player
  return -1
}

function scoreMove(s: NinetyNineState, me: number, m: Move, st: NinetyNineStyle): number {
  const hand = s.hands[me].filter((c) => c !== m.card)
  const after = totalAfter(s.total, m.card, m.minus)
  const kind = kindOf(m.card)
  let v = -KEEP[kind]
  // 數字牌：小的留著比較好用（之後總數高了還出得去），大的先出
  if (kind === 'num') v += rankOf(m.card) * 0.18
  // 壓下一個人：總數越接近 99 越難接
  const press = after >= 90 ? (after - 89) * 0.9 : after / 60
  v += press * (0.3 + st.aggression * 0.7) * st.skill
  // 自己的安全：出完之後，下次輪到自己時（總數可能更高）還有幾張能出
  const guard = safeCount(hand, Math.min(99, after + 6))
  const specials = hand.filter(isSpecial).length
  if (after >= 80 && specials === 0) v -= (after - 79) * 0.35 * (0.4 + st.skill)
  v += Math.min(guard, 3) * 0.6 * st.skill
  // 用減的：總數本來就低還用減的很浪費
  if (m.minus) v -= Math.max(0, 40 - s.total) * 0.05
  // 指定：挑可疑的人
  if (kind === 'target') {
    const sus = suspect(s, me)
    if (sus >= 0 && m.target === sus) v += 1.2 * st.skill
  }
  // 迴轉：總數高、剛剛出功能牌的人在反方向那邊，就迴轉讓他接
  if (kind === 'reverse') {
    const sus = suspect(s, me)
    if (sus >= 0 && nextAlive(s, me, s.dir === 1 ? -1 : 1) === sus && s.total >= 80) v += 1.5 * st.skill
  }
  return v
}

/** 列出所有出法（10、Q 加或減各算一種；5 每個對象各算一種） */
export function allMoves(s: NinetyNineState, me = s.turn): Move[] {
  const out: Move[] = []
  for (const c of legalCards(s, me)) {
    const k = kindOf(c)
    if (k === 'ten' || k === 'twenty') {
      if (canPlay(s.total, c)) out.push({ card: c, minus: false, target: -1 })
      out.push({ card: c, minus: true, target: -1 })
    } else if (k === 'target') {
      s.alive.forEach((on, p) => on && p !== me && out.push({ card: c, minus: false, target: p }))
    } else out.push({ card: c, minus: false, target: -1 })
  }
  return out
}

export function chooseNinetyNineAction(s: NinetyNineState, st: NinetyNineStyle, rng: RngState): [NinetyNineAction, RngState] {
  const me = s.turn
  const moves = allMoves(s, me)
  if (!moves.length) return [{ type: 'out', player: me }, rng]
  let r: number
  ;[r, rng] = nextRandom(rng)
  if (moves.length > 1 && r < st.blunder) {
    let k: number
    ;[k, rng] = nextInt(rng, moves.length)
    const m = moves[k]
    return [{ type: 'play', player: me, card: m.card, minus: m.minus, target: m.target }, rng]
  }
  let best = moves[0]
  let bestV = -Infinity
  for (const m of moves) {
    let n: number
    ;[n, rng] = nextRandom(rng)
    const v = scoreMove(s, me, m, st) + (n - 0.5) * 3 * (1 - st.skill)
    if (v > bestV) ((bestV = v), (best = m))
  }
  return [{ type: 'play', player: me, card: best.card, minus: best.minus, target: best.target }, rng]
}
