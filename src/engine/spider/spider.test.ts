import { describe, expect, it } from 'vitest'
import { parseCard as P } from '@/engine/bigtwo/cards'
import { seedRng } from '@/engine/common/rng'
import { applySpider, autoTarget, cardsAt, dealSpider, isStuck, scoreOf, spiderFaces, undoTo, valueAt, type SpiderAction, type SpiderState } from './rules'

/** 空桌面：cols 用牌面文字擺，每張牌給一個編號 */
function table(cols: Record<number, { down?: string[]; up?: string[] }>, stock: string[] = []): SpiderState {
  const faces: number[] = []
  const id = (t: string) => faces.push(P(t)) - 1
  const tableau = Array.from({ length: 10 }, (_, i) => ({ down: (cols[i]?.down ?? []).map(id), up: (cols[i]?.up ?? []).map(id) }))
  return { suits: 4, faces, stock: stock.map(id), tableau, done: [], score: 500, moves: 0, penalty: 0, won: false }
}
function ok(s: SpiderState, a: SpiderAction): SpiderState {
  const r = applySpider(s, a)
  if (!r.ok) throw new Error(r.reason)
  return r.state
}
const mv = (col: number, index: number, to: number): SpiderAction => ({ type: 'move', from: { col, index }, to: { col: to } })
const KA = ['K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2', 'A']

describe('蜘蛛接龍：發牌', () => {
  it('前 4 疊 6 張、後 6 疊 5 張，最上面翻開；牌堆 50 張；104 張不重複', () => {
    const [s] = dealSpider(seedRng(5), 2)
    s.tableau.forEach((c, i) => {
      expect(c.down.length + c.up.length).toBe(i < 4 ? 6 : 5)
      expect(c.up.length).toBe(1)
    })
    expect(s.stock.length).toBe(50)
    const all = [...s.stock, ...s.tableau.flatMap((c) => [...c.down, ...c.up])].sort((a, b) => a - b)
    expect(all).toEqual(Array.from({ length: 104 }, (_, i) => i))
    expect(s.score).toBe(500)
  })
  it('花色數：1 種全黑桃、2 種黑桃紅心、4 種四花色各 26 張；每種點數 8 張', () => {
    for (const n of [1, 2, 4] as const) {
      const faces = spiderFaces(n)
      const suits = new Set(faces.map((f) => f & 3))
      expect(suits.size).toBe(n)
      for (const su of suits) expect(faces.filter((f) => (f & 3) === su).length).toBe(104 / n)
      for (let v = 0; v < 13; v++) expect(faces.filter((f) => f >> 2 === v).length).toBe(8)
    }
  })
  it('同一個 seed 發出同一副牌', () => {
    expect(dealSpider(seedRng(9), 4)[0]).toEqual(dealSpider(seedRng(9), 4)[0])
  })
})

describe('蜘蛛接龍：移動', () => {
  it('點數少 1 就能接，不看花色；每步 -1 分', () => {
    const s = ok(table({ 0: { up: ['S9'] }, 1: { up: ['H8'] } }), mv(1, 0, 0))
    expect(s.tableau[0].up.length).toBe(2)
    expect(s.score).toBe(499)
    expect(s.moves).toBe(1)
  })
  it('點數不對不能接', () => {
    expect(applySpider(table({ 0: { up: ['S9'] }, 1: { up: ['H7'] } }), mv(1, 0, 0)).ok).toBe(false)
  })
  it('同花色連續的一串可以整串搬；混花色的不能從下面拿', () => {
    const s = table({ 0: { up: ['S9', 'S8', 'S7'] }, 1: { up: ['H10'] }, 2: { up: ['C10', 'H9', 'S8'] }, 3: { up: ['D10'] } })
    expect(cardsAt(s, { col: 0, index: 0 }).length).toBe(3)
    expect(ok(s, mv(0, 0, 1)).tableau[1].up.length).toBe(4)
    expect(cardsAt(s, { col: 2, index: 1 })).toEqual([])
    expect(applySpider(s, mv(2, 1, 3)).ok).toBe(false)
    expect(cardsAt(s, { col: 2, index: 2 }).length).toBe(1)
  })
  it('空的一疊什麼都能放；搬走後蓋著的牌自動翻開', () => {
    const s = ok(table({ 0: { down: ['C2'], up: ['D5'] } }), mv(0, 0, 1))
    expect(s.tableau[1].up.length).toBe(1)
    expect(s.tableau[0].up.length).toBe(1)
    expect(s.tableau[0].down.length).toBe(0)
  })
})

