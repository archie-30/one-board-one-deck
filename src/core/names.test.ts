import { describe, expect, it } from 'vitest'
import { NAME_POOL } from '@/data/namePool'
import { cleanName, isBlocked, nameWidth, opponentNames, resetOpponentNames, setOpponentName } from './names'

describe('幫電腦取名字', () => {
  it('名字庫有 50 個、不重複', () => {
    expect(NAME_POOL).toHaveLength(50)
    expect(new Set(NAME_POOL).size).toBe(50)
  })
  it('整理輸入：去空白、表情符號，超過長度截斷', () => {
    expect(cleanName('  小  明  ')).toBe('小 明')
    expect(cleanName('阿明😀')).toBe('阿明')
    expect(nameWidth(cleanName('一二三四五六七八'))).toBeLessThanOrEqual(12)
    expect(cleanName('一二三四五六七八')).toBe('一二三四五六')
    expect(cleanName('abcdefghijklmnop')).toBe('abcdefghijkl')
  })
  it('不雅字眼：用空白或符號拆開也抓得到', () => {
    expect(isBlocked('F u.c-k')).toBe(true)
    expect(isBlocked('靠 北')).toBe(true)
    expect(isBlocked('阿明')).toBe(false)
  })
  it('留空、有不雅字眼就自動取名；不能跟別人重複', () => {
    expect(setOpponentName(0, '')).toBe('ok')
    expect(opponentNames.names[0]).not.toBe('')
    expect(setOpponentName(1, '幹嘛')).toBe('ok')
    expect(opponentNames.names[1]).not.toContain('幹')
    expect(setOpponentName(2, opponentNames.names[3])).toBe('duplicate')
    expect(setOpponentName(2, '新名字')).toBe('ok')
    expect(opponentNames.names[2]).toBe('新名字')
    expect(new Set(opponentNames.names).size).toBe(20)
  })
  it('恢復預設：回到固定的 20 個預設名字', () => {
    setOpponentName(5, '新名字二')
    resetOpponentNames()
    expect(opponentNames.names).toEqual(NAME_POOL.slice(0, 20))
  })
  it('留空：用那一位的預設名字；被別人用掉了才從名字庫抽', () => {
    resetOpponentNames()
    setOpponentName(0, '小花號')
    expect(setOpponentName(0, '')).toBe('ok')
    expect(opponentNames.names[0]).toBe('阿明')
    setOpponentName(1, '老王')
    expect(opponentNames.names[1]).toBe('小美')
    setOpponentName(2, '')
    expect(opponentNames.names[2]).toBe('老王')
  })
})
