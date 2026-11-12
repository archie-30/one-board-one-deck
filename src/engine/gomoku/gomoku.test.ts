import { describe, expect, it } from 'vitest'
import { seedRng } from '../common/rng'
import { chooseGomokuMove } from './ai'
import { canPlace, createGomoku, forbiddenKind, placeStone, toIndex, type GomokuOptions, type GomokuState } from './rules'

/** 依序落子（黑白輪流），座標為 [x,y] */
function play(moves: [number, number][], options: Partial<GomokuOptions> = {}): GomokuState {
  let state = createGomoku(options)
  for (const [x, y] of moves) {
    const r = placeStone(state, toIndex(x, y))
    if (!r.ok) throw new Error(`illegal move ${x},${y}: ${r.reason}`)
    state = r.state
  }
  return state
}

/** 直接擺出盤面：b = 黑棋座標，w = 白棋座標，輪到 turn */
function setup(b: [number, number][], w: [number, number][], turn: 1 | 2, options: Partial<GomokuOptions> = {}) {
  const state = createGomoku(options)
  for (const [x, y] of b) state.board[toIndex(x, y)] = 1
  for (const [x, y] of w) state.board[toIndex(x, y)] = 2
  state.turn = turn
  state.moves = [...b, ...w].map(([x, y]) => toIndex(x, y))
  return state
}

describe('五子棋：落子', () => {
  it('黑棋先下，輪流換手', () => {
    const s = play([[7, 7]])
    expect(s.board[toIndex(7, 7)]).toBe(1)
    expect(s.turn).toBe(2)
  })
  it('不能下在已有棋子的格子或棋盤外', () => {
    const s = play([[7, 7]])
    expect(placeStone(s, toIndex(7, 7))).toEqual({ ok: false, reason: 'occupied' })
    expect(placeStone(s, -1)).toEqual({ ok: false, reason: 'out' })
    expect(placeStone(s, 225)).toEqual({ ok: false, reason: 'out' })
  })
  it('落子不會改動原本的狀態，且狀態可序列化', () => {
    const s = createGomoku()
    const r = placeStone(s, 0)
    expect(s.board[0]).toBe(0)
    expect(r.ok && JSON.parse(JSON.stringify(r.state))).toEqual(r.ok && r.state)
  })
})

describe('五子棋：勝負', () => {
  it('橫向五連獲勝', () => {
    const s = play([[3, 7], [3, 8], [4, 7], [4, 8], [5, 7], [5, 8], [6, 7], [6, 8], [7, 7]])
    expect(s.winner).toBe(1)
    expect(s.winLine).toHaveLength(5)
    expect(placeStone(s, 0)).toEqual({ ok: false, reason: 'finished' })
  })
  it('直向、兩種斜向都能獲勝', () => {
    const vertical = setup([[2, 0], [2, 1], [2, 2], [2, 3]], [], 1)
    expect(placeStone(vertical, toIndex(2, 4))).toMatchObject({ ok: true, state: { winner: 1 } })
    const diag = setup([], [[0, 0], [1, 1], [2, 2], [4, 4]], 2)
    expect(placeStone(diag, toIndex(3, 3))).toMatchObject({ ok: true, state: { winner: 2 } })
    const anti = setup([[14, 0], [13, 1], [12, 2], [11, 3]], [], 1)
    expect(placeStone(anti, toIndex(10, 4))).toMatchObject({ ok: true, state: { winner: 1 } })
  })
  it('四連不算贏；連線不會跨越棋盤邊界', () => {
    const s = setup([[12, 0], [13, 0], [14, 0], [0, 1]], [], 1)
    const r = placeStone(s, toIndex(1, 1))
    expect(r.ok && r.state.winner).toBe(0)
  })
  it('長連：預設算贏，關閉後不算', () => {
    const stones: [number, number][] = [[0, 0], [1, 0], [2, 0], [4, 0], [5, 0]]
    const on = placeStone(setup(stones, [], 1), toIndex(3, 0))
    expect(on.ok && on.state.winner).toBe(1)
    expect(on.ok && on.state.winLine).toHaveLength(6)
    const off = placeStone(setup(stones, [], 1, { overlineWins: false }), toIndex(3, 0))
    expect(off.ok && off.state.winner).toBe(0)
  })
  it('棋盤下滿且無人連線為和局', () => {
    const s = createGomoku({}, 3)
    let state = s
    for (let i = 0; i < 9; i++) {
      const r = placeStone(state, i)
      if (r.ok) state = r.state
    }
    expect(state.winner).toBe(3)
  })
})

