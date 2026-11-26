import { describe, expect, it } from 'vitest'
import { fullDeck, parseCard as P } from '@/engine/bigtwo/cards'
import { seedRng } from '@/engine/common/rng'
import {
  applyPyramid,
  canRemove,
  coveredBy,
  createPyramid,
  dealPyramid,
  exposed,
  isDeadEnd,
  isStuck,
  partnerFor,
  PYRAMID,
  scoreOf,
  timeBonus,
  undoTo,
  type PyramidAction,
  type PyramidState,
} from './rules'
import { dealWinnable, solvePyramid } from './solver'

const apply = (s: PyramidState, a: PyramidAction) => {
  const r = applyPyramid(s, a)
  if (!r.ok) throw new Error(r.reason)
  return r.state
}
/** 自己擺一個局面：金字塔、牌堆（最後一張在最上面）、翻牌堆 */
function make(pyr: (string | null)[], stock: string[] = [], waste: string[] = [], recyclesLeft = 0): PyramidState {
  const pyramid = Array.from({ length: PYRAMID }, (_, i) => (pyr[i] === undefined || pyr[i] === null ? null : P(pyr[i]!)))
  return { pyramid, stock: stock.map(P), waste: waste.map(P), gone: [], recyclesLeft, score: 0, moves: 0, penalty: 0, won: false }
}

describe('金字塔接龍：發牌', () => {
  it('金字塔 28 張、牌堆 24 張，整副牌一張不少', () => {
    const [s] = dealPyramid(seedRng(3), 'easy')
    expect(s.pyramid.length).toBe(28)
    expect(s.stock.length).toBe(24)
    expect([...s.pyramid, ...s.stock].map(Number).sort((a, b) => a - b)).toEqual(fullDeck().slice().sort((a, b) => a - b))
  })
  it('一開始只有最下面一排（7 張）露出來', () => {
    const [s] = dealPyramid(seedRng(5), 'hard')
    const open = s.pyramid.map((_, i) => exposed(s, i)).filter(Boolean).length
    expect(open).toBe(7)
    expect(coveredBy(0)).toEqual([1, 2])
    expect(coveredBy(27)).toEqual([])
  })
  it('簡單不限重翻、困難只能重翻 2 次', () => {
    expect(dealPyramid(seedRng(1), 'easy')[0].recyclesLeft).toBe(-1)
    expect(dealPyramid(seedRng(1), 'hard')[0].recyclesLeft).toBe(2)
  })
})

describe('金字塔接龍：拿牌', () => {
  // 最下面一排是第 21～27 格
  const bottom = (cards: string[]) => {
    const p: (string | null)[] = Array(PYRAMID).fill('C2')
    cards.forEach((c, k) => (p[21 + k] = c))
    return p
  }
  it('兩張露出來的牌加起來 13 才能拿走', () => {
    const s = make(bottom(['S6', 'H7', 'D9', 'C4', 'S2', 'H3', 'D5']))
    expect(canRemove(s, [{ pile: 'pyramid', i: 21 }, { pile: 'pyramid', i: 22 }])).toBe(true)
    expect(canRemove(s, [{ pile: 'pyramid', i: 21 }, { pile: 'pyramid', i: 23 }])).toBe(false)
    // 被壓住的牌不能拿
    expect(canRemove(s, [{ pile: 'pyramid', i: 15 }, { pile: 'pyramid', i: 22 }])).toBe(false)
  })
  it('K 自己一張就能拿；Q 配 A、J 配 2', () => {
    const s = make(bottom(['SK', 'HQ', 'DA', 'CJ', 'S2', 'H3', 'D5']))
    expect(canRemove(s, [{ pile: 'pyramid', i: 21 }])).toBe(true)
    expect(canRemove(s, [{ pile: 'pyramid', i: 22 }, { pile: 'pyramid', i: 23 }])).toBe(true)
    expect(canRemove(s, [{ pile: 'pyramid', i: 24 }, { pile: 'pyramid', i: 25 }])).toBe(true)
    expect(canRemove(s, [{ pile: 'pyramid', i: 22 }])).toBe(false)
  })
  it('拿走下面兩張，上面那張才露出來', () => {
    let s = make(bottom(['S6', 'H7', 'D9', 'C4', 'S2', 'H3', 'D5']))
    expect(exposed(s, 15)).toBe(false)
    s = apply(s, { type: 'remove', spots: [{ pile: 'pyramid', i: 21 }, { pile: 'pyramid', i: 22 }] })
    expect(exposed(s, 15)).toBe(true)
    expect(s.gone.length).toBe(2)
    expect(scoreOf(s)).toBe(10)
  })
  it('翻牌堆最上面那張可以跟金字塔配', () => {
    let s = make(bottom(['S6', 'H8', 'D9', 'C4', 'S2', 'H3', 'D10']), ['H7'], [])
    s = apply(s, { type: 'draw' })
    expect(s.waste.length).toBe(1)
    s = apply(s, { type: 'remove', spots: [{ pile: 'pyramid', i: 21 }, { pile: 'waste' }] })
    expect(s.waste.length).toBe(0)
    expect(s.pyramid[21]).toBe(null)
  })
  it('清空一整排多 25 分；28 張都拿完就過關', () => {
    const p: (string | null)[] = Array(PYRAMID).fill(null)
    p[0] = 'SK'
    let s = make(p)
    s = apply(s, { type: 'remove', spots: [{ pile: 'pyramid', i: 0 }] })
    expect(s.won).toBe(true)
    expect(s.score).toBe(5 + 25)
  })
  it('點一下找配對：K 自己、其他找加起來 13 的（金字塔優先）', () => {
    const s = make(bottom(['SK', 'HQ', 'DA', 'CJ', 'S2', 'H3', 'D5']), [], ['CA'])
    expect(partnerFor(s, { pile: 'pyramid', i: 21 })).toEqual([{ pile: 'pyramid', i: 21 }])
    expect(partnerFor(s, { pile: 'pyramid', i: 22 })).toEqual([{ pile: 'pyramid', i: 22 }, { pile: 'pyramid', i: 23 }])
    expect(partnerFor(s, { pile: 'pyramid', i: 27 })).toBe(null)
  })
})

