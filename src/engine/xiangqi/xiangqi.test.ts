import { describe, expect, it } from 'vitest'
import { applyXiangqi, createXiangqi, fromBoard, inCheck, legalMoves, perft, sq, targetsFrom, type XiangqiState } from './rules'

/** 用每一行 9 個字元畫棋盤（第 0 行在最上面＝黑方） */
const board = (...rows: string[]) => {
  if (rows.length !== 10 || rows.some((r) => r.length !== 9)) throw new Error('bad board')
  return rows.join('')
}
const E = '.........'
function play(s: XiangqiState, ...moves: [number, number][]): XiangqiState {
  for (const [from, to] of moves) {
    const r = applyXiangqi(s, { type: 'move', move: { from, to } })
    if (!r.ok) throw new Error(`${from}->${to}: ${r.reason}`)
    s = r.state
  }
  return s
}

describe('象棋：走法產生', () => {
  it('開局紅方 44 種走法；往下數兩層 1920、三層 79666（國際通用的核對數字）', () => {
    const s = createXiangqi()
    expect(legalMoves(s)).toHaveLength(44)
    expect(perft(s, 2)).toBe(1920)
    expect(perft(s, 3)).toBe(79666)
  })
  it('蹩馬腿：馬前面有子擋住就不能往那邊跳', () => {
    const s = fromBoard(board('....k....', E, E, E, E, E, E, '....P....', '....N....', '...K.....'))
    // 往上被兵擋住
    expect(targetsFrom(s, sq(8, 4))).not.toContain(sq(6, 3))
    expect(targetsFrom(s, sq(8, 4))).not.toContain(sq(6, 5))
    expect(targetsFrom(s, sq(8, 4))).toContain(sq(7, 2))
  })
  it('相不過河、塞象眼', () => {
    const s = fromBoard(board('....k....', E, E, E, E, '..B......', E, E, E, '...K.....'))
    // 在河邊（第 5 行），往上就過河了，只能往下
    expect(targetsFrom(s, sq(5, 2)).sort()).toEqual([sq(7, 0), sq(7, 4)].sort())
    // 象眼（中間那格）有子就不能走
    const t = fromBoard(board('....k....', E, E, E, E, E, E, '...P.....', '..B......', '...K.....'))
    expect(targetsFrom(t, sq(8, 2))).not.toContain(sq(6, 4))
    expect(targetsFrom(t, sq(8, 2))).toContain(sq(6, 0))
  })
  it('炮：不吃子時走直線不能跳；吃子要隔一個子（炮架）', () => {
    const s = fromBoard(board('....k....', E, E, '....p....', E, E, '....P....', E, '....C....', '...K.....'))
    const t = targetsFrom(s, sq(8, 4))
    expect(t).toContain(sq(3, 4)) // 隔著自己的兵吃黑卒
    expect(t).not.toContain(sq(5, 4)) // 不能跳過去走空格
    expect(t).not.toContain(sq(6, 4)) // 不能吃自己的子
  })
  it('兵：沒過河只能往前；過河後可以橫走，不能後退', () => {
    const s = fromBoard(board('....k....', E, E, E, E, E, '....P....', E, E, '...K.....'))
    expect(targetsFrom(s, sq(6, 4))).toEqual([sq(5, 4)])
    const t = fromBoard(board('....k....', E, E, '....P....', E, E, E, E, E, '...K.....'))
    expect(targetsFrom(t, sq(3, 4)).sort((a, b) => a - b)).toEqual([sq(2, 4), sq(3, 3), sq(3, 5)].sort((a, b) => a - b))
  })
  it('帥、仕不出九宮', () => {
    const s = fromBoard(board('....k....', E, E, E, E, E, E, '...A.....', E, '...K.....'))
    expect(targetsFrom(s, sq(7, 3))).toEqual([sq(8, 4)])
    // 帥往右一格會跟黑將照面（中間沒有子），所以只能往上
    expect(targetsFrom(s, sq(9, 3))).toEqual([sq(8, 3)])
  })
  it('王不見王：不能走到讓兩邊將帥照面的位置', () => {
    const s = fromBoard(board('....k....', E, E, E, E, E, E, E, E, '...K.....'))
    expect(targetsFrom(s, sq(9, 3))).not.toContain(sq(9, 4))
    // 中間的子擋著時，移開會照面，不能移
    const t = fromBoard(board('....k....', E, E, E, '....R....', E, E, E, E, '....K....'))
    expect(targetsFrom(t, sq(4, 4)).every((to) => to % 9 === 4)).toBe(true)
  })
})

