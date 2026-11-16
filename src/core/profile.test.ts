import { beforeEach, describe, expect, it } from 'vitest'
import { gainXp, hasTitle, levelOf, profile, resetProfile, unlockQueue } from './profile'
import { XP_GAME_CAP, XP_PER_LEVEL } from '@/data/profile'

describe('個人資料：經驗值與稱號', () => {
  beforeEach(() => resetProfile())

  it('一開始有 3 個免費稱號、Lv 1', () => {
    expect(profile.titles).toEqual(['rookie', 'chill', 'snack'])
    expect(levelOf(profile.xp)).toBe(1)
  })

  it('每 300 經驗升一級，100 級之後照樣升', () => {
    expect(levelOf(XP_PER_LEVEL - 1)).toBe(1)
    expect(levelOf(XP_PER_LEVEL)).toBe(2)
    expect(levelOf(XP_PER_LEVEL * 99)).toBe(100)
    expect(levelOf(XP_PER_LEVEL * 150)).toBe(151)
  })

  it('贏 > 和 > 輸；輸得越接近拿越多；一局不超過上限', () => {
    const w = gainXp('gomoku', 'mid', 'w', 0.5)
    const d = gainXp('gomoku', 'mid', 'd', 0.5)
    const lClose = gainXp('gomoku', 'mid', 'l', 1)
    const lFar = gainXp('gomoku', 'mid', 'l', 0)
    expect(w).toBeGreaterThan(d)
    expect(d).toBeGreaterThan(lFar)
    expect(lClose).toBeGreaterThan(lFar)
    expect(gainXp('gomoku', 'master', 'w', 1)).toBeLessThanOrEqual(XP_GAME_CAP)
    expect(gainXp('gomoku', 'mid', 'w', Number.NaN)).toBeGreaterThan(0)
  })

  it('電腦越強拿越多', () => {
    expect(gainXp('chess', 'master', 'w', 0.3)).toBeGreaterThan(gainXp('chess', 'low', 'w', 0.3))
  })

  it('贏第一場解鎖稱號並排進解鎖彈窗；最難難度贏一場解鎖第三個', () => {
    unlockQueue.splice(0)
    gainXp('sevens', 'easy', 'w')
    expect(hasTitle('sevens1')).toBe(true)
    expect(hasTitle('sevensTop')).toBe(false)
    expect(unlockQueue.at(-1)!.items).toContainEqual({ kind: 'title', id: 'sevens1' })
    gainXp('sevens', 'hard', 'w')
    expect(hasTitle('sevensTop')).toBe(true)
  })

  it('升級時頭像零件跟著解鎖', () => {
    unlockQueue.splice(0)
    profile.xp = XP_PER_LEVEL * 2 - 1 // Lv 2，再一點就 Lv 3（網點）
    gainXp('go', 'low', 'l', 0)
    const items = unlockQueue.flatMap((u) => u.items)
    expect(items).toContainEqual({ kind: 'level', level: 3 })
    expect(items).toContainEqual({ kind: 'avatar', part: 'fill', value: 'dots' })
  })

  it('格式化：經驗、稱號歸零，名字留著', () => {
    profile.name = '小明'
    gainXp('go', 'low', 'w')
    resetProfile()
    expect(profile.xp).toBe(0)
    expect(profile.name).toBe('小明')
    expect(profile.titles.length).toBe(3)
  })
})
