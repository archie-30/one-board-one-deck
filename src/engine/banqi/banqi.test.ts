import { describe, expect, it } from 'vitest'
import { banqiAt, type CardLevel } from '../common/difficulty'
import { PERSONAS } from '../common/personas'
import { seedRng, shuffle } from '../common/rng'
import { chooseBanqiAction } from './ai'
import { applyBanqi, COLS, createBanqi, dealBanqi, DRAW_QUIET, legalActions, outranks, SIZE, targetsFrom, type BanqiAction, type BanqiState, type Piece } from './rules'

const must = (s: BanqiState, a: BanqiAction) => {
  const r = applyBanqi(s, a)
  if (!r.ok) throw new Error(r.reason)
  return r.state
}
/** 擺一個盤面：pieces 是 { 格子: 棋 }，up 預設全部翻開；先動的一方拿紅 */
function setup(pieces: Record<number, Piece>, opts: Partial<BanqiState['options']> = {}, hidden: number[] = []): BanqiState {
  const board: (Piece | null)[] = Array(SIZE).fill(null)
  const up = Array(SIZE).fill(false)
  for (const [i, p] of Object.entries(pieces)) {
    board[+i] = p
    up[+i] = !hidden.includes(+i)
  }
  return { ...createBanqi(board, opts, up), colors: ['r', 'b'] }
}
const sq = (r: number, c: number) => r * COLS + c

