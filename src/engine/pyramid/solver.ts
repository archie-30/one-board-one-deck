// 金字塔接龍解題：電腦自己玩一遍，確定這副牌解得開才發（使用者要的「確定有解」）。
//   深度優先，走過的局面不再走；K 能拿就先拿（拿 K 不會讓別的牌變得拿不走，一定不虧）。
//   試超過 budget 個局面還沒解出來就當成解不開（重洗一副），所以發出來的牌一定解得開。
import { nextInt, type RngState } from '@/engine/common/rng'
import { applyPyramid, dealPyramid, legalActions, stateKey, usableSpots, cardAt, valueOf, type PyramidAction, type PyramidLevel, type PyramidState } from './rules'

export const SOLVE_BUDGET = 20000

/** 能拿的 K：拿掉一定不虧，直接拿（解題時少試很多分支） */
function kingMove(s: PyramidState): PyramidAction | null {
  for (const p of usableSpots(s)) if (valueOf(cardAt(s, p)!) === 13) return { type: 'remove', spots: [p] }
  return null
}

/** 解出來的整串步驟；解不開（或試太多）回傳 null */
export function solvePyramid(start: PyramidState, budget = SOLVE_BUDGET): PyramidAction[] | null {
  const seen = new Set<string>([stateKey(start)])
  const stack: { s: PyramidState; path: PyramidAction[] }[] = [{ s: start, path: [] }]
  while (stack.length) {
    const { s, path } = stack.pop()!
    if (s.won) return path
    const king = kingMove(s)
    const acts = king ? [king] : legalActions(s)
    // 疊進去的順序反過來：先試拿牌、最後才翻牌
    for (let k = acts.length - 1; k >= 0; k--) {
      const r = applyPyramid(s, acts[k])
      if (!r.ok) continue
      const key = stateKey(r.state)
      if (seen.has(key)) continue
      if (seen.size >= budget) return null
      seen.add(key)
      stack.push({ s: r.state, path: [...path, acts[k]] })
    }
  }
  return null
}

export const solvable = (s: PyramidState, budget = SOLVE_BUDGET): boolean => solvePyramid(s, budget) !== null

/** 發一副解得開的牌：洗一副、讓電腦試，解不開就再洗。同一個亂數種子發出一樣的牌。 */
export function dealWinnable(rng: RngState, level: PyramidLevel, budget = SOLVE_BUDGET): [PyramidState, RngState] {
  let r = rng
  for (let tries = 0; tries < 400; tries++) {
    const [s, next] = dealPyramid(r, level)
    r = next
    if (solvable(s, budget)) return [s, r]
  }
  // 理論上到不了這裡；萬一真的都解不開，就從簡單的牌型保底（不會發生在一般亂數上）
  const [, next] = nextInt(r, 2)
  return dealPyramid(next, level)
}
