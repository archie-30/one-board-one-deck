import { describe, expect, it } from 'vitest'
import { quoridorAt, type Level } from '../common/difficulty'
import { PERSONAS } from '../common/personas'
import { seedRng } from '../common/rng'
import { chooseQuoridorAction } from './ai'
import { applyQuoridor, cellAt, createQuoridor, distance, legalWalls, pawnMoves, W, type QuoridorAction, type QuoridorState } from './rules'

const must = (s: QuoridorState, a: QuoridorAction) => {
  const r = applyQuoridor(s, a)
  if (!r.ok) throw new Error(r.reason)
  return r.state
}
const at = (r: number, c: number) => r * W + c
const sorted = (a: number[]) => a.slice().sort((x, y) => x - y)

describe('步步為營規則', () => {
  it('開局：兩顆棋子在上下中間、各 10 道牆，0 號先走', () => {
    const s = createQuoridor()
    expect(s.pawns).toEqual([cellAt(8, 4), cellAt(0, 4)])
    expect(s.wallsLeft).toEqual([10, 10])
    expect(s.turn).toBe(0)
    expect(sorted(pawnMoves(s))).toEqual(sorted([cellAt(7, 4), cellAt(8, 3), cellAt(8, 5)]))
    expect(distance(s, 0)).toBe(8)
  })
  it('牆擋住通路；不能重疊、不能交叉', () => {
    // 橫牆 (7, 4)：擋住第 7、8 列之間的第 4、5 行
    let s = must(createQuoridor(), { type: 'wall', at: at(7, 4), o: 'h' })
    s = { ...s, turn: 0 }
    expect(pawnMoves(s)).not.toContain(cellAt(7, 4))
    expect(applyQuoridor(s, { type: 'wall', at: at(7, 4), o: 'h' })).toMatchObject({ ok: false, reason: 'overlap' })
    expect(applyQuoridor(s, { type: 'wall', at: at(7, 5), o: 'h' })).toMatchObject({ ok: false, reason: 'overlap' }) // 蓋到一半
    expect(applyQuoridor(s, { type: 'wall', at: at(7, 4), o: 'v' })).toMatchObject({ ok: false, reason: 'overlap' }) // 十字交叉
    expect(applyQuoridor(s, { type: 'wall', at: at(7, 6), o: 'h' }).ok).toBe(true) // 接在旁邊可以
  })
  it('不能把人完全堵死', () => {
    // 把第 0、1 列之間整排擋起來只能擋 8 格，最右邊那格一定要留：擋到最後一道就不行
    let s = createQuoridor()
    s = { ...s, wallsLeft: [10, 10] }
    for (const c of [0, 2, 4, 6]) s = { ...must(s, { type: 'wall', at: at(0, c), o: 'h' }), turn: 0 }
    // 現在第 8 行（最右邊）還開著；用直牆把它封死就會堵住
    expect(applyQuoridor(s, { type: 'wall', at: at(0, 7), o: 'v' })).toMatchObject({ ok: false, reason: 'blocks' })
  })
  it('面對面可以跳過去；後面有牆就斜跳', () => {
    const base = { ...createQuoridor(), pawns: [cellAt(5, 4), cellAt(4, 4)] as [number, number] }
    expect(pawnMoves(base)).toContain(cellAt(3, 4)) // 直跳
    expect(pawnMoves(base)).not.toContain(cellAt(4, 3))
    // 對方後面有橫牆 (3, 4)：擋住第 3、4 列之間 → 斜跳到對方的左右
    const walled = must({ ...base, turn: 1 }, { type: 'wall', at: at(3, 4), o: 'h' })
    const t = { ...walled, turn: 0 as const }
    expect(pawnMoves(t)).not.toContain(cellAt(3, 4))
    expect(pawnMoves(t)).toContain(cellAt(4, 3))
    expect(pawnMoves(t)).toContain(cellAt(4, 5))
    // 對方在邊界上：也是斜跳
    const edge = { ...createQuoridor(), pawns: [cellAt(1, 4), cellAt(0, 4)] as [number, number] }
    expect(sorted(pawnMoves(edge))).toEqual(sorted([cellAt(0, 3), cellAt(0, 5), cellAt(1, 3), cellAt(1, 5), cellAt(2, 4)]))
  })
  it('走到對面那一列就贏；牆用完就不能放；時間到換對方', () => {
    const s = { ...createQuoridor(), pawns: [cellAt(1, 0), cellAt(8, 8)] as [number, number] }
    expect(must(s, { type: 'move', to: cellAt(0, 0) })).toMatchObject({ status: 'goal', winner: 0 })
    const none = { ...createQuoridor(), wallsLeft: [0, 10] as [number, number] }
    expect(applyQuoridor(none, { type: 'wall', at: 0, o: 'h' })).toMatchObject({ ok: false, reason: 'noWalls' })
    expect(legalWalls(none)).toEqual([])
    expect(must(createQuoridor(), { type: 'timeout' }).turn).toBe(1)
  })
})

describe('步步為營電腦', () => {
  const play = (levels: [Level, Level], seed: number) => {
    let s = createQuoridor()
    let rng = seedRng(seed)
    while (s.status === 'playing') {
      const [a, r] = chooseQuoridorAction(s, quoridorAt(PERSONAS[(seed + s.turn * 7) % 30].chess, levels[s.turn]), rng)
      rng = r
      s = must(s, a ?? { type: 'timeout' })
    }
    return s
  }
  it('四個難度都下得完、不出錯', () => {
    for (const lv of ['low', 'mid', 'high', 'master'] as const) {
      const s = play([lv, lv], 3)
      expect(s.status).not.toBe('playing')
    }
  }, 120000)
  it('難度一級比一級強', () => {
    const duel = (a: Level, b: Level, games: number) => {
      let w = 0
      for (let g = 0; g < games; g++) {
        const first = g % 2 === 0
        const s = play(first ? [a, b] : [b, a], 50 + g)
        if (s.winner === (first ? 0 : 1)) w++
      }
      return w
    }
    expect(duel('mid', 'low', 12)).toBeGreaterThanOrEqual(8)
    expect(duel('high', 'mid', 12)).toBeGreaterThanOrEqual(7)
  }, 300000)
})
