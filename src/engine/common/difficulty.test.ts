import { describe, expect, it } from 'vitest'
import { asBigTwoDifficulty, asLevel, bigtwoAt, bigtwoLevel, chessAt, goAt, gomokuAt, HABITS, habitOf, LEVELS } from './difficulty'
import { PERSONAS } from './personas'

describe('難度', () => {
  it('不認得的值一律當成「中」', () => {
    expect(asLevel('high')).toBe('high')
    expect(asLevel('easy')).toBe('mid')
    expect(asLevel(undefined)).toBe('mid')
  })
  it('越難越強：算的步數不減少、失誤與亂挑不增加', () => {
    PERSONAS.forEach((p, who) => {
      const c = LEVELS.map((l) => chessAt(p.chess, l, who))
      const g = LEVELS.map((l) => gomokuAt(p.gomoku, l, who))
      const o = LEVELS.map((l) => goAt(p.go, l, who))
      const b = LEVELS.map((l) => bigtwoAt(p.bigtwo, l, who))
      for (let i = 1; i < LEVELS.length; i++) {
        expect(c[i].depth).toBeGreaterThanOrEqual(c[i - 1].depth)
        expect(c[i].blunder).toBeLessThanOrEqual(c[i - 1].blunder)
        expect(g[i].blind).toBeLessThanOrEqual(g[i - 1].blind)
        expect(o[i].skill).toBeGreaterThanOrEqual(o[i - 1].skill)
        expect(b[i].skill).toBeGreaterThanOrEqual(b[i - 1].skill)
        expect(b[i].blunder).toBeLessThanOrEqual(b[i - 1].blunder)
        expect(c[i].quiet ?? 3).toBeGreaterThanOrEqual(c[i - 1].quiet ?? 3)
        expect(g[i].look ?? 0).toBeGreaterThanOrEqual(g[i - 1].look ?? 0)
      }
    })
  })
  it('大老二只有簡單／困難；舊的低中算簡單、高挑戰算困難', () => {
    expect(['low', 'mid', 'easy', undefined, 'x'].map(asBigTwoDifficulty)).toEqual(['easy', 'easy', 'easy', 'easy', 'easy'])
    expect(['high', 'master', 'hard'].map(asBigTwoDifficulty)).toEqual(['hard', 'hard', 'hard'])
    expect(bigtwoAt(PERSONAS[0].bigtwo, bigtwoLevel('hard')).skill).toBeGreaterThan(bigtwoAt(PERSONAS[0].bigtwo, bigtwoLevel('easy')).skill)
  })
  it('圍棋整體比其他棋類弱一點：同一難度圍棋的「會不會算」比大老二低', () => {
    for (const l of LEVELS) expect(goAt(PERSONAS[0].go, l).skill).toBeLessThan(bigtwoAt(PERSONAS[0].bigtwo, l).skill)
  })
  it('每位對手在每個難度都有自己的小習慣，只改個性、不改強弱', () => {
    expect(HABITS).toHaveLength(PERSONAS.length)
    expect(habitOf(99, 'mid')).toBeNull()
    PERSONAS.forEach((p, who) => {
      for (const l of LEVELS) {
        const plain = chessAt(p.chess, l)
        const own = chessAt(p.chess, l, who)
        expect([own.depth, own.noise, own.blunder]).toEqual([plain.depth, plain.noise, plain.blunder])
        expect(bigtwoAt(p.bigtwo, l, who).skill).toBe(bigtwoAt(p.bigtwo, l).skill)
        expect(gomokuAt(p.gomoku, l, who).blind).toBe(gomokuAt(p.gomoku, l).blind)
      }
    })
    // 同一個人換個難度，習慣不一定一樣
    expect(new Set(HABITS[0]).size).toBeGreaterThan(1)
  })
  it('挑戰完全不失誤；個性（沒有小習慣時，愛進攻的程度）照舊保留', () => {
    const p = PERSONAS[0]
    expect(chessAt(p.chess, 'master')).toMatchObject({ noise: 0, blunder: 0, attack: p.chess.attack })
    expect(gomokuAt(p.gomoku, 'master').blind).toBe(0)
    expect(bigtwoAt(p.bigtwo, 'master')).toMatchObject({ blunder: 0, lead: p.bigtwo.lead })
  })
})
