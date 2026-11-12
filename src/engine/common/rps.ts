// 猜拳：用來決定兩人遊戲的先後手
import { nextInt, type RngState } from './rng'

export type RpsHand = 'rock' | 'paper' | 'scissors'
export const RPS_HANDS: readonly RpsHand[] = ['rock', 'paper', 'scissors']

const BEATS: Record<RpsHand, RpsHand> = { rock: 'scissors', paper: 'rock', scissors: 'paper' }

/** 1 = a 贏，-1 = b 贏，0 = 平手 */
export function resolveRps(a: RpsHand, b: RpsHand): 1 | 0 | -1 {
  if (a === b) return 0
  return BEATS[a] === b ? 1 : -1
}

export function randomRps(rng: RngState): [RpsHand, RngState] {
  const [i, next] = nextInt(rng, 3)
  return [RPS_HANDS[i], next]
}
