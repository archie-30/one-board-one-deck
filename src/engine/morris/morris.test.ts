import { describe, expect, it } from 'vitest'
import { seedRng } from '@/engine/common/rng'
import { ADJ, applyMorris, createMorris, inMill, legalActions, MILLS, removable, targetsOf, wouldMill, type MorrisAction, type MorrisState } from './rules'
import { chooseMorrisAction, playOut } from './ai'

const apply = (s: MorrisState, a: MorrisAction) => {
  const r = applyMorris(s, a)
  if (!r.ok) throw new Error(r.reason)
  return r.state
}
/** 自己擺一個局面：reds、blues 是點的編號；hand 是手上還沒放的 */
function setup(reds: number[], blues: number[], hand: [number, number] = [0, 0], turn: 0 | 1 = 0, flying = true): MorrisState {
  const s = createMorris(flying)
  for (const p of reds) s.board[p] = 0
  for (const p of blues) s.board[p] = 1
  s.hand = hand
  s.turn = turn
  return s
}

describe('九子棋：棋盤', () => {
  it('24 個點、16 條線、每個點 2～4 個鄰居', () => {
    expect(MILLS.length).toBe(16)
    expect(ADJ.length).toBe(24)
    expect(ADJ.every((a) => a.length >= 2 && a.length <= 4)).toBe(true)
    expect([...ADJ[4]].sort((a, b) => a - b)).toEqual([1, 3, 5, 7])
    expect([...ADJ[0]].sort((a, b) => a - b)).toEqual([1, 9])
  })
})

describe('九子棋：放子', () => {
  it('輪流放子，每人 9 顆；放完才能走子', () => {
    let s = createMorris()
    s = apply(s, { type: 'place', to: 0 })
    expect(s.hand).toEqual([8, 9])
    expect(s.turn).toBe(1)
    expect(applyMorris(s, { type: 'place', to: 0 }).ok).toBe(false) // 有子了
    expect(applyMorris(s, { type: 'move', from: 0, to: 1 }).ok).toBe(false) // 還在放子
  })
  it('放下去成三就要拿走對方一顆；不拿不行', () => {
    const s = setup([0, 1], [9, 10], [7, 7])
    expect(wouldMill(s, -1, 2)).toBe(true)
    expect(applyMorris(s, { type: 'place', to: 2 }).ok).toBe(false)
    const t = apply(s, { type: 'place', to: 2, remove: 9 })
    expect(t.board[9]).toBe(-1)
    expect(t.last).toMatchObject({ side: 0, to: 2, removed: 9 })
  })
  it('沒成三不能拿子', () => {
    const s = setup([0], [9], [8, 8])
    expect(applyMorris(s, { type: 'place', to: 5, remove: 9 }).ok).toBe(false)
  })
  it('對方在成三裡的子不能拿，除非全部都在成三裡', () => {
    // 藍：0,1,2 成三、還有 9；紅放 22 成三（21,22,23）
    const s = setup([21, 23], [0, 1, 2, 9], [5, 5])
    expect(removable(s.board, 1)).toEqual([9])
    expect(applyMorris(s, { type: 'place', to: 22, remove: 0 }).ok).toBe(false)
    const all = setup([21, 23], [0, 1, 2], [5, 5])
    expect(removable(all.board, 1)).toEqual([0, 1, 2])
  })
})