describe('象棋：結束', () => {
  it('將死：被將軍又沒有步可走，輸', () => {
    // 一隻車守住第 1 行，另一隻車從第 0 行將軍
    const s = fromBoard(board('...k.....', '.......R.', E, E, E, E, E, E, E, '.....K..R'))
    const m = play(s, [sq(9, 8), sq(0, 8)])
    expect(m.status).toBe('checkmate')
    expect(m.winner).toBe('r')
    expect(inCheck(m.board, 'b')).toBe(true)
  })
  it('困斃：沒被將軍但沒有步可走，也算輸', () => {
    // 車守住第 1 行；黑將往右會跟紅帥照面 → 一步都不能走
    const s = fromBoard(board('...k.....', E, '........R', E, E, E, E, E, E, '....K....'))
    const m = play(s, [sq(2, 8), sq(1, 8)])
    expect(inCheck(m.board, 'b')).toBe(false)
    expect(m.status).toBe('stalemate')
    expect(m.winner).toBe('r')
  })
  it('一直將軍造成同一局面第三次出現：將軍的一方必須換步', () => {
    // 紅車在第 8 行左右來回將軍，黑將在九宮裡左右躲
    let s = fromBoard(board('...k.....', E, E, E, E, E, E, E, '.R.......', '.....K...'))
    s = play(s, [sq(8, 1), sq(8, 3)], [sq(0, 3), sq(0, 4)], [sq(8, 3), sq(8, 4)], [sq(0, 4), sq(0, 3)], [sq(8, 4), sq(8, 3)], [sq(0, 3), sq(0, 4)], [sq(8, 3), sq(8, 4)], [sq(0, 4), sq(0, 3)])
    // 再走一次「車到第 3 路將軍」就會讓同一局面第三次出現
    expect(applyXiangqi(s, { type: 'move', move: { from: sq(8, 4), to: sq(8, 3) } })).toEqual({ ok: false, reason: 'perpetualCheck' })
  })
  it('沒有將軍的重複：同一局面第三次出現就和棋', () => {
    const s = play(
      createXiangqi(),
      [sq(9, 1), sq(7, 2)],
      [sq(0, 1), sq(2, 2)],
      [sq(7, 2), sq(9, 1)],
      [sq(2, 2), sq(0, 1)],
      [sq(9, 1), sq(7, 2)],
      [sq(0, 1), sq(2, 2)],
      [sq(7, 2), sq(9, 1)],
      [sq(2, 2), sq(0, 1)],
    )
    expect(s.status).toBe('repetition')
  })
  it('60 回合沒有吃子：和棋', () => {
    const s = fromBoard(board('...k.....', E, E, E, E, E, E, E, '.R.......', '.....K...'))
    s.quiet = 119
    expect(play(s, [sq(8, 1), sq(8, 0)]).status).toBe('limit')
  })
})

describe('象棋：電腦對手', () => {
  it('看得到一步就贏的棋（將死或困斃都算贏）', async () => {
    const { chooseXiangqiMove } = await import('./ai')
    const { seedRng } = await import('../common/rng')
    const s = fromBoard(board('...k.....', '.......R.', E, E, E, E, E, E, E, '.....K..R'))
    const [m] = chooseXiangqiMove(s, { depth: 2, attack: 0.5, safety: 0.5, noise: 0, blunder: 0 }, seedRng(1))
    const r = applyXiangqi(s, { type: 'move', move: m! })
    expect(r.ok && r.state.winner).toBe('r')
  })
  it('會吃掉沒人保護的車', async () => {
    const { chooseXiangqiMove } = await import('./ai')
    const { seedRng } = await import('../common/rng')
    const s = fromBoard(board('...k.....', E, E, E, '..r......', E, E, '..R......', E, '.....K...'))
    const [m] = chooseXiangqiMove(s, { depth: 1, attack: 0.5, safety: 0.5, noise: 0, blunder: 0 }, seedRng(2))
    expect(m).toEqual({ from: sq(7, 2), to: sq(4, 2) })
  })
  it('20 位對手都能走完一段（不會走不合法的步）', async () => {
    const { chooseXiangqiMove } = await import('./ai')
    const { seedRng } = await import('../common/rng')
    const { PERSONAS } = await import('../common/personas')
    for (const p of [1, 8, 14]) {
      let s = createXiangqi()
      let rng = seedRng(p + 3)
      for (let i = 0; i < 30 && s.status === 'playing'; i++) {
        let m
        ;[m, rng] = chooseXiangqiMove(s, PERSONAS[(p + i) % 20].chess, rng)
        const r = applyXiangqi(s, { type: 'move', move: m! })
        expect(r.ok).toBe(true)
        if (r.ok) s = r.state
      }
    }
  }, 120000)
})
