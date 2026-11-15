import { describe, expect, it } from 'vitest'
import { asLevel, bigtwoAt, chessAt, goAt, gomokuAt, LEVELS } from './difficulty'
import { PERSONAS } from './personas'

describe('難度', () => {
  it('不認得的值一律當成「中」', () => {
    expect(asLevel('high')).toBe('high')
    expect(asLevel('easy')).toBe('mid')
    expect(asLevel(undefined)).toBe('mid')
  })
  it('越難越強：算的步數不減少、失誤與亂挑不增加', () => {
    for (const p of PERSONAS) {
      const c = LEVELS.map((l) => chessAt(p.chess, l))
      const g = LEVELS.map((l) => gomokuAt(p.gomoku, l))
      const o = LEVELS.map((l) => goAt(p.go, l))
      const b = LEVELS.map((l) => bigtwoAt(p.bigtwo, l))
      for (let i = 1; i < LEVELS.length; i++) {
        expect(c[i].depth).toBeGreaterThanOrEqual(c[i - 1].depth)
        expect(c[i].blunder).toBeLessThanOrEqual(c[i - 1].blunder)
        expect(g[i].blind).toBeLessThanOrEqual(g[i - 1].blind)
        expect(o[i].skill).toBeGreaterThanOrEqual(o[i - 1].skill)
        expect(b[i].skill).toBeGreaterThanOrEqual(b[i - 1].skill)
        expect(b[i].blunder).toBeLessThanOrEqual(b[i - 1].blunder)
      }
    }
  })
  it('挑戰完全不失誤；個性（愛進攻的程度）照舊保留', () => {
    const p = PERSONAS[0]
    expect(chessAt(p.chess, 'master')).toMatchObject({ noise: 0, blunder: 0, attack: p.chess.attack })
    expect(gomokuAt(p.gomoku, 'master').blind).toBe(0)
    expect(bigtwoAt(p.bigtwo, 'master')).toMatchObject({ blunder: 0, lead: p.bigtwo.lead })
  })
})
