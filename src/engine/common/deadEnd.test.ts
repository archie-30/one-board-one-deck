import { describe, expect, it } from 'vitest'
import { nextInt, seedRng, type RngState } from './rng'
import { provedDeadEnd } from './deadEnd'
import { dealWinnable } from '../solitaire/solver'
import { isDeadEnd as solDead } from '../solitaire/rules'
import { applySpider, dealSpider, isDeadEnd as spiderDead, isStuck as spiderStuck, type SpiderAction, type SpiderState } from '../spider/rules'
import { applyFreeCell, dealFreeCell, isDeadEnd as fcDead, isStuck as fcStuck, type FreeCellAction, type FreeCellState } from '../freecell/rules'

/** 隨便亂走 n 步（只走合法的），走到沒步為止 */
function wander<S, A>(s: S, rng: RngState, n: number, all: (s: S) => A[], apply: (s: S, a: A) => S | null): [S, RngState] {
  for (let k = 0; k < n; k++) {
    const ok = all(s).map((a) => apply(s, a)).filter((t): t is S => !!t)
    if (!ok.length) break
    let i
    ;[i, rng] = nextInt(rng, ok.length)
    s = ok[i]
  }
  return [s, rng]
}
const fcMoves = (s: FreeCellState): FreeCellAction[] => {
  const o: FreeCellAction[] = []
  const srcs: FreeCellAction['from'][] = []
  s.cells.forEach((c, slot) => c !== null && srcs.push({ pile: 'cell', slot }))
  s.tableau.forEach((c, col) => c.forEach((_, index) => srcs.push({ pile: 'tableau', col, index })))
  for (const from of srcs) {
    for (let slot = 0; slot < 4; slot++) o.push({ type: 'move', from, to: { pile: 'foundation', slot } }, { type: 'move', from, to: { pile: 'cell', slot } })
    for (let col = 0; col < 8; col++) o.push({ type: 'move', from, to: { pile: 'tableau', col } })
  }
  return o
}
const spMoves = (s: SpiderState): SpiderAction[] => {
  const o: SpiderAction[] = s.stock.length ? [{ type: 'deal' }] : []
  s.tableau.forEach((c, i) => c.up.forEach((_, k) => { for (let j = 0; j < 10; j++) o.push({ type: 'move', from: { col: i, index: k }, to: { col: j } }) }))
  return o
}

describe('卡關：電腦算過確定過不了關', () => {
  it('走不完的就說不準：預算用完不算卡關', () => {
    // 一條無限長的路（每一步都是新局面）：預算 50 用完就回傳「沒卡關」
    expect(provedDeadEnd(0, { key: String, moves: () => [1], apply: (s: number, a: number) => s + a, done: () => false }, 50)).toBe(false)
    // 走得完、也沒有終點：卡關
    expect(provedDeadEnd(0, { key: String, moves: (s: number) => (s < 10 ? [1] : []), apply: (s: number, a: number) => s + a, done: () => false }, 50)).toBe(true)
    // 走得到終點：不是卡關
    expect(provedDeadEnd(0, { key: String, moves: (s: number) => (s < 10 ? [1] : []), apply: (s: number, a: number) => s + a, done: (s: number) => s === 10 }, 50)).toBe(false)
  })

  it('接龍：保證解得開的新牌局不會被說成卡關', () => {
    for (let seed = 1; seed <= 3; seed++) {
      const [s] = dealWinnable(seedRng(seed), 1)
      expect(solDead(s)).toBe(false)
    }
  })

  it('新接龍：還有步可走、但怎麼走都過不了關的局面也抓得到（以前只有「完全沒步」才算）', () => {
    let found = 0
    for (let seed = 1; seed <= 12 && found < 2; seed++) {
      let [s, rng] = dealFreeCell(seedRng(seed))
      ;[s, rng] = wander(s, rng, 120, fcMoves, (t, a) => {
        const r = applyFreeCell(t, a)
        return r.ok ? r.state : null
      })
      if (fcDead(s) && !fcStuck(s)) found++
    }
    expect(found).toBeGreaterThan(0)
  })

  it('蜘蛛接龍：牌堆發完、只剩來回搬的局面算卡關', () => {
    let found = 0
    for (let seed = 1; seed <= 12 && found < 2; seed++) {
      let [s, rng] = dealSpider(seedRng(seed), 2)
      ;[s, rng] = wander(s, rng, 200, spMoves, (t, a) => {
        const r = applySpider(t, a)
        return r.ok ? r.state : null
      })
      if (spiderDead(s) && !spiderStuck(s)) found++
    }
    expect(found).toBeGreaterThan(0)
  })
})
