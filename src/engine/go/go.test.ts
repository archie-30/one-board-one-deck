import { describe, expect, it } from 'vitest'
import { PERSONAS } from '../common/personas'
import { seedRng } from '../common/rng'
import { chooseGoMove } from './ai'
import { estimateDead } from './playout'
import { applyGo, createGo, hashBoard, legalMoves, scoreGo, toIndex, type GoState, type Point } from './rules'

/** 用文字擺盤面：X 黑、O 白、. 空；turn 預設黑 */
function setup(rows: string[], turn: 1 | 2 = 1, komi = 7.5): GoState {
  const size = rows.length
  const s = createGo({ size: size as 9, komi })
  s.board = rows.join('').split('').map((c): Point => (c === 'X' ? 1 : c === 'O' ? 2 : 0))
  s.turn = turn
  s.history = [hashBoard(s.board)]
  return s
}
const must = (s: GoState, a: Parameters<typeof applyGo>[1]) => {
  const r = applyGo(s, a)
  if (!r.ok) throw new Error(r.reason)
  return r.state
}
const at = (x: number, y: number, size = 9) => toIndex(x, y, size)

describe('圍棋：落子與提子', () => {
  it('預設 19×19、黑先、貼 7.5', () => {
    const s = createGo()
    expect(s.size).toBe(19)
    expect(s.board).toHaveLength(361)
    expect(s.turn).toBe(1)
    expect(s.komi).toBe(7.5)
  })
  it('黑白輪流；不能下在有子的地方或棋盤外', () => {
    let s = createGo({ size: 9 })
    s = must(s, { type: 'play', index: at(4, 4) })
    expect(s.turn).toBe(2)
    expect(applyGo(s, { type: 'play', index: at(4, 4) })).toEqual({ ok: false, reason: 'occupied' })
    expect(applyGo(s, { type: 'play', index: 81 })).toEqual({ ok: false, reason: 'out' })
  })
  it('提掉沒有氣的一顆子', () => {
    const s = setup(['.........', '....X....', '...XO....', '.........', '.........', '.........', '.........', '.........', '.........'])
    const t = must(s, { type: 'play', index: at(4, 3) })
    // 還有一口氣（右邊），不會被提
    expect(t.board[at(4, 2)]).toBe(2)
    const u = setup(['.........', '....X....', '...XOX...', '.........', '.........', '.........', '.........', '.........', '.........'])
    const v = must(u, { type: 'play', index: at(4, 3) })
    expect(v.board[at(4, 2)]).toBe(0)
    expect(v.captures[1]).toBe(1)
    expect(v.lastCaptured).toEqual([at(4, 2)])
  })
  it('提掉一整塊', () => {
    const s = setup(['OOX......', 'XX.......', '.........', '.........', '.........', '.........', '.........', '.........', '.........'])
    const t = must(s, { type: 'play', index: at(2, 1) })
    expect(t.board[at(0, 0)]).toBe(2)
    const u = setup(['OO.X.....', 'XXX......', '.........', '.........', '.........', '.........', '.........', '.........', '.........'])
    const v = must(u, { type: 'play', index: at(2, 0) })
    expect(v.board[at(0, 0)]).toBe(0)
    expect(v.board[at(1, 0)]).toBe(0)
    expect(v.captures[1]).toBe(2)
  })
  it('不能自殺；但能同時提掉對方就可以', () => {
    const s = setup(['.O.......', 'O........', '.........', '.........', '.........', '.........', '.........', '.........', '.........'])
    expect(applyGo(s, { type: 'play', index: at(0, 0) })).toEqual({ ok: false, reason: 'suicide' })
    const t = setup(['.OX......', 'OX.......', 'X........', '.........', '.........', '.........', '.........', '.........', '.........'])
    const u = must(t, { type: 'play', index: at(0, 0) })
    expect(u.board[at(1, 0)]).toBe(0)
    expect(u.board[at(0, 1)]).toBe(0)
  })
  it('打劫：不能馬上提回來，隔一手才可以', () => {
    let s = setup(['.........', '...XO....', '..X.XO...', '...XO....', '.........', '.........', '.........', '.........', '.........'], 2)
    s = must(s, { type: 'play', index: at(3, 2) })
    expect(s.board[at(4, 2)]).toBe(0)
    expect(applyGo(s, { type: 'play', index: at(4, 2) })).toEqual({ ok: false, reason: 'ko' })
    s = must(s, { type: 'play', index: at(8, 8) })
    s = must(s, { type: 'play', index: at(8, 7) })
    expect(applyGo(s, { type: 'play', index: at(4, 2) }).ok).toBe(true)
  })
  it('雙方連續虛手就結束；認輸也會結束', () => {
    let s = createGo({ size: 9 })
    s = must(s, { type: 'pass' })
    expect(s.phase).toBe('play')
    s = must(s, { type: 'play', index: 0 })
    s = must(s, { type: 'pass' })
    s = must(s, { type: 'pass' })
    expect(s.phase).toBe('over')
    expect(applyGo(s, { type: 'pass' })).toEqual({ ok: false, reason: 'over' })
    const r = must(createGo({ size: 9 }), { type: 'resign' })
    expect(r.resigned).toBe(1)
    expect(scoreGo(r).winner).toBe(2)
  })
  it('落子不會改動原本的狀態，且狀態可序列化', () => {
    const s = createGo({ size: 9 })
    const copy = JSON.parse(JSON.stringify(s))
    must(s, { type: 'play', index: 10 })
    expect(s).toEqual(copy)
  })
})

