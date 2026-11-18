import { describe, expect, it } from 'vitest'
import { starAt } from '../common/difficulty'
import { PERSONAS } from '../common/personas'
import { seedRng } from '../common/rng'
import { chooseStarMove } from './ai'
import { APEX, CELLS, CORNER_CELLS, HOMES, applyStar, arrived, cellAt, createStar, legalMoves, movesFrom, targetOf, type StarState } from './rules'

const empty = (opts = {}): StarState => ({ ...createStar(opts), board: Array(CELLS.length).fill(0) })
const put = (s: StarState, q: number, r: number, v: number) => (s.board[cellAt(q, r)] = v)

describe('星形跳棋規則', () => {
  it('棋盤 121 格，六個角各 10 格，三個人各 10 顆、目的地在正對面', () => {
    expect(CELLS).toHaveLength(121)
    for (const c of Object.values(CORNER_CELLS)) expect(c).toHaveLength(10)
    const s = createStar()
    for (let seat = 0; seat < 3; seat++) {
      expect(s.board.filter((v) => v === seat + 1)).toHaveLength(10)
      // 開局時目的地是空的
      expect(CORNER_CELLS[targetOf(seat)].every((i) => s.board[i] === 0)).toBe(true)
    }
    expect(HOMES).toEqual(['r+', 's+', 'q+'])
  })

  it('走一格、跳過緊鄰的一顆、連跳', () => {
    const s = empty({ longJump: false })
    put(s, 0, 0, 1)
    put(s, 1, 0, 2)
    put(s, 3, 0, 3)
    const ends = movesFrom(s, cellAt(0, 0)).map((m) => m.path[m.path.length - 1])
    // 跳過 (1,0) 到 (2,0)，再跳過 (3,0) 到 (4,0)
    expect(ends).toContain(cellAt(2, 0))
    expect(ends).toContain(cellAt(4, 0))
    const chain = movesFrom(s, cellAt(0, 0)).find((m) => m.path[m.path.length - 1] === cellAt(4, 0))!
    expect(chain.path).toEqual([cellAt(0, 0), cellAt(2, 0), cellAt(4, 0)])
    // 旁邊的空格也能走
    expect(ends).toContain(cellAt(0, 1))
  })

  it('遠跳：中間那顆兩邊空格一樣多才能跳；關掉就不行', () => {
    const s = empty()
    put(s, 0, 0, 1)
    put(s, 2, 0, 2)
    const far = movesFrom(s, cellAt(0, 0)).map((m) => m.path[m.path.length - 1])
    expect(far).toContain(cellAt(4, 0))
    // 對面那段中間有子就不能跳
    put(s, 3, 0, 3)
    expect(movesFrom(s, cellAt(0, 0)).map((m) => m.path[m.path.length - 1])).not.toContain(cellAt(4, 0))
    const near = empty({ longJump: false })
    put(near, 0, 0, 1)
    put(near, 2, 0, 2)
    expect(movesFrom(near, cellAt(0, 0)).map((m) => m.path[m.path.length - 1])).not.toContain(cellAt(4, 0))
  })

  it('到齊：目的地 10 格都有子、至少一顆是自己的（別人佔著也算）', () => {
    const s = empty()
    const target = CORNER_CELLS[targetOf(0)]
    target.forEach((i, k) => (s.board[i] = k === 0 ? 1 : 2))
    expect(arrived(s.board, 0)).toBe(true)
    target.forEach((i) => (s.board[i] = 2))
    expect(arrived(s.board, 0)).toBe(false)
  })

  it('玩到分出名次；到齊、認輸的人之後跳過；認輸的排最後', () => {
    let s = createStar()
    const r1 = applyStar(s, { type: 'resign', seat: 1 })
    expect(r1.ok).toBe(true)
    if (r1.ok) s = r1.state
    expect(s.turn).toBe(0)
    // 0 號走一步 → 跳過 1 號，輪到 2 號
    const m = legalMoves(s)[0]
    const r2 = applyStar(s, { type: 'move', path: m.path })
    expect(r2.ok && r2.state.turn).toBe(2)
    // 2 號也認輸 → 只剩 0 號，結束：0 第 1、2 第 2、1 第 3
    const r3 = applyStar((r2 as { ok: true; state: StarState }).state, { type: 'resign', seat: 2 })
    expect(r3.ok && r3.state.over).toBe(true)
    expect(r3.ok && r3.state.out).toEqual([0, 2, 1])
  })

  it('尖端在對面角離中心最遠的那一格', () => {
    expect(CELLS[APEX['r-']]).toEqual({ q: 4, r: -8 })
  })
})

describe('星形跳棋電腦', () => {
  const run = (levels: ('low' | 'mid' | 'high' | 'master')[], seed: number) => {
    let s = createStar()
    let rng = seedRng(seed)
    while (!s.over) {
      const [m, r] = chooseStarMove(s, starAt(PERSONAS[seed % 30].chess, levels[s.turn]), rng)
      rng = r
      const res = applyStar(s, m ? { type: 'move', path: m.path } : { type: 'timeout' })
      if (!res.ok) throw new Error(res.reason)
      s = res.state
    }
    return s
  }

  it('電腦三個人下得完：排出 1～3 名', () => {
    for (let g = 0; g < 3; g++) {
      const s = run(['mid', 'mid', 'mid'], g)
      expect(new Set(s.out).size).toBe(3)
      expect(s.plies).toBeLessThan(900)
    }
  }, 60000)

  it('難度：高比中、中比低多半先到齊', () => {
    let highFirst = 0
    let midFirst = 0
    for (let g = 0; g < 6; g++) {
      const levels: ('low' | 'mid' | 'high')[] = ['high', 'mid', 'low']
      // 輪流換位子
      const order = [levels[g % 3], levels[(g + 1) % 3], levels[(g + 2) % 3]]
      const s = run(order, g + 10)
      const rank = (lv: string) => s.out.indexOf(order.indexOf(lv as 'low'))
      if (rank('high') < rank('mid')) highFirst++
      if (rank('mid') < rank('low')) midFirst++
    }
    expect(highFirst).toBeGreaterThanOrEqual(4)
    expect(midFirst).toBeGreaterThanOrEqual(4)
  }, 120000)
})