describe('金字塔接龍：牌堆、重翻、返回、卡關', () => {
  it('牌堆翻完照順序重翻；困難重翻 2 次後就不能再翻', () => {
    let s = make(Array(PYRAMID).fill('C2'), ['S3', 'S4'], [], 2)
    s = apply(apply(s, { type: 'draw' }), { type: 'draw' })
    expect(s.stock.length).toBe(0)
    s = apply(s, { type: 'draw' }) // 重翻
    expect(s.recyclesLeft).toBe(1)
    // 翻出來的順序是 4、3，翻回去後 4 又在最上面
    expect(s.stock).toEqual([P('S3'), P('S4')])
    s = apply(apply(s, { type: 'draw' }), { type: 'draw' })
    s = apply(s, { type: 'draw' })
    expect(s.recyclesLeft).toBe(0)
    s = apply(apply(s, { type: 'draw' }), { type: 'draw' })
    expect(applyPyramid(s, { type: 'draw' }).ok).toBe(false)
  })
  it('簡單（-1）不限重翻', () => {
    let s = make(Array(PYRAMID).fill('C2'), ['S3'], [], -1)
    for (let k = 0; k < 10; k++) s = apply(s, { type: 'draw' })
    expect(s.recyclesLeft).toBe(-1)
  })
  it('快速過關獎勵：30 秒以上才給，越快越多', () => {
    expect(timeBonus(20)).toBe(0)
    expect(timeBonus(60)).toBe(500)
    expect(timeBonus(120)).toBe(250)
  })
  it('返回扣 5 分、步數照算', () => {
    const s0 = make(Array(PYRAMID).fill('C2'), ['S3'], [], 0)
    const s1 = apply(s0, { type: 'draw' })
    const back = undoTo(s0, s1)
    expect(back.waste.length).toBe(0)
    expect(back.penalty).toBe(5)
    expect(back.moves).toBe(2)
  })
  it('沒牌可拿、牌堆也翻不了＝卡關', () => {
    const s = make(Array(PYRAMID).fill('C2'), [], ['S3'], 0)
    expect(isStuck(s)).toBe(true)
    expect(isDeadEnd(s)).toBe(true)
  })
  it('還能翻牌但怎麼翻都配不到：電腦算得出是死路', () => {
    const s = make(Array(PYRAMID).fill('C2'), ['S3', 'S4'], [], 1)
    expect(isStuck(s)).toBe(false)
    expect(isDeadEnd(s)).toBe(true)
  })
})

describe('金字塔接龍：保證有解', () => {
  it('發出來的牌電腦照解法真的能過關（簡單、困難各 6 副）', () => {
    for (const level of ['easy', 'hard'] as const) {
      for (let seed = 1; seed <= 6; seed++) {
        const [s] = dealWinnable(seedRng(seed * 101 + 7), level)
        const path = solvePyramid(s)
        expect(path).not.toBeNull()
        let t = s
        for (const a of path!) t = apply(t, a)
        expect(t.won).toBe(true)
      }
    }
  })
  it('同一個亂數種子發出一樣的牌', () => {
    const a = dealWinnable(seedRng(42), 'hard')[0]
    const b = dealWinnable(seedRng(42), 'hard')[0]
    expect(a.pyramid).toEqual(b.pyramid)
    expect(a.stock).toEqual(b.stock)
  })
  it('剛發的牌不會被說成卡關', () => {
    const [s] = dealWinnable(seedRng(9), 'easy')
    expect(isDeadEnd(s)).toBe(false)
  })
  it('createPyramid：前 28 張是金字塔', () => {
    const deck = fullDeck()
    const s = createPyramid(deck, 'easy')
    expect(s.pyramid).toEqual(deck.slice(0, 28))
  })
})
