import { describe, expect, it, vi } from 'vitest'

// 測試環境沒有瀏覽器的 localStorage：用一個簡單的代替品
const store = new Map<string, string>()
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size
  },
}

describe('牌類難度搬家：簡單 → 中、困難 → 高', () => {
  it('最高分、近百場戰況、選過的難度都搬過去，只搬一次', async () => {
    localStorage.clear()
    localStorage.setItem(
      'obod.stats.v1',
      JSON.stringify({
        bigtwo: { rounds: 3, wins: 1, totals: [0, 0, 0, 0], best: 30, bestBy: { easy: 12, hard: 30 } },
        crazybigtwo: { rounds: 1, wins: 0, totals: [0, 0, 0, 0], best: 8, bestBy: { easy: 8 } },
        recent: { 'bigtwo:easy': 'wl', 'sevens:hard': 'w', 'gomoku:mid': 'd' },
      }),
    )
    localStorage.setItem('obod.settings.v1', JSON.stringify({ games: { sevens: { difficulty: 'normal', options: { difficulty: 'hard' } }, bigtwo: { difficulty: 'normal', options: { difficulty: 'easy' } } } }))
    vi.resetModules()
    const m = await import('./settings')
    expect(m.stats.bigtwo.bestBy).toEqual({ mid: 12, high: 30 })
    expect(m.stats.crazybigtwo.bestBy).toEqual({ mid: 8 })
    expect(m.stats.recent).toEqual({ 'bigtwo:mid': 'wl', 'sevens:high': 'w', 'gomoku:mid': 'd' })
    expect(m.settings.games.sevens.options.difficulty).toBe('high')
    expect(m.settings.games.bigtwo.options.difficulty).toBe('mid')
    expect(m.stats.cardLevels).toBe(4)
    // 已經搬過：新的「中、高」不會再被當成舊資料搬走
    m.recordBest('bigtwo', 'low', 5)
    await new Promise((r) => setTimeout(r, 0))
    vi.resetModules()
    const again = await import('./settings')
    expect(again.stats.bigtwo.bestBy).toEqual({ mid: 12, high: 30, low: 5 })
  })
})
