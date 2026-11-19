import { describe, expect, it } from 'vitest'
import { parseCard as P } from '@/engine/bigtwo/cards'
import { seedRng } from '@/engine/common/rng'
import { applyFreeCell, autoTarget, cardsAt, dealFreeCell, finishPlan, isStuck, maxMove, undoTo, type FreeCellAction, type FreeCellState, type Target } from './rules'

function table(cols: Record<number, string[]>, cells: (string | null)[] = [null, null, null, null]): FreeCellState {
  return { cells: cells.map((c) => (c ? P(c) : null)), foundations: [[], [], [], []], tableau: Array.from({ length: 8 }, (_, i) => (cols[i] ?? []).map(P)), moves: 0, won: false }
}
function ok(s: FreeCellState, a: FreeCellAction): FreeCellState {
  const r = applyFreeCell(s, a)
  if (!r.ok) throw new Error(r.reason)
  return r.state
}
const mv = (col: number, index: number, to: Target): FreeCellAction => ({ type: 'move', from: { pile: 'tableau', col, index }, to })
const T = (col: number): Target => ({ pile: 'tableau', col })
/** 某花色從 A 收到第 n 張 */
const upTo = (n: number, suit: number) => [11, 12, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].slice(0, n).map((r) => r * 4 + suit)
const fill = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [7 - i, ['CK']]))

describe('新接龍：發牌', () => {
  it('8 疊：前 4 疊 7 張、後 4 疊 6 張，52 張不重複', () => {
    const [s] = dealFreeCell(seedRng(4))
    expect(s.tableau.map((c) => c.length)).toEqual([7, 7, 7, 7, 6, 6, 6, 6])
    expect(s.tableau.flat().sort((a, b) => a - b)).toEqual(Array.from({ length: 52 }, (_, i) => i))
  })
})

describe('新接龍：移動', () => {
  it('紅黑交錯、點數少 1；同色不行', () => {
    expect(ok(table({ 0: ['S9'], 1: ['H8'] }), mv(1, 0, T(0))).tableau[0].length).toBe(2)
    expect(applyFreeCell(table({ 0: ['S9'], 1: ['C8'] }), mv(1, 0, T(0))).ok).toBe(false)
  })
  it('暫存格放一張，滿了不能放；暫存格的牌可以拿出來', () => {
    const s = ok(table({ 0: ['S9'], 1: ['H8'] }), mv(0, 0, { pile: 'cell', slot: 2 }))
    expect(s.cells[2]).toBe(P('S9'))
    expect(applyFreeCell(s, mv(1, 0, { pile: 'cell', slot: 2 })).ok).toBe(false)
    const b = ok(s, { type: 'move', from: { pile: 'cell', slot: 2 }, to: T(5) })
    expect(b.cells[2]).toBe(null)
  })
  it('收牌區每格固定花色，從 A 開始', () => {
    const s = table({ 0: ['C2', 'CA'] })
    expect(applyFreeCell(s, mv(0, 1, { pile: 'foundation', slot: 1 })).ok).toBe(false)
    const a = ok(s, mv(0, 1, { pile: 'foundation', slot: 0 }))
    expect(ok(a, mv(0, 0, { pile: 'foundation', slot: 0 })).foundations[0].length).toBe(2)
  })
  it('一次搬一串：最多 (空暫存格+1)×2^(空的疊數) 張', () => {
    // 4 個空暫存格、2 疊空的（0、1 在用，2～3 空，其餘填滿）
    const s = table({ 0: ['SK', 'HQ', 'SJ', 'H10', 'S9', 'H8', 'S7', 'H6', 'S5', 'H4', 'S3', 'H2'], 1: ['DK'], ...fill(4) })
    expect(maxMove(s, false)).toBe(20)
    expect(maxMove(s, true)).toBe(10)
    const full = table({ 0: ['S9', 'H8', 'S7'], 1: ['H10'], ...fill(6) }, ['CA', 'C2', 'C3', null])
    expect(maxMove(full, false)).toBe(2)
    const r = applyFreeCell(full, mv(0, 0, T(1)))
    expect(r.ok ? '' : r.reason).toBe('tooMany')
    expect(applyFreeCell(full, mv(0, 1, T(1))).ok).toBe(false)
  })
  it('拿起來的要是一串', () => {
    expect(cardsAt(table({ 0: ['S9', 'H7'] }), { pile: 'tableau', col: 0, index: 0 })).toEqual([])
  })
  it('全部收完過關', () => {
    const s = table({})
    s.foundations = [0, 1, 2, 3].map((suit) => upTo(13, suit))
    const last = s.foundations[3].pop()!
    s.tableau[0] = [last]
    expect(ok(s, mv(0, 0, { pile: 'foundation', slot: 3 })).won).toBe(true)
  })
})

describe('新接龍：返回、點兩下、自動收牌、卡關', () => {
  it('返回算一步', () => {
    const a = table({ 0: ['S9'], 1: ['H8'] })
    const b = ok(a, mv(1, 0, T(0)))
    const u = undoTo(a, b)
    expect(u.tableau[1].length).toBe(1)
    expect(u.moves).toBe(2)
  })
  it('點兩下：能收就收，再接到別疊，最後才放暫存格', () => {
    expect(autoTarget(table({ 0: ['CA'] }), { pile: 'tableau', col: 0, index: 0 })).toEqual({ pile: 'foundation', slot: 0 })
    expect(autoTarget(table({ 0: ['H8'], 1: ['S9'], ...fill(6) }), { pile: 'tableau', col: 0, index: 0 })).toEqual(T(1))
    expect(autoTarget(table({ 0: ['H8'], 1: ['S2'], ...fill(6) }), { pile: 'tableau', col: 0, index: 0 })).toEqual({ pile: 'cell', slot: 0 })
  })
  it('每疊都由大到小排好才能自動收牌', () => {
    const s = table({})
    s.foundations = [0, 1, 2, 3].map((suit) => upTo(11, suit))
    s.tableau[0] = [P('SK'), P('SQ')]
    s.tableau[1] = [P('HK'), P('CQ')]
    s.tableau[2] = [P('DK'), P('HQ')]
    s.cells[0] = P('DQ')
    s.tableau[3] = [P('CK')]
    expect(finishPlan(s)?.length).toBe(8)
    s.tableau[3] = [P('CK')]
    s.tableau[0] = [P('SQ'), P('SK')]
    expect(finishPlan(s)).toBe(null)
  })
  it('暫存格滿、沒空疊、也沒地方接才算卡關', () => {
    const cols = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [i, ['C5']]))
    expect(isStuck(table(cols, ['D5', 'H5', 'S5', 'C6']))).toBe(true)
    expect(isStuck(table(cols, ['D5', 'H5', 'S5', null]))).toBe(false)
    expect(isStuck(table({ ...cols, 7: ['H6'] }, ['D5', 'H5', 'S5', 'C6']))).toBe(false)
  })
})