describe('九子棋：走子、飛子、輸贏', () => {
  it('沿著線走到相鄰的空點', () => {
    const s = setup([0, 4, 6, 9], [14, 20, 22, 23])
    expect(targetsOf(s, 0).sort()).toEqual([1])
    expect(applyMorris(s, { type: 'move', from: 0, to: 2 }).ok).toBe(false)
    const t = apply(s, { type: 'move', from: 0, to: 1 })
    expect(t.board[1]).toBe(0)
    expect(t.board[0]).toBe(-1)
  })
  it('走子成三一樣拿子；拿到對方只剩兩顆就贏', () => {
    // 紅 0、2 在上面一排，4 走到 1 成三；藍只剩 3 顆
    const s = setup([0, 2, 4], [14, 20, 22])
    const t = apply(s, { type: 'move', from: 4, to: 1, remove: 14 })
    expect(t.status).toBe('done')
    expect(t.winner).toBe(0)
    expect(t.reason).toBe('pieces')
  })
  it('只剩 3 顆可以飛到任何空點（飛子規則關掉就不行）', () => {
    const s = setup([0, 4, 6, 9], [14, 20, 22], [0, 0], 1)
    expect(targetsOf(s, 14).length).toBe(24 - 7)
    const off = setup([0, 4, 6, 9], [14, 20, 22], [0, 0], 1, false)
    expect(targetsOf(off, 14).sort((a, b) => a - b)).toEqual([2, 13, 23])
  })
  it('輪到的人被堵死、完全沒步可走就輸', () => {
    // 藍在 0、21、22、23；紅走一步（10→11 後 19、14、9、1 都還在），藍就沒步可走
    const blocked = setup([1, 9, 14, 19, 10], [0, 21, 22, 23], [0, 0], 0, false)
    expect(blocked.board[22]).toBe(1)
    const t = apply(blocked, { type: 'move', from: 10, to: 11 })
    // 21 的鄰居 9、22；22 的鄰居 19、21、23；23 的鄰居 14、22：全被佔 → 藍輸
    expect(t.status).toBe('done')
    expect(t.winner).toBe(0)
    expect(t.reason).toBe('blocked')
  })
  it('放完子後連續 60 步沒人拿子就和棋', () => {
    let s = setup([0, 4, 6, 9], [14, 20, 22, 23])
    s.quiet = 59
    s = apply(s, { type: 'move', from: 0, to: 1 })
    expect(s.status).toBe('done')
    expect(s.winner).toBe(null)
    expect(s.reason).toBe('quiet')
  })
  it('時間到＝跳過換對方；認輸', () => {
    let s = createMorris()
    s = apply(s, { type: 'timeout' })
    expect(s.turn).toBe(1)
    expect(s.hand).toEqual([9, 9])
    s = apply(s, { type: 'resign', side: 1 })
    expect(s.winner).toBe(0)
  })
  it('成三的步每一種拿法各算一步', () => {
    const s = setup([0, 1], [9, 10, 14], [7, 6])
    const millMoves = legalActions(s).filter((a) => a.type === 'place' && a.to === 2)
    expect(millMoves.length).toBe(3)
    expect(inMill(apply(s, millMoves[0]).board, 2)).toBe(true)
  })
})

describe('九子棋：電腦', () => {
  it('能成三就成三、拿子', () => {
    const s = setup([0, 1], [9, 10], [7, 7])
    for (const lv of ['mid', 'high', 'master'] as const) {
      const [a] = chooseMorrisAction(s, lv, seedRng(1))
      expect(a).toMatchObject({ type: 'place', to: 2 })
    }
  })
  it('對方差一顆成三時會擋', () => {
    const s = setup([9], [0, 1], [8, 7], 0)
    for (const lv of ['high', 'master'] as const) expect(chooseMorrisAction(s, lv, seedRng(2))[0]).toMatchObject({ type: 'place', to: 2 })
  })
  it('電腦一定下合法的步，下得完（中對低）', () => {
    const [end] = playOut(createMorris(), ['mid', 'low'], seedRng(5))
    expect(end.status).toBe('done')
  })
  it('難度一級比一級強（10 局）', () => {
    const duel = (a: 'low' | 'mid' | 'high', b: 'low' | 'mid' | 'high') => {
      let wins = 0
      let losses = 0
      for (let g = 0; g < 10; g++) {
        const aFirst = g % 2 === 0
        const [end] = playOut(createMorris(), aFirst ? [a, b] : [b, a], seedRng(g * 977 + 13))
        if (end.winner === null) continue
        if ((end.winner === 0) === aFirst) wins++
        else losses++
      }
      return wins - losses
    }
    expect(duel('mid', 'low')).toBeGreaterThanOrEqual(4)
    expect(duel('high', 'mid')).toBeGreaterThanOrEqual(4)
  }, 60000)
})