describe('五子棋：禁手', () => {
  const opt = { forbidden: true }
  it('三三禁手', () => {
    const board = setup([[6, 7], [8, 7], [7, 6], [7, 8]], [], 1, opt)
    expect(forbiddenKind(board.board, 15, toIndex(7, 7))).toBe('doubleThree')
    expect(canPlace(board, toIndex(7, 7))).toBe('forbidden')
  })
  it('四四禁手', () => {
    const board = setup([[4, 7], [5, 7], [6, 7], [7, 4], [7, 5], [7, 6]], [[3, 7], [7, 3]], 1, opt)
    expect(forbiddenKind(board.board, 15, toIndex(7, 7))).toBe('doubleFour')
  })
  it('長連禁手', () => {
    const board = setup([[0, 0], [1, 0], [2, 0], [4, 0], [5, 0]], [], 1, opt)
    expect(forbiddenKind(board.board, 15, toIndex(3, 0))).toBe('overline')
  })
  it('剛好成五不算禁手', () => {
    const board = setup([[3, 7], [4, 7], [5, 7], [6, 7], [7, 5], [7, 6], [7, 8]], [], 1, opt)
    expect(forbiddenKind(board.board, 15, toIndex(7, 7))).toBeNull()
    expect(placeStone(board, toIndex(7, 7))).toMatchObject({ ok: true, state: { winner: 1 } })
  })
  it('被擋住的三不算活三；單一活三不是禁手', () => {
    const blocked = setup([[6, 7], [8, 7], [7, 6], [7, 8]], [[5, 7], [9, 7]], 1, opt)
    expect(forbiddenKind(blocked.board, 15, toIndex(7, 7))).toBeNull()
    const single = setup([[6, 7], [8, 7]], [], 1, opt)
    expect(forbiddenKind(single.board, 15, toIndex(7, 7))).toBeNull()
  })
  it('禁手只限制黑棋；未開啟時黑棋也可以下', () => {
    const white = setup([], [[6, 7], [8, 7], [7, 6], [7, 8]], 2, opt)
    expect(canPlace(white, toIndex(7, 7))).toBeNull()
    const free = setup([[6, 7], [8, 7], [7, 6], [7, 8]], [], 1)
    expect(canPlace(free, toIndex(7, 7))).toBeNull()
  })
})

describe('五子棋：AI', () => {
  it('空盤下天元', () => {
    expect(chooseGomokuMove(createGomoku(), 'normal', seedRng(1))[0]).toBe(toIndex(7, 7))
  })
  it('能贏就贏', () => {
    const s = setup([[3, 3], [4, 3], [5, 3], [6, 3]], [[3, 4], [4, 4], [5, 4], [2, 3]], 1)
    for (const d of ['easy', 'normal'] as const) {
      expect(chooseGomokuMove(s, d, seedRng(5))[0]).toBe(toIndex(7, 3))
    }
  })
  it('會擋住對手的四', () => {
    const s = setup([[3, 3], [4, 3], [5, 3], [6, 3]], [[2, 3], [9, 9]], 2)
    for (const d of ['easy', 'normal'] as const) {
      expect(chooseGomokuMove(s, d, seedRng(9))[0]).toBe(toIndex(7, 3))
    }
  })
  it('普通難度會擋活三', () => {
    const s = setup([[5, 7], [6, 7], [7, 7]], [[7, 8], [1, 1]], 2)
    const [m] = chooseGomokuMove(s, 'normal', seedRng(2))
    expect([toIndex(4, 7), toIndex(8, 7)]).toContain(m)
  })
  it('同一個 seed 會下同一手；開啟禁手時黑棋 AI 不下禁手', () => {
    const s = play([[7, 7], [8, 8], [7, 8]])
    expect(chooseGomokuMove(s, 'easy', seedRng(11))).toEqual(chooseGomokuMove(s, 'easy', seedRng(11)))
    const f = setup([[6, 7], [8, 7], [7, 6], [7, 8]], [[0, 0], [14, 14], [0, 14]], 1, { forbidden: true })
    const [m] = chooseGomokuMove(f, 'normal', seedRng(4))
    expect(m).not.toBe(toIndex(7, 7))
    expect(canPlace(f, m)).toBeNull()
  })
  it('AI 自己對下能正常下完一局', () => {
    let state = createGomoku()
    let rng = seedRng(123)
    let guard = 0
    while (state.winner === 0 && guard++ < 230) {
      let m: number
      ;[m, rng] = chooseGomokuMove(state, state.turn === 1 ? 'normal' : 'easy', rng)
      const r = placeStone(state, m)
      expect(r.ok).toBe(true)
      if (r.ok) state = r.state
    }
    expect(state.winner).not.toBe(0)
  })
})
