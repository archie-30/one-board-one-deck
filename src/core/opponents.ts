// 隨機挑對手：名字、長相與打法都用同一個編號
import { OPPONENTS, type OpponentProfile } from '@/data/names'
import { PERSONAS, type Persona } from '@/engine/common/personas'
import { seedRng, shuffle } from '@/engine/common/rng'

export interface Opponent extends OpponentProfile {
  id: number
  persona: Persona
}

export const opponentById = (id: number): Opponent => ({ ...OPPONENTS[id], id, persona: PERSONAS[id] })

/** 挑 count 位不重複的對手 */
export function pickOpponents(count: number, seed = Date.now()): Opponent[] {
  const [order] = shuffle(
    OPPONENTS.map((_, i) => i),
    seedRng(seed),
  )
  return order.slice(0, count).map(opponentById)
}