describe('圍棋：計分', () => {
  const split = ['...XO....', '...XO....', '...XO....', '...XO....', '...XO....', '...XO....', '...XO....', '...XO....', '...XO....']
  it('數子法：棋子＋圍住的空地，白棋加貼目', () => {
    const sc = scoreGo(setup(split))
    expect(sc.black).toBe(36)
    expect(sc.white).toBe(45 + 7.5)
    expect(sc.winner).toBe(2)
  })
  it('兩邊都碰到的空地不算任何人的', () => {
    const sc = scoreGo(setup(['X.O......', '.........', '.........', '.........', '.........', '.........', '.........', '.........', '.........'], 1, 0))
    expect(sc.black).toBe(1)
    expect(sc.white).toBe(1)
  })
  it('死棋提掉之後算對方的地', () => {
    const rows = split.slice()
    rows[4] = '.O.XO....'
    const s = setup(rows)
    // 沒提掉時，黑的空地碰到白子，不算任何人的
    expect(scoreGo(s).black).toBe(9)
    const sc = scoreGo(s, [at(1, 4)])
    expect(sc.black).toBe(36)
  })
  it('自動判斷死棋：深入對方地盤的孤子是死的、自己的大塊是活的', () => {
    const rows = split.slice()
    rows[4] = '.O.XO....'
    rows[2] = '...XO..X.'
    const [dead] = estimateDead(setup(rows), seedRng(7), 120)
    expect(dead).toContain(at(1, 4))
    expect(dead).toContain(at(7, 2))
    expect(dead).not.toContain(at(3, 0))
    expect(dead).not.toContain(at(4, 0))
  })
})

describe('圍棋：AI', () => {
  it('能提子就提', () => {
    const s = setup(['.........', '....X....', '...XOX...', '.........', '.........', '.........', '.........', '.........', '.........'])
    expect(chooseGoMove(s, 'normal', seedRng(1))[0]).toEqual({ type: 'play', index: at(4, 3) })
  })
  it('自己被打吃會逃', () => {
    const s = setup(['.........', '....O....', '...OXO...', '.........', '.........', '.........', '.........', '.........', '.........'])
    expect(chooseGoMove(s, 'normal', seedRng(1))[0]).toEqual({ type: 'play', index: at(4, 3) })
  })
  it('不會填自己的眼', () => {
    const s = setup(['.X.X.....', 'XXXX.....', '.........', '.........', '.........', '.........', '.........', '.........', '.........'])
    for (let k = 0; k < 10; k++) {
      const [a] = chooseGoMove(s, 'easy', seedRng(k))
      if (a.type === 'play') expect([at(0, 0), at(2, 0)]).not.toContain(a.index)
    }
  })
  it('AI 對下 9×9 能正常下完，不會下出不合法的棋', () => {
    for (const [b, w] of [[0, 9], [15, 16], [2, 4]]) {
      let s = createGo({ size: 9 })
      let rng = seedRng(b * 31 + w)
      let guard = 0
      while (s.phase !== 'over' && guard++ < 400) {
        let a
        ;[a, rng] = chooseGoMove(s, PERSONAS[s.turn === 1 ? b : w].go, rng)
        s = must(s, a)
      }
      expect(s.phase).toBe('over')
      expect(legalMoves(s).length).toBeGreaterThanOrEqual(0)
    }
  })
  it('19×19 開局會下在三、四線', () => {
    const [a] = chooseGoMove(createGo(), 'normal', seedRng(3))
    expect(a.type).toBe('play')
    if (a.type === 'play') {
      const x = a.index % 19
      const y = Math.floor(a.index / 19)
      expect(Math.min(x, y, 18 - x, 18 - y)).toBeGreaterThanOrEqual(2)
    }
  })
})
