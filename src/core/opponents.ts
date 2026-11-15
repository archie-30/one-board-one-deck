// 隨機挑對手：名字、長相與打法都用同一個編號
import { OPPONENTS, type OpponentProfile } from '@/data/names'
import { PERSONAS, type Persona } from '@/engine/common/personas'
import { seedRng, shuffle } from '@/engine/common/rng'
import { opponentName } from './names'

export interface Opponent extends OpponentProfile {
  id: number
  persona: Persona
}

/** 名字用玩家取的（沒取就是預設） */
export const opponentById = (id: number): Opponent => ({ ...OPPONENTS[id], name: opponentName(id), id, persona: PERSONAS[id] })

/** 挑 count 位不重複的對手；noBeginner：不挑新手打法的人（困難模式用） */
export function pickOpponents(count: number, seed = Date.now(), noBeginner = false): Opponent[] {
  const [order] = shuffle(
    OPPONENTS.map((_, i) => i).filter((i) => !(noBeginner && OPPONENTS[i].beginner)),
    seedRng(seed),
  )
  return order.slice(0, count).map(opponentById)
}
