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
  it('留空用預設名字、有不雅字眼換成名字庫的名字；名字可以重複', () => {
    setOpponentName(0, '')
    expect(opponentNames.names[0]).toBe('阿明')
    setOpponentName(1, '幹嘛')
    expect(opponentNames.names[1]).not.toContain('幹')
    expect(NAME_POOL).toContain(opponentNames.names[1])
    setOpponentName(2, opponentNames.names[3])
    expect(opponentNames.names[2]).toBe(opponentNames.names[3])
  })
  it('恢復預設：回到固定的 30 個預設名字（名字庫的前 30 個）', () => {
    setOpponentName(5, '新名字二')
    resetOpponentNames()
    expect(opponentNames.names).toEqual(NAME_POOL.slice(0, 30))
  })
})
