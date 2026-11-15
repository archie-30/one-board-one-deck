import { describe, expect, it } from 'vitest'
import { othelloAt, LEVELS } from '../common/difficulty'
import { PERSONAS } from '../common/personas'
import { seedRng } from '../common/rng'
import { chooseOthelloMove } from './ai'
import { applyOthello, countDiscs, createOthello, flipsFor, legalMoves, toIndex, type Disc, type OthelloState } from './rules'

/** 用文字擺盤面：X 黑、O 白、. 空 */
function setup(rows: string[], turn: 1 | 2 = 1): OthelloState {
  const s = createOthello()
  s.board = rows.join('').split('').map((c): Disc => (c === 'X' ? 1 : c === 'O' ? 2 : 0))
  s.turn = turn
  return s
}
const play = (s: OthelloState, x: number, y: number) => {
  const r = applyOthello(s, { type: 'play', index: toIndex(x, y) })
  if (!r.ok) throw new Error(r.reason)
  return r.state
}

describe('黑白棋：開局與落子', () => {
  it('開局中間四顆、黑先，黑有 4 個地方能下', () => {
    const s = createOthello()
    expect(countDiscs(s.board)).toEqual({ black: 2, white: 2 })
    expect(s.turn).toBe(1)
    expect(legalMoves(s.board, 1).sort((a, b) => a - b)).toEqual([toIndex(3, 2), toIndex(2, 3), toIndex(5, 4), toIndex(4, 5)].sort((a, b) => a - b))
  })
  it('夾到的子翻面，換對方下', () => {
    const s = play(createOthello(), 3, 2)
    expect(s.board[toIndex(3, 3)]).toBe(1)
    expect(s.lastFlipped).toEqual([toIndex(3, 3)])
    expect(countDiscs(s.board)).toEqual({ black: 4, white: 1 })
    expect(s.turn).toBe(2)
  })
  it('夾不到任何子、已經有子的地方不能下', () => {
    const s = createOthello()
    expect(applyOthello(s, { type: 'play', index: toIndex(0, 0) })).toEqual({ ok: false, reason: 'noFlip' })
    expect(applyOthello(s, { type: 'play', index: toIndex(3, 3) })).toEqual({ ok: false, reason: 'occupied' })
  })
  it('一次可以往好幾個方向翻；中間有空格就夾不到', () => {
    const s = setup([
      'X.X.X...',
      '.OOO....',
      'XO.OX...',
      '.OOO....',
      'X.X.X...',
      '........',
      '........',
      '........',
    ])
    expect(flipsFor(s.board, toIndex(2, 2), 1).length).toBe(8)
    const t = setup(['XO.O....', '........', '........', '........', '........', '........', '........', '........'])
    expect(flipsFor(t.board, toIndex(4, 0), 1)).toEqual([])
    const u = setup(['XOO.....', '........', '........', '........', '........', '........', '........', '........'])
    expect(flipsFor(u.board, toIndex(3, 0), 1).sort()).toEqual([toIndex(1, 0), toIndex(2, 0)])
  })
})

describe('黑白棋：輪空與結束', () => {
  it('對方沒地方下就輪空，自己繼續下', () => {
    const s = setup(['XOOOOOOO', '........', '........', '........', '........', '........', '.......X', '.......O'], 2)
    expect(legalMoves(s.board, 1)).toEqual([])
    expect(legalMoves(s.board, 2)).toEqual([toIndex(7, 5)])
    const r = applyOthello(s, { type: 'timeout' })
    expect(r.ok && r.state.turn).toBe(2)
    expect(r.ok && r.state.skipped).toBe(1)
  })
  it('雙方都沒地方下就結束，子多的人贏', () => {
    const s = setup(['XXO.....', '........', '........', '........', '........', '........', '........', '........'], 2)
    // 白下在最右邊夾不到；只剩白能下 → 白下了之後雙方都沒有棋可下
    const r = applyOthello(setup(['XXXO....', '........', '........', '........', '........', '........', '........', '........'], 2), { type: 'play', index: toIndex(0, 0) })
    expect(r.ok).toBe(false)
    const end = applyOthello(setup(['.XXO....', '........', '........', '........', '........', '........', '........', '........'], 2), { type: 'play', index: toIndex(0, 0) })
    expect(end.ok && end.state.over).toBe(true)
    expect(end.ok && end.state.winner).toBe(2)
    expect(s.over).toBe(false)
  })
  it('逾時：這一手跳過，換對方', () => {
    const r = applyOthello(createOthello(), { type: 'timeout' })
    expect(r.ok && r.state.turn).toBe(2)
    expect(r.ok && r.state.lastMove).toBe(-1)
  })
})

describe('黑白棋：AI', () => {
  it('一定下在合法的位置，能搶角就搶角（中以上）', () => {
    const s = setup([
      '.OOOX...',
      '........',
      '........',
      '...OX...',
      '...XO...',
      '........',
      '........',
      '........',
    ])
    const st = othelloAt(PERSONAS[1].othello, 'high', 1)
    const [m] = chooseOthelloMove(s, st, seedRng(1))
    expect(m).toBe(toIndex(0, 0))
  })
  it('自己下一整局都合法，而且會結束', () => {
    let s = createOthello()
    let rng = seedRng(3)
    for (let k = 0; k < 120 && !s.over; k++) {
      const st = othelloAt(PERSONAS[k % 20].othello, LEVELS[k % 4], k % 20)
      let m: number
      ;[m, rng] = chooseOthelloMove(s, st, rng)
      const r = applyOthello(s, m < 0 ? { type: 'timeout' } : { type: 'play', index: m })
      expect(r.ok).toBe(true)
      if (r.ok) s = r.state
    }
    expect(s.over).toBe(true)
  })
  it('難度越高越強：高對低、挑戰對中，多半會贏', () => {
    const duel = (a: 'low' | 'mid' | 'high' | 'master', b: typeof a, n: number) => {
      let winsB = 0
      for (let g = 0; g < n; g++) {
        let s = createOthello()
        let rng = seedRng(50 + g)
        const bBlack = g % 2 === 0
        while (!s.over) {
          const bTurn = (s.turn === 1) === bBlack
          const st = othelloAt(PERSONAS[(g * 3) % 20].othello, bTurn ? b : a, (g * 3) % 20)
          let m: number
          ;[m, rng] = chooseOthelloMove(s, st, rng)
          const r = applyOthello(s, m < 0 ? { type: 'timeout' } : { type: 'play', index: m })
          if (!r.ok) break
          s = r.state
        }
        if ((s.winner === 1) === bBlack && s.winner !== 3) winsB++
      }
      return winsB
    }
    expect(duel('low', 'high', 6)).toBeGreaterThanOrEqual(5)
    expect(duel('mid', 'master', 4)).toBeGreaterThanOrEqual(3)
  }, 60000)
})
