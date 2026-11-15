import { describe, expect, it } from 'vitest'
import { OPPONENTS } from '@/data/names'
import { pickOpponents } from './opponents'

describe('挑對手', () => {
  it('不重複；困難模式不會挑到新手打法的人', () => {
    const beginners = OPPONENTS.map((o, i) => (o.beginner ? i : -1)).filter((i) => i >= 0)
    expect(beginners.length).toBeGreaterThan(0)
    for (let seed = 1; seed <= 200; seed++) {
      const ids = pickOpponents(3, seed, true).map((o) => o.id)
      expect(new Set(ids).size).toBe(3)
      for (const b of beginners) expect(ids).not.toContain(b)
    }
  })
})
