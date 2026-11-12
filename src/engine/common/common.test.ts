import { describe, expect, it } from 'vitest'
import { nextRandom, seedRng, shuffle } from './rng'
import { randomRps, resolveRps } from './rps'

describe('rng', () => {
  it('同一個 seed 得到同一串數字', () => {
    const a = nextRandom(seedRng(42))
    const b = nextRandom(seedRng(42))
    expect(a).toEqual(b)
    expect(a[0]).toBeGreaterThanOrEqual(0)
    expect(a[0]).toBeLessThan(1)
  })
  it('洗牌不改動原陣列，且保留所有元素', () => {
    const src = [1, 2, 3, 4, 5, 6, 7, 8]
    const [out] = shuffle(src, seedRng(7))
    expect(src).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(out.slice().sort()).toEqual(src)
    expect(shuffle(src, seedRng(7))[0]).toEqual(out)
  })
})

describe('猜拳', () => {
  it('勝負判定', () => {
    expect(resolveRps('rock', 'scissors')).toBe(1)
    expect(resolveRps('scissors', 'paper')).toBe(1)
    expect(resolveRps('paper', 'rock')).toBe(1)
    expect(resolveRps('rock', 'paper')).toBe(-1)
    expect(resolveRps('rock', 'rock')).toBe(0)
  })
  it('電腦出拳可重現', () => {
    expect(randomRps(seedRng(3))).toEqual(randomRps(seedRng(3)))
  })
})
