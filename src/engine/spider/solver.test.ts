import { describe, expect, it } from 'vitest'
import { seedRng } from '@/engine/common/rng'
import { SPIDER_DEALS } from '@/data/spiderDeals'
import { applySpider, createSpider, dealFromBank, type SpiderState } from './rules'
import { buildSolvableSpider } from './solver'

const decode = (hex: string): number[] => Array.from({ length: hex.length / 2 }, (_, i) => parseInt(hex.slice(i * 2, i * 2 + 2), 16))

describe('蜘蛛接龍：保證解得開的發牌', () => {
  it('每一副都是 0～103 各一張', () => {
    for (const suits of [2, 4] as const) {
      expect(SPIDER_DEALS[suits].length).toBeGreaterThanOrEqual(100)
      for (const hex of SPIDER_DEALS[suits]) {
        expect(hex.length).toBe(208)
        expect([...decode(hex)].sort((a, b) => a - b)).toEqual(Array.from({ length: 104 }, (_, i) => i))
      }
    }
  })

  it('從牌庫發出來的牌形狀正確（前 4 疊 6 張、後 6 疊 5 張、牌堆 50 張）', () => {
    for (const suits of [2, 4] as const) {
      for (let seed = 1; seed <= 20; seed++) {
        const [s] = dealFromBank(SPIDER_DEALS[suits], seedRng(seed), suits)
        expect(s.tableau.map((c) => c.down.length + c.up.length)).toEqual([6, 6, 6, 6, 5, 5, 5, 5, 5, 5])
        expect(s.stock.length).toBe(50)
      }
    }
  })

  it('造出來的發牌照解法真的走得到過關', () => {
    const built = buildSolvableSpider(12345, 2, 60000, 3)
    expect(built).not.toBeNull()
    let s: SpiderState = createSpider(built!.order, 2)
    for (const a of built!.path) {
      const r = applySpider(s, a)
      expect(r.ok).toBe(true)
      if (r.ok) s = r.state
    }
    expect(s.won).toBe(true)
  })
})
