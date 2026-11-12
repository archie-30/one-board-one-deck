import { describe, expect, it } from 'vitest'
import { chooseBigTwoAction, legalPlays } from '../bigtwo/ai'
import { applyBigTwo, dealBigTwo, type BigTwoState } from '../bigtwo/game'
import { chooseGomokuMove } from '../gomoku/ai'
import { createGomoku, placeStone, toIndex } from '../gomoku/rules'
import { PERSONAS } from './personas'
import { seedRng } from './rng'

/** 用指定的四位打法打完一局，回傳每位玩家「明明能出卻選擇過牌」的次數與結果 */
function playRound(seed: number, seats: number[]) {
  let s: BigTwoState = dealBigTwo(seed)
  let rng = seedRng(seed * 7 + 1)
  const passes = [0, 0, 0, 0]
  let guard = 0
  while (s.winner < 0 && guard++ < 600) {
    let action
    ;[action, rng] = chooseBigTwoAction(s, PERSONAS[seats[s.turn]].bigtwo, rng)
    if (action.type === 'pass' && legalPlays(s).length) passes[s.turn]++
    const r = applyBigTwo(s, action)
    if (!r.ok) throw new Error(`persona ${seats[s.turn]} seed ${seed}: ${r.reason}`)
    s = r.state
  }
  return { winner: s.winner, passes }
}

describe('對手個性', () => {
  it('一共 20 位，每位的大老二與五子棋打法都不完全一樣', () => {
    expect(PERSONAS).toHaveLength(20)
    const keys = new Set(PERSONAS.map((p) => JSON.stringify(p)))
    expect(keys.size).toBe(20)
  })

  it('每一位都能把大老二正常打完（不會出不合法的牌）', () => {
    for (let p = 0; p < 20; p++) {
      for (let seed = 1; seed <= 4; seed++) {
        const r = playRound(seed * 31 + p, [p, (p + 5) % 20, (p + 11) % 20, (p + 17) % 20])
        expect(r.winner).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('佛系的小花比衝動的老王更常過牌', () => {
    let calm = 0
    let rash = 0
    for (let seed = 1; seed <= 30; seed++) {
      const r = playRound(seed, [4, 2, 4, 2])
      calm += r.passes[0] + r.passes[2]
      rash += r.passes[1] + r.passes[3]
    }
    expect(calm).toBeGreaterThan(rash * 1.3)
  })

  it('大師級的淑芬對上新手阿寶，贏的局數明顯比較多', () => {
    let master = 0
    let novice = 0
    for (let seed = 1; seed <= 60; seed++) {
      const r = playRound(seed, [15, 16, 15, 16])
      if (r.winner % 2 === 0) master++
      else novice++
    }
    expect(master).toBeGreaterThan(novice * 1.4)
  })

  it('五子棋：攻擊型和防守型在同一盤面會下不同的地方', () => {
    // 黑白各有一個活二：攻擊型會延伸自己的，防守型會先擋對方的
    const s = createGomoku()
    for (const [x, y] of [[3, 3], [4, 3]]) s.board[toIndex(x, y)] = 1
    for (const [x, y] of [[7, 9], [8, 9]]) s.board[toIndex(x, y)] = 2
    s.turn = 1
    s.moves = [0, 1, 2, 3]
    const attacker = chooseGomokuMove(s, { ...PERSONAS[2].gomoku, noise: 0, blind: 0 }, seedRng(1))[0]
    const defender = chooseGomokuMove(s, { ...PERSONAS[6].gomoku, noise: 0, blind: 0 }, seedRng(1))[0]
    expect([toIndex(6, 9), toIndex(9, 9)]).toContain(defender)
    expect([toIndex(2, 3), toIndex(5, 3)]).toContain(attacker)
  })

  it('五子棋：每一位都能下完一局', () => {
    for (let p = 0; p < 20; p++) {
      let state = createGomoku()
      let rng = seedRng(p + 1)
      let guard = 0
      while (state.winner === 0 && guard++ < 230) {
        let m: number
        ;[m, rng] = chooseGomokuMove(state, PERSONAS[state.turn === 1 ? p : (p + 9) % 20].gomoku, rng)
        const r = placeStone(state, m)
        expect(r.ok).toBe(true)
        if (r.ok) state = r.state
      }
      expect(state.winner).not.toBe(0)
    }
  })
})