describe('暗棋規則', () => {
  it('發棋：32 顆全部蓋著、紅黑各 16，同一個 seed 擺法一樣', () => {
    const s = dealBanqi(7)
    expect(s.board.filter(Boolean)).toHaveLength(32)
    expect(s.up.every((u) => !u)).toBe(true)
    expect(s.board.filter((p) => p === p?.toUpperCase()).length).toBe(16)
    expect(dealBanqi(7).board).toEqual(s.board)
  })
  it('第一個翻棋的人翻出什麼顏色就是哪一方；第一步只能翻棋', () => {
    const s = dealBanqi(3)
    expect(legalActions(s).every((a) => a.type === 'flip')).toBe(true)
    const p = s.board[5]!
    const t = must(s, { type: 'flip', at: 5 })
    const red = p === p.toUpperCase()
    expect(t.colors).toEqual(red ? ['r', 'b'] : ['b', 'r'])
    expect(t.turn).toBe(1)
  })
  it('大吃小、一樣大互吃；兵吃帥、帥不能吃兵', () => {
    expect(outranks('R', 'n')).toBe(true)
    expect(outranks('N', 'r')).toBe(false)
    expect(outranks('B', 'b')).toBe(true)
    expect(outranks('P', 'k')).toBe(true)
    expect(outranks('K', 'p')).toBe(false)
    expect(outranks('K', 'a')).toBe(true)
    expect(outranks('P', 'c')).toBe(false)
  })
  it('只能上下左右走一格；不能吃蓋著的棋', () => {
    const s = setup({ [sq(1, 1)]: 'R', [sq(1, 2)]: 'n', [sq(2, 1)]: 'p' }, {}, [sq(2, 1)])
    const t = targetsFrom(s, sq(1, 1)).sort((a, b) => a - b)
    expect(t).toEqual([sq(0, 1), sq(1, 0), sq(1, 2)].sort((a, b) => a - b))
  })
  it('炮：隔一顆棋（蓋著也算）跳吃任何大小；旁邊的不能直接吃、隔兩顆也不行', () => {
    const s = setup({ [sq(0, 0)]: 'C', [sq(0, 1)]: 'p', [sq(0, 3)]: 'k', [sq(1, 0)]: 'a', [sq(2, 0)]: 'b', [sq(3, 0)]: 'n' }, {}, [sq(0, 1)])
    const t = targetsFrom(s, sq(0, 0))
    expect(t).toContain(sq(0, 3)) // 隔著蓋著的棋吃帥
    expect(t).not.toContain(sq(1, 0)) // 旁邊的仕不能直接吃
    expect(t).toContain(sq(2, 0)) // 隔著仕吃相
    expect(t).not.toContain(sq(3, 0)) // 隔兩顆不行
    expect(t).not.toContain(sq(0, 1))
  })
  it('規則設定「車直走多格」：中間沒棋可以一直走、衝過去吃', () => {
    const base = { [sq(0, 0)]: 'R', [sq(0, 5)]: 'n' }
    expect(targetsFrom(setup(base), sq(0, 0))).not.toContain(sq(0, 5))
    const t = targetsFrom(setup(base, { rookSlide: true }), sq(0, 0))
    expect(t).toContain(sq(0, 4))
    expect(t).toContain(sq(0, 5))
  })
  it('車衝：隔著空格衝過去吃不用比大小（帥也吃得掉）；緊貼的照樣比大小', () => {
    const far = setup({ [sq(0, 0)]: 'R', [sq(0, 3)]: 'k', [sq(1, 0)]: 'a' }, { rookSlide: true })
    const t = targetsFrom(far, sq(0, 0))
    expect(t).toContain(sq(0, 3)) // 衝過去吃將
    expect(t).not.toContain(sq(1, 0)) // 緊貼的士比車大，吃不了
    expect(must(far, { type: 'move', from: sq(0, 0), to: sq(0, 3) }).captured).toEqual(['k'])
    // 沒開「車直走多格」就不能衝
    expect(targetsFrom(setup({ [sq(0, 0)]: 'R', [sq(0, 1)]: 'k' }), sq(0, 0))).not.toContain(sq(0, 1))
  })
  it('暗吃：可以走到蓋著的棋上；翻開是對方的、吃得掉就吃，吃不掉或是自己的就只翻開、棋不動', () => {
    const hid = [sq(1, 2)]
    // 沒開：蓋著的棋不能當目標
    expect(targetsFrom(setup({ [sq(1, 1)]: 'R', [sq(1, 2)]: 'n' }, {}, hid), sq(1, 1))).not.toContain(sq(1, 2))
    // 吃得掉：車吃馬
    const a = must(setup({ [sq(1, 1)]: 'R', [sq(1, 2)]: 'n', [sq(3, 7)]: 'p' }, { darkEat: true }, hid), { type: 'move', from: sq(1, 1), to: sq(1, 2) })
    expect(a.board[sq(1, 2)]).toBe('R')
    expect(a.captured).toEqual(['n'])
    expect(a.turn).toBe(1)
    // 吃不掉：車碰到士，士翻開、車不動、換對方
    const b = must(setup({ [sq(1, 1)]: 'R', [sq(1, 2)]: 'a', [sq(3, 7)]: 'p' }, { darkEat: true }, hid), { type: 'move', from: sq(1, 1), to: sq(1, 2) })
    expect(b.board[sq(1, 1)]).toBe('R')
    expect(b.board[sq(1, 2)]).toBe('a')
    expect(b.up[sq(1, 2)]).toBe(true)
    expect(b.captured).toEqual([])
    expect(b.turn).toBe(1)
    // 翻出來是自己的：只翻開
    const c = must(setup({ [sq(1, 1)]: 'R', [sq(1, 2)]: 'N', [sq(3, 7)]: 'p' }, { darkEat: true }, hid), { type: 'move', from: sq(1, 1), to: sq(1, 2) })
    expect(c.board[sq(1, 1)]).toBe('R')
    expect(c.up[sq(1, 2)]).toBe(true)
    // 炮隔子暗吃：任何大小都吃
    const d = must(setup({ [sq(0, 0)]: 'C', [sq(0, 1)]: 'p', [sq(0, 2)]: 'k' }, { darkEat: true }, [sq(0, 2)]), { type: 'move', from: sq(0, 0), to: sq(0, 2) })
    expect(d.captured).toEqual(['k'])
    // 車衝暗吃：衝過去不用比大小
    const e = must(setup({ [sq(0, 0)]: 'R', [sq(0, 3)]: 'k', [sq(3, 7)]: 'p' }, { darkEat: true, rookSlide: true }, [sq(0, 3)]), { type: 'move', from: sq(0, 0), to: sq(0, 3) })
    expect(e.captured).toEqual(['k'])
  })
  it('預設一步只能吃一顆；開「連吃」後同一顆棋可以繼續吃，也可以結束', () => {
    const base = { [sq(1, 1)]: 'R', [sq(1, 2)]: 'n', [sq(1, 3)]: 'p', [sq(3, 7)]: 'k' }
    const a = must(setup(base), { type: 'move', from: sq(1, 1), to: sq(1, 2) })
    expect(a.turn).toBe(1)
    const b = must(setup(base, { chain: true }), { type: 'move', from: sq(1, 1), to: sq(1, 2) })
    expect(b.turn).toBe(0)
    expect(b.chainAt).toBe(sq(1, 2))
    expect(legalActions(b)).toContainEqual({ type: 'end' })
    const c = must(b, { type: 'move', from: sq(1, 2), to: sq(1, 3) })
    expect(c.captured).toEqual(['n', 'p'])
    expect(c.turn).toBe(1)
    const d = must(b, { type: 'end' })
    expect(d.turn).toBe(1)
  })
  it('對方被吃光就贏；沒得翻也沒得走就輸', () => {
    const w = must(setup({ [sq(1, 1)]: 'R', [sq(1, 2)]: 'n' }), { type: 'move', from: sq(1, 1), to: sq(1, 2) })
    expect(w).toMatchObject({ status: 'wiped', winner: 0 })
    // 黑卒被紅帥、紅仕夾在角落，卒吃不了仕；輪到黑沒得動
    const s = setup({ [sq(0, 0)]: 'p', [sq(0, 1)]: 'A', [sq(1, 0)]: 'A', [sq(3, 7)]: 'R' })
    const t = must(s, { type: 'move', from: sq(3, 7), to: sq(3, 6) })
    expect(t).toMatchObject({ status: 'stuck', winner: 0 })
  })
  it('連續 50 步沒人吃子就和棋；吃子就重新算', () => {
    let s = setup({ [sq(0, 0)]: 'R', [sq(3, 7)]: 'r' })
    for (let k = 0; k < DRAW_QUIET; k++) {
      const a = legalActions(s).find((x) => x.type === 'move')!
      s = must(s, a)
    }
    expect(s).toMatchObject({ status: 'quiet', winner: null })
  })
  it('時間到：這一步跳過換對方', () => {
    const s = must(dealBanqi(1), { type: 'flip', at: 0 })
    const t = must(s, { type: 'timeout' })
    expect(t.turn).toBe(0)
    expect(t.board).toEqual(s.board)
  })
})

