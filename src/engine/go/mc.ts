// 圍棋「看整盤」（挑戰難度用），純函式、不碰 UI：
//   9 路（mcPick）：把前幾名的候選一手一手試下，每一手之後都從那個局面「隨機下到底」很多次，
//     數最後整盤誰的地多（中國規則數子＋貼目），選平均下來對自己最有利的那一手（每個候選用同一串亂數，比較公平）。
//   13、19 路（wholeBoardBonus）：棋盤大，隨機下到底拿來直接比候選雜訊太大，改成只用來看全局。
import type { RngState } from '../common/rng'
import { ownership } from './playout'
import { applyGo, type Color, type GoState } from './rules'

/** 從這個局面試下到底，平均下來 me 贏幾目（負的＝輸） */
export function playoutMargin(state: GoState, me: Color, playouts: number, rng: RngState): number {
  const [own] = ownership(state, playouts, rng, state.turn)
  let black = 0
  for (let i = 0; i < own.length; i++) black += own[i]
  const margin = black - state.komi
  return me === 1 ? margin : -margin
}

export interface McPick {
  index: number
  /** 下這一手之後平均贏幾目 */
  value: number
}

/**
 * 從候選裡挑試下結果最好的一手。prior：候選原本的分數（越高越好），當作一點點參考（試下次數少時比較穩）。
 */
export function mcPick(state: GoState, cands: readonly { index: number; score: number }[], playouts: number, rng: RngState, prior = 0.25): McPick | null {
  const me = state.turn
  let best: McPick | null = null
  let bestTotal = -Infinity
  for (const c of cands) {
    const r = applyGo(state, { type: 'play', index: c.index })
    if (!r.ok) continue
    const value = playoutMargin(r.state, me, playouts, rng)
    const total = value + c.score * prior
    if (total > bestTotal) {
      bestTotal = total
      best = { index: c.index, value }
    }
  }
  return best
}

/**
 * 大棋盤（13、19 路）看整盤：從目前的局面試下到底幾十次，得到每一點「最後屬於誰」的機率，
 * 再幫每個候選加減分（隨機下到底的雜訊在大棋盤太大，不拿來直接比候選，只拿來看全局）：
 *   還沒定的地方（誰的都不一定）→ 下在那附近價值高（大場、要點）
 *   旁邊有自己快死的棋 → 救；旁邊有對方很弱的棋 → 攻
 *   已經確定是自己的地、或確定是對方的地 → 下在那裡是浪費／送死
 */
export function wholeBoardBonus(state: GoState, playouts: number, rng: RngState): Float32Array {
  const { size, board } = state
  const me = state.turn
  const sign = me === 1 ? 1 : -1
  // 一半先讓黑下、一半先讓白下，不偏向誰
  const [a, r2] = ownership(state, Math.ceil(playouts / 2), rng, 1)
  const [b] = ownership(state, Math.ceil(playouts / 2), r2, 2)
  const o = new Float32Array(board.length)
  for (let i = 0; i < o.length; i++) o[i] = ((a[i] + b[i]) / 2) * sign
  // 每塊棋的安危（平均擁有率）：自己的低＝危險，對方的高（從我看）＝對方弱
  const groupOf = new Int32Array(board.length).fill(-1)
  const safety: number[] = []
  const sizes: number[] = []
  for (let i = 0; i < board.length; i++) {
    if (!board[i] || groupOf[i] >= 0) continue
    const g = safety.length
    const stack = [i]
    groupOf[i] = g
    let sum = 0
    let n = 0
    while (stack.length) {
      const p = stack.pop()!
      sum += o[p]
      n++
      const x = p % size
      for (const q of [x > 0 ? p - 1 : -1, x < size - 1 ? p + 1 : -1, p - size, p + size]) {
        if (q < 0 || q >= board.length || groupOf[q] >= 0 || board[q] !== board[i]) continue
        groupOf[q] = g
        stack.push(q)
      }
    }
    safety.push(sum / n)
    sizes.push(n)
  }
  const bonus = new Float32Array(board.length)
  for (let i = 0; i < board.length; i++) {
    if (board[i]) continue
    const x = i % size
    const y = (i - x) / size
    // 附近（2 格內）還沒定的程度
    let open = 0
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const d = Math.abs(dx) + Math.abs(dy)
        const xx = x + dx
        const yy = y + dy
        if (d > 2 || xx < 0 || yy < 0 || xx >= size || yy >= size) continue
        open += (1 - Math.abs(o[yy * size + xx])) / (1 + d)
      }
    let v = open * 2.2
    // 確定的地：自己的浪費、對方的送死
    if (o[i] > 0.75) v -= (o[i] - 0.75) * 24
    else if (o[i] < -0.75) v -= (-o[i] - 0.75) * 16
    // 旁邊的棋：自己快死的救、對方弱的攻（越大塊越要緊）
    const seen = new Set<number>()
    for (const q of [x > 0 ? i - 1 : -1, x < size - 1 ? i + 1 : -1, i - size, i + size]) {
      if (q < 0 || q >= board.length || !board[q]) continue
      const g = groupOf[q]
      if (seen.has(g)) continue
      seen.add(g)
      const s = safety[g]
      const big = Math.min(sizes[g], 12)
      if (board[q] === me && s < 0.4 && s > -0.6) v += (0.4 - s) * big * 2.2
      else if (board[q] !== me && s > -0.4 && s < 0.6) v += (s + 0.4) * big * 1.8
    }
    bonus[i] = v
  }
  return bonus
}