describe('蜘蛛接龍：收走一串、發牌、過關', () => {
  it('同花色 K 到 A 排好就自動收走 +100，露出的牌翻開', () => {
    const s0 = table({ 0: { down: ['H3'], up: KA.slice(0, 12).map((r) => `S${r}`) }, 1: { up: ['SA'] } })
    const s = ok(s0, mv(1, 0, 0))
    expect(s.done.length).toBe(1)
    expect(s.score).toBe(500 - 1 + 100)
    expect(s.tableau[0].up.length).toBe(1)
    expect(valueAt(s, s.tableau[0].up[0])).toBe(3)
  })
  it('不同花色的 K～A 不會收走', () => {
    const up = KA.map((r, i) => (i === 5 ? `H${r}` : `S${r}`))
    const s = ok(table({ 0: { up: up.slice(0, 12) }, 1: { up: [up[12]] } }), mv(1, 0, 0))
    expect(s.done.length).toBe(0)
  })
  it('發牌：每疊發一張；有空的一疊不能發；牌堆空了不能發', () => {
    const full = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i, { up: ['S5'] }]))
    const s = ok(table(full, Array(10).fill('H2')), { type: 'deal' })
    expect(s.tableau.every((c) => c.up.length === 2)).toBe(true)
    expect(s.stock.length).toBe(0)
    expect(s.score).toBe(499)
    const r = applySpider(table({ 0: { up: ['S5'] } }, ['H2']), { type: 'deal' })
    expect(r.ok ? '' : r.reason).toBe('emptyCol')
    const r2 = applySpider(s, { type: 'deal' })
    expect(r2.ok ? '' : r2.reason).toBe('empty')
  })
  it('收滿 8 串過關', () => {
    const s0 = table({ 0: { up: KA.slice(0, 12).map((r) => `S${r}`) }, 1: { up: ['SA'] } })
    s0.done = Array.from({ length: 7 }, () => [])
    expect(ok(s0, mv(1, 0, 0)).won).toBe(true)
  })
})

describe('蜘蛛接龍：返回、點兩下、卡關', () => {
  it('返回：回到上一步，另外扣 5 分，步數照算', () => {
    const a = table({ 0: { up: ['S9'] }, 1: { up: ['H8'] } })
    const b = ok(a, mv(1, 0, 0))
    const u = undoTo(a, b)
    expect(u.tableau[1].up.length).toBe(1)
    expect(scoreOf(u)).toBe(495)
    expect(u.moves).toBe(2)
  })
  it('點兩下：先找同花色接得上的', () => {
    const s = table({ 0: { up: ['H9'] }, 1: { up: ['S9'] }, 2: { up: ['S8'] } })
    expect(autoTarget(s, { col: 2, index: 0 })).toEqual({ col: 1 })
  })
  it('牌堆還有就不算卡關；發完且只能在不同花色間搬就算卡關', () => {
    const full = (extra: Record<number, { up: string[] }>) => ({ ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i, { up: ['CK'] }])), ...extra })
    expect(isStuck(table(full({}), ['S2']))).toBe(false)
    expect(isStuck(table(full({ 0: { up: ['S9'] }, 1: { up: ['H9', 'S8'] } })))).toBe(false)
    expect(isStuck(table(full({ 0: { up: ['S9'] }, 1: { up: ['H9'] }, 2: { up: ['D8'] } })))).toBe(true)
  })
})