describe('暗棋電腦', () => {
  const style = (level: CardLevel, k = 0) => banqiAt(PERSONAS[k % 30].chess, level)
  function play(seed: number, levels: [CardLevel, CardLevel], opts: Parameters<typeof dealBanqi>[1] = {}) {
    let s = dealBanqi(seed, opts)
    let rng = seedRng(seed)
    for (let k = 0; k < 600 && s.status === 'playing'; k++) {
      let a: BanqiAction | null
      ;[a, rng] = chooseBanqiAction(s, style(levels[s.turn], seed + s.turn), rng)
      if (!a) break
      s = must(s, a)
    }
    return s
  }
  it('三個難度都能把整局下完、不出錯', () => {
    for (const lv of ['low', 'mid', 'high'] as const) for (let g = 0; g < 4; g++) expect(play(100 + g, [lv, lv]).status).not.toBe('playing')
    // 開了車衝、暗吃、連吃也下得完
    for (let g = 0; g < 4; g++) expect(play(150 + g, ['mid', 'high'], { rookSlide: true, darkEat: true, chain: true }).status).not.toBe('playing')
  }, 60000)
  it('電腦不偷看：把蓋著的棋彼此換位置，選的動作完全一樣', () => {
    for (let g = 0; g < 12; g++) {
      // 一半的局開「暗吃＋車衝」：走到蓋著的棋上也不能偷看
      const opts = g % 2 ? { darkEat: true, rookSlide: true } : {}
      // 拿一個下到一半的局面
      let s = dealBanqi(300 + g, opts)
      let rng = seedRng(g)
      for (let k = 0; k < 14 + g && s.status === 'playing'; k++) {
        let a: BanqiAction | null
        ;[a, rng] = chooseBanqiAction(s, style('mid', g), rng)
        if (!a) break
        s = must(s, a)
      }
      if (s.status !== 'playing') continue
      const hidden = s.board.map((p, i) => (p && !s.up[i] ? i : -1)).filter((i) => i >= 0)
      const [mixed] = shuffle(hidden.map((i) => s.board[i]), seedRng(g + 99))
      const board = s.board.slice()
      hidden.forEach((i, k) => (board[i] = mixed[k]))
      for (const lv of ['mid', 'high'] as const) expect(chooseBanqiAction({ ...s, board }, style(lv, g), seedRng(5))[0]).toEqual(chooseBanqiAction(s, style(lv, g), seedRng(5))[0])
    }
  }, 60000)
  /** strong 對 weak 下 games 局（輪流先後），回傳 strong 贏、輸、和 */
  function duel(strong: CardLevel, weak: CardLevel, games: number) {
    let w = 0
    let l = 0
    for (let g = 0; g < games; g++) {
      const first = g % 2 === 0
      const s = play(1000 + g, first ? [strong, weak] : [weak, strong])
      const mine = first ? 0 : 1
      if (s.winner === mine) w++
      else if (s.winner !== null) l++
    }
    return { w, l }
  }
  it('難度一級比一級強：高贏中、中贏低（贏的比輸的多很多）', () => {
    const hm = duel('high', 'mid', 40)
    const ml = duel('mid', 'low', 40)
    expect(hm.w).toBeGreaterThan(hm.l * 2)
    expect(ml.w).toBeGreaterThan(ml.l * 2)
  }, 400000)
  it('還有很多棋沒翻時，不會一直來回走到 50 步和棋（會去翻棋）', () => {
    for (let g = 0; g < 8; g++) {
      const s = play(3000 + g, ['mid', 'mid'])
      if (s.status === 'quiet') expect(s.up.filter((u, i) => !u && s.board[i]).length).toBeLessThan(4)
    }
  }, 120000)
})
