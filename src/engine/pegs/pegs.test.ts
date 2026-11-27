import { describe, expect, it } from 'vitest'
import { applyPegs, CENTER, createPegs, fromPegs, HOLES, isHole, isPerfect, jumpsFrom, legalMoves, remaining, type PegsMove, type PegsState } from './rules'

const apply = (s: PegsState, m: PegsMove) => {
  const r = applyPegs(s, m)
  if (!r.ok) throw new Error(r.reason)
  return r.state
}
const at = (r: number, c: number) => r * 7 + c

/** 找一組解（深度優先、走過的局面不再走）：測試用，確定開局解得開、剩在正中間 */
function solve(s: PegsState): PegsMove[] | null {
  const seen = new Set<string>()
  const path: PegsMove[] = []
  const go = (st: PegsState): boolean => {
    if (st.status === 'won') return st.pegs[CENTER]
    if (st.status !== 'playing') return false
    const key = st.pegs.map((p) => (p ? 1 : 0)).join('')
    if (seen.has(key)) return false
    seen.add(key)
    for (const m of legalMoves(st)) {
      path.push(m)
      if (go(apply(st, m))) return true
      path.pop()
    }
    return false
  }
  return go(s) ? path : null
}

describe('孔明棋', () => {
  it('33 個孔、開局 32 顆、正中間空著', () => {
    expect(HOLES.length).toBe(33)
    expect(isHole(0)).toBe(false)
    expect(isHole(CENTER)).toBe(true)
    const s = createPegs()
    expect(remaining(s)).toBe(32)
    expect(s.pegs[CENTER]).toBe(false)
    expect(legalMoves(s).length).toBe(4)
  })
  it('跳過旁邊一顆落到空孔，被跳過的拿掉', () => {
    const s = createPegs()
    const t = apply(s, { from: at(1, 3), to: CENTER })
    expect(t.pegs[CENTER]).toBe(true)
    expect(t.pegs[at(2, 3)]).toBe(false)
    expect(t.pegs[at(1, 3)]).toBe(false)
    expect(t.moves).toBe(1)
    expect(t.last).toEqual({ from: at(1, 3), over: at(2, 3), to: CENTER })
  })
  it('不能斜跳、不能跳到有子的孔、不能跳過空孔、不能跳出棋盤', () => {
    const s = createPegs()
    // 斜的不行：(2,2) 斜跳過 (3,3) 到 (4,4)
    expect(jumpsFrom(fromPegs([at(2, 2), at(3, 3)]), at(2, 2))).toEqual([])
    expect(applyPegs(s, { from: at(3, 1), to: at(3, 3) }).ok).toBe(true)
    expect(applyPegs(s, { from: at(3, 0), to: at(3, 2) }).ok).toBe(false) // 落點有子
    const lone = fromPegs([at(3, 3), at(0, 3)])
    expect(jumpsFrom(lone, at(0, 3))).toEqual([]) // 中間空的
    expect(jumpsFrom(fromPegs([at(2, 0), at(3, 0), at(5, 3)]), at(3, 0))).toEqual([]) // 往上跳到 (1,0) 不是孔
  })
  it('剩一顆過關；在正中間是完美；沒步可走就結束', () => {
    const win = apply(fromPegs([at(3, 1), at(3, 2)]), { from: at(3, 1), to: at(3, 3) })
    expect(win.status).toBe('won')
    expect(isPerfect(win)).toBe(true)
    const side = apply(fromPegs([at(3, 3), at(3, 4)]), { from: at(3, 3), to: at(3, 5) })
    expect(side.status).toBe('won')
    expect(isPerfect(side)).toBe(false)
    const stuck = fromPegs([at(0, 2), at(6, 4)])
    expect(stuck.status).toBe('stuck')
    expect(applyPegs(stuck, { from: at(0, 2), to: at(2, 2) }).ok).toBe(false)
  })
  it('開局解得開，最後剩一顆在正中間', () => {
    const path = solve(createPegs())
    expect(path).not.toBe(null)
    expect(path!.length).toBe(31)
    let s = createPegs()
    for (const m of path!) s = apply(s, m)
    expect(isPerfect(s)).toBe(true)
  }, 60000)
})
