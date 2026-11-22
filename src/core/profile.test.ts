import { beforeEach, describe, expect, it } from 'vitest'
import { gainXp, hasTitle, levelOf, profile, resetProfile, saveProfile, unlockQueue } from './profile'
import { XP_GAME_CAP, XP_PER_LEVEL } from '@/data/profile'

describe('個人資料：經驗值與稱號', () => {
  beforeEach(() => resetProfile())

  it('一開始有 3 個免費稱號、Lv 1', () => {
    expect(profile.titles).toEqual(['rookie', 'passby', 'messy'])
    expect(profile.equipped).toEqual(['rookie'])
    expect(levelOf(profile.xp)).toBe(1)
  })

  it('每 200 經驗升一級，100 級之後照樣升', () => {
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

  it('贏 5 場才解鎖第一個稱號並排進解鎖彈窗；最難難度要贏 3 場', () => {
    unlockQueue.splice(0)
    for (let i = 0; i < 4; i++) gainXp('sevens', 'easy', 'w')
    expect(hasTitle('sevensA')).toBe(false)
    gainXp('sevens', 'easy', 'w')
    expect(hasTitle('sevensA')).toBe(true)
    expect(unlockQueue.at(-1)!.items).toContainEqual({ kind: 'title', id: 'sevensA' })
    gainXp('sevens', 'high', 'w')
    gainXp('sevens', 'high', 'w')
    expect(hasTitle('sevensTop')).toBe(false)
    gainXp('sevens', 'high', 'w')
    expect(hasTitle('sevensTop')).toBe(true)
  })

  it('新玩法：玩滿 100 場（輸贏都算）拿「玩滿」稱號；八種新玩法都贏過拿「八面玲瓏」', () => {
    for (let i = 0; i < 99; i++) gainXp('dots', 'mid', 'l', 0)
    expect(hasTitle('dotsP')).toBe(false)
    gainXp('dots', 'mid', 'l', 0)
    expect(hasTitle('dotsP')).toBe(true)
    const news = ['ninetynine', 'spider', 'freecell', 'banqi', 'checkers', 'starcheckers', 'quoridor']
    for (const id of news) gainXp(id, 'mid', 'w')
    expect(hasTitle('allNew')).toBe(false)
    gainXp('dots', 'mid', 'w')
    expect(hasTitle('allNew')).toBe(true)
  })

  it('儲存：最多裝 2 個稱號，沒解鎖的、沒解鎖的頭像零件都不採用', () => {
    saveProfile({ name: '  小明  ', equipped: ['rookie', 'passby', 'messy'], look: { shape: 'drop', tone: 'red', fill: 'dots', acc: 'crown' } })
    expect(profile.name).toBe('小明')
    expect(profile.equipped).toEqual(['rookie', 'passby'])
    expect(profile.look).toEqual({ shape: 'circle', tone: 'red', fill: 'solid', acc: 'none' })
    saveProfile({ name: '', equipped: ['lv100'], look: profile.look })
    expect(profile.equipped).toEqual([])
  })

  it('升級時頭像零件跟著解鎖', () => {
    unlockQueue.splice(0)
    profile.xp = XP_PER_LEVEL * 2 - 1 // Lv 2，再一點就 Lv 3（鈷藍）
    gainXp('go', 'low', 'l', 0)
    const items = unlockQueue.flatMap((u) => u.items)
    expect(items).toContainEqual({ kind: 'level', level: 3 })
    expect(items).toContainEqual({ kind: 'avatar', part: 'tone', value: 'blue' })
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
