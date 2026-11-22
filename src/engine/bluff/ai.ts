// 吹牛的電腦：只看自己的手牌和大家都看得到的事（每個人剩幾張、桌上蓋了幾張、喊的點數、每一手喊幾張、收掉幾張），
// 看不到別人的牌，也看不到桌上蓋著的牌是什麼。
// 抓不抓：自己手上的那個點數＋對方喊的張數超過 4 張＝一定說謊，直接抓；
//   不然用「剩下沒看到的牌裡，他手上剛好有這麼多張的機率」估他說真話的可能，太低就抓；他出完最後的牌時更想抓（不抓他就出線了）。
// 出牌：帶頭時喊自己最多張的點數、照實出；跟牌時有就照實出，沒有就看個性決定要不要蓋一張吹牛，還是過。
import { nextInt, nextRandom, type RngState } from '../common/rng'
import { canCall, MAX_PLAY, mustLead, rankOf, type BluffAction, type BluffState, type Card } from './rules'

export interface BluffStyle {
  /** 0～1：沒有那個點數時，敢不敢蓋一張假的（實測：敢吹的人出牌快、比較會贏） */
  bluff: number
  /** 說真話的機率低於這條線就抓。實測四個人時亂抓不划算（抓錯只有自己吃，抓對大家一起得利），會算的人只在很有把握時抓 */
  line: number
  /** 判斷時的搖擺 */
  noise: number
  /** 0～1：隨手亂來的機率 */
  blunder: number
}

const choose = (n: number, k: number): number => {
  if (k < 0 || k > n) return 0
  let r = 1
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i
  return r
}
/** 從 total 張沒看過的牌（其中 good 張是那個點數）隨便抽 draw 張，至少抽到 need 張的機率 */
function atLeast(total: number, good: number, draw: number, need: number): number {
  if (need <= 0) return 1
  if (draw > total) draw = total
  const all = choose(total, draw)
  if (!all) return 0
  let p = 0
  for (let k = need; k <= Math.min(good, draw); k++) p += (choose(good, k) * choose(total - good, draw - k)) / all
  return Math.min(1, p)
}

/** 手上每個點數有哪幾張 */
function groups(hand: readonly Card[]): Map<number, Card[]> {
  const g = new Map<number, Card[]>()
  for (const c of hand) {
    const r = rankOf(c)
    g.set(r, [...(g.get(r) ?? []), c])
  }
  return g
}

/** 拿來吹牛的牌：張數最少的點數裡的牌（拆掉也不心疼） */
function junk(hand: readonly Card[], avoid: number): Card {
  const g = groups(hand)
  let best = hand[0]
  let bestN = Infinity
  for (const [r, cs] of g) {
    if (r === avoid) continue
    if (cs.length < bestN) ((bestN = cs.length), (best = cs[0]))
  }
  return best
}

/** 上一手說真話的機率（只用公開資訊和自己的手牌）。
 *  先算「他手上剛好有這麼多張」的機率，再想到：有的人照實出、沒有的人只有一部分會吹牛，
 *  所以他真的出了，說真話的機會比單看機率高（貝氏）。吹牛多半只蓋一張，喊兩張以上說謊的少。 */
export function truthChance(s: BluffState, me: number): number {
  const lastPlay = s.plays[s.plays.length - 1]
  const n = lastPlay.cards.length
  const claim = s.claim!
  const mine = s.hands[me].filter((c) => rankOf(c) === claim).length
  // 一副牌每個點數只有 4 張；那個點數的四張已經被棄掉（公開）也一定是假的
  if (mine + n > 4 || s.quads?.some((q) => q.rank === claim)) return 0
  const target = lastPlay.player
  // 沒看過的牌：不在我手上的都算（別人的手牌、桌上的、收掉的）
  const unseen = 52 - s.hands[me].length - (s.quads?.length ?? 0) * 4
  const good = 4 - mine
  // 他出這手之前手上有幾張
  const before = s.hands[target].length + n
  const has = atLeast(unseen, good, before, n)
  // 他出完最後的牌：拚出線的人比較敢吹
  const lie = (n === 1 ? 0.45 : 0.18) * (s.hands[target].length === 0 ? 1.6 : 1)
  return has / (has + (1 - has) * lie)
}

export function chooseBluffAction(s: BluffState, st: BluffStyle, rng: RngState): [BluffAction, RngState] {
  const p = s.turn
  const hand = s.hands[p]
  if (!hand.length) return [{ type: 'timeout', player: p }, rng]
  let r: number
  ;[r, rng] = nextRandom(rng)

  // ── 帶頭：喊自己最多張的點數，照實出 ──
  if (mustLead(s)) {
    if (r < st.blunder) {
      let k: number
      ;[k, rng] = nextInt(rng, hand.length)
      return [{ type: 'play', player: p, cards: [hand[k]], rank: rankOf(hand[k]) }, rng]
    }
    const g = groups(hand)
    // 手上剩的牌全是同一個點數：一次出完
    if (g.size === 1 && hand.length <= MAX_PLAY) return [{ type: 'play', player: p, cards: hand.slice(), rank: rankOf(hand[0]) }, rng]
    let best: Card[] = []
    for (const cs of g.values()) if (cs.length > best.length) best = cs
    return [{ type: 'play', player: p, cards: best.slice(0, MAX_PLAY), rank: rankOf(best[0]) }, rng]
  }

  const claim = s.claim!
  // ── 抓不抓 ──
  if (canCall(s, p)) {
    const truth = truthChance(s, p)
    const target = s.plays[s.plays.length - 1].player
    let call: boolean
    if (truth === 0) call = r >= st.blunder * 0.5
    else {
      // 他出完最後的牌：不抓就讓他出線，比較願意賭
      const line = st.line + (s.hands[target].length === 0 ? 0.4 : 0)
      let n: number
      ;[n, rng] = nextRandom(rng)
      call = truth + (n - 0.5) * st.noise < line
      if (r < st.blunder) call = n < 0.3
    }
    if (call) return [{ type: 'call', player: p }, rng]
  }

  // ── 跟牌 ──
  const mine = hand.filter((c) => rankOf(c) === claim)
  if (mine.length) {
    let cards = mine.slice(0, MAX_PLAY)
    // 手上剩的牌不多：連假的一起出，賭一把出線
    const rest = hand.length - cards.length
    let b: number
    ;[b, rng] = nextRandom(rng)
    if (rest > 0 && hand.length <= MAX_PLAY && b < st.bluff * 0.6) cards = hand.slice()
    return [{ type: 'play', player: p, cards, rank: claim }, rng]
  }
  // 沒有這個點數：吹牛蓋一張，或過
  let want = st.bluff + (hand.length <= 2 ? 0.2 : 0)
  if (r < st.blunder) want = 0.5
  let n: number
  ;[n, rng] = nextRandom(rng)
  if (n < want) return [{ type: 'play', player: p, cards: [junk(hand, claim)], rank: claim }, rng]
  return [{ type: 'pass', player: p }, rng]
}
