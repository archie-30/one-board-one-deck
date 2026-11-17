// 圍棋「看整盤」（挑戰難度用）：把前幾名的候選一手一手試下，每一手之後都從那個局面「隨機下到底」很多次，
// 數最後整盤誰的地多（中國規則數子＋貼目），選平均下來對自己最有利的那一手。
// 每個候選用同一串亂數試下（比較公平，雜訊比較小）。純函式：不碰 UI。
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
