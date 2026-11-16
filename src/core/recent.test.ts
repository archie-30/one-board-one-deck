import { describe, expect, it } from 'vitest'
import { recentAt, recordResult, RECENT_MAX } from './settings'

describe('近百場戰況', () => {
  it('每個玩法、每個難度各自記，只留最近 100 場', () => {
    recordResult('gomoku', 'high', 'w')
    recordResult('gomoku', 'high', 'l')
    recordResult('gomoku', 'high', 'd')
    recordResult('gomoku', 'low', 'w')
    expect(recentAt('gomoku', 'high')).toEqual({ n: 3, w: 1, l: 1, d: 1 })
    expect(recentAt('gomoku', 'low')).toEqual({ n: 1, w: 1, l: 0, d: 0 })
    expect(recentAt('go', 'high').n).toBe(0)
    for (let i = 0; i < 150; i++) recordResult('chess', 'mid', i < 60 ? 'w' : 'l')
    expect(recentAt('chess', 'mid')).toEqual({ n: RECENT_MAX, w: 10, l: 90, d: 0 })
  })
})
