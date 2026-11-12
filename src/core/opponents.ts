// 隨機挑對手（名字＋長相）
import { OPPONENT_NAMES } from '@/data/names'
import { seedRng, shuffle } from '@/engine/common/rng'

export interface Opponent {
  name: string
  /** 長相編號，給 ArtBuddy 用 */
  look: number
}

/** 挑 count 位不重複的對手 */
export function pickOpponents(count: number, seed = Date.now()): Opponent[] {
  const [order] = shuffle(OPPONENT_NAMES.map((_, i) => i), seedRng(seed))
  return order.slice(0, count).map((i) => ({ name: OPPONENT_NAMES[i], look: i }))
}
