import { describe, expect, it } from 'vitest'
import { checkersAt } from '../common/difficulty'
import { PERSONAS } from '../common/personas'
import { seedRng } from '../common/rng'
import { chooseCheckersMove } from './ai'
import { applyCheckers, createCheckers, fromRows, legalMoves, type CheckersState } from './rules'

const sq = (r: number, c: number) => r * 8 + c
const move = (s: CheckersState, ...path: number[]) => {
  const r = applyCheckers(s, { type: 'move', path })
  if (!r.ok) throw new Error(r.reason)
  return r.state
}

describe('西洋跳棋規則', () => {
  it('開局：雙方各 12 顆在深色格；先手 7 種走法', () => {
    const s = createCheckers()
    expect(s.board.filter((c) => c === 1)).toHaveLength(12)
    expect(s.board.filter((c) => c === 3)).toHaveLength(12)
    expect(legalMoves(s)).toHaveLength(7)
  })

  it('一般子只能往前斜走，不能往後', () => {
    const s = fromRows(['........', '........', '........', '........', '...x....', '........', '........', '........'])
    const to = legalMoves(s).map((m) => m.path[1]).sort((a, b) => a - b)
    expect(to).toEqual([sq(3, 2), sq(3, 4)])
  })

  it('能吃一定要吃；關掉強制吃子就可以不吃', () => {
    const rows = ['........', '........', '........', '....o...', '...x....', '........', '.x......', '........']
    const s = fromRows(rows)
    expect(legalMoves(s).every((m) => m.captured.length)).toBe(true)
    expect(applyCheckers(s, { type: 'move', path: [sq(6, 1), sq(5, 0)] })).toEqual({ ok: false, reason: 'mustCapture' })
    const free = fromRows(rows, 0, { forceCapture: false })
    expect(legalMoves(free).some((m) => !m.captured.length)).toBe(true)
  })

  it('連吃要吃到底，被吃的子整步跳完才拿掉', () => {
    const s = fromRows(['........', '........', '.....o..', '........', '...o....', '..x.....', '........', '........'])
    const caps = legalMoves(s)
    expect(caps).toHaveLength(1)
    expect(caps[0].path).toEqual([sq(5, 2), sq(3, 4), sq(1, 6)])
    const after = move(s, sq(5, 2), sq(3, 4), sq(1, 6))
    expect(after.board[sq(4, 3)]).toBe(0)
    expect(after.board[sq(2, 5)]).toBe(0)
  })

  it('走到底線升王；連吃途中升王就停下來', () => {
    const s = fromRows(['........', '..o.....', '...x....', '........', '........', '........', '........', '.....o..'])
    // 2,3 吃 1,2 落在 0,1 升王；不能再往後吃
    const caps = legalMoves(s)
    expect(caps).toHaveLength(1)
    const after = move(s, ...caps[0].path)
    expect(after.board[sq(0, 1)]).toBe(2)
    expect(after.last?.crowned).toBe(true)
  })

  it('王前後都能走、都能吃', () => {
    const s = fromRows(['........', '........', '........', '........', '...X....', '..o.....', '........', '........'])
    const caps = legalMoves(s)
    expect(caps.map((m) => m.path)).toEqual([[sq(4, 3), sq(6, 1)]])
  })

  it('沒有棋可走就輸；認輸；逾時換對方', () => {
    // 後手唯一一顆被吃掉 → 輪到後手沒得走，先手贏
    const s = fromRows(['........', '........', '........', '....o...', '...x....', '........', '........', '........'])
    const after = move(s, sq(4, 3), sq(2, 5))
    expect(after.status).toBe('nomoves')
    expect(after.winner).toBe(0)
    const r = applyCheckers(createCheckers(), { type: 'resign', side: 0 })
    expect(r.ok && r.state.winner).toBe(1)
    const t = applyCheckers(createCheckers(), { type: 'timeout' })
    expect(t.ok && t.state.turn).toBe(1)
  })
})

describe('西洋跳棋電腦', () => {
  it('看得到能吃就吃、會連吃', () => {
    const s = fromRows(['........', '........', '.....o..', '........', '...o....', '..x.....', '........', '......o.'], 0, { forceCapture: false })
    const [m] = chooseCheckersMove(s, checkersAt(PERSONAS[0].chess, 'high'), seedRng(1))
    expect(m?.captured).toHaveLength(2)
  })

  it('難度：高一級多半會贏（電腦互下）', () => {
    const play = (strong: 'mid' | 'high', weak: 'low' | 'mid', games: number) => {
      let win = 0
      let lose = 0
      for (let g = 0; g < games; g++) {
        let s = createCheckers()
        let rng = seedRng(g * 13 + 7)
        const strongSide = g % 2
        while (s.status === 'playing' && s.plies < 300) {
          const st = checkersAt(PERSONAS[g % 30].chess, s.turn === strongSide ? strong : weak)
          const [m, r] = chooseCheckersMove(s, st, rng)
          rng = r
          if (!m) break
          s = (applyCheckers(s, { type: 'move', path: m.path }) as { ok: true; state: CheckersState }).state
        }
        if (s.winner === strongSide) win++
        else if (s.winner !== null) lose++
      }
      return { win, lose }
    }
    const a = play('mid', 'low', 10)
    expect(a.win).toBeGreaterThan(a.lose)
    const b = play('high', 'mid', 6)
    expect(b.win).toBeGreaterThan(b.lose)
  }, 120000)
})
