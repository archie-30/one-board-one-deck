import { describe, expect, it } from 'vitest'
import { parseCard, parseCards } from '../bigtwo/cards'
import { PERSONAS } from '../common/personas'
import { seedRng } from '../common/rng'
import { chooseRedPointAction } from './ai'
import { applyRedPoint, cardPoints, createRedPoint, dealRedPoint, faceOf, matches, scoreRedPoint, targetsFor, winners, type RedPointState } from './rules'

const C = parseCard
const must = (s: RedPointState, a: Parameters<typeof applyRedPoint>[1]) => {
  const r = applyRedPoint(s, a)
  if (!r.ok) throw new Error(r.reason)
  return r.state
}

describe('撿紅點：配對與計分', () => {
  it('A～9 兩張加起來等於 10 才配得到', () => {
    expect(matches(C('SA'), C('H9'))).toBe(true)
    expect(matches(C('C2'), C('D8'))).toBe(true)
    expect(matches(C('H5'), C('S5'))).toBe(true)
    expect(matches(C('H4'), C('S5'))).toBe(false)
    expect(matches(C('HA'), C('SA'))).toBe(false)
  })
  it('10、J、Q、K 只能配同點數', () => {
    expect(matches(C('H10'), C('S10'))).toBe(true)
    expect(matches(C('HJ'), C('CJ'))).toBe(true)
    expect(matches(C('HJ'), C('CQ'))).toBe(false)
    expect(matches(C('H10'), C('SK'))).toBe(false)
    expect(matches(C('SK'), C('C3'))).toBe(false)
  })
  it('牌面數字對應正確', () => {
    expect([C('SA'), C('S2'), C('S9'), C('S10'), C('SJ'), C('SK')].map(faceOf)).toEqual([1, 2, 9, 10, 11, 13])
  })
  it('只算紅牌：A 20、2～9 照點數、10～K 10；全副 208 分', () => {
    expect(cardPoints(C('HA'))).toBe(20)
    expect(cardPoints(C('D7'))).toBe(7)
    expect(cardPoints(C('HQ'))).toBe(10)
    expect(cardPoints(C('SA'))).toBe(0)
    expect(cardPoints(C('C9'))).toBe(0)
    let total = 0
    for (let c = 0; c < 52; c++) total += cardPoints(c)
    expect(total).toBe(208)
  })
})

describe('撿紅點：發牌與流程', () => {
  it('每人 6 張、桌上 4 張、牌堆 24 張，同 seed 同結果', () => {
    const s = dealRedPoint(99)
    expect(s.hands.map((h) => h.length)).toEqual([6, 6, 6, 6])
    expect(s.table).toHaveLength(4)
    expect(s.pile).toHaveLength(24)
    expect(new Set([...s.hands.flat(), ...s.table, ...s.pile]).size).toBe(52)
    expect(dealRedPoint(99)).toEqual(s)
    expect(JSON.parse(JSON.stringify(s))).toEqual(s)
  })

  const game = () => createRedPoint([parseCards('H3 SK'), parseCards('C2'), parseCards('D9'), parseCards('S4')], parseCards('S7 D7 H6 C5'), parseCards('D5 HK SA C8'))

  it('配得到一張就自動吃，兩張一起收回來', () => {
    const s = must(createRedPoint([parseCards('H3'), [], [], []], parseCards('S7 C5'), parseCards('D5')), { type: 'play', player: 0, card: C('H3') })
    expect(s.captured[0].sort()).toEqual([C('H3'), C('S7')].sort())
    expect(s.table).toEqual([C('C5')])
    expect(s.phase).toBe('flip')
  })
  it('配得到兩張以上要自己選，選錯不行', () => {
    const s = game()
    expect(applyRedPoint(s, { type: 'play', player: 0, card: C('H3') })).toEqual({ ok: false, reason: 'chooseTarget' })
    expect(applyRedPoint(s, { type: 'play', player: 0, card: C('H3'), target: C('H6') })).toEqual({ ok: false, reason: 'badTarget' })
    const t = must(s, { type: 'play', player: 0, card: C('H3'), target: C('D7') })
    expect(t.captured[0]).toContain(C('D7'))
    expect(t.table).toContain(C('S7'))
  })
  it('配不到就留在桌上', () => {
    const s = must(game(), { type: 'play', player: 0, card: C('SK') })
    expect(s.table).toContain(C('SK'))
    expect(s.captured[0]).toEqual([])
  })
  it('出牌後要翻牌，翻完才換下一位；翻到能配的也一起收回', () => {
    let s = must(game(), { type: 'play', player: 0, card: C('SK') })
    expect(applyRedPoint(s, { type: 'play', player: 0, card: C('H3'), target: C('D7') })).toEqual({ ok: false, reason: 'wrongPhase' })
    s = must(s, { type: 'flip', player: 0 })
    expect(s.captured[0].sort()).toEqual([C('D5'), C('C5')].sort())
    expect(s.turn).toBe(1)
    expect(s.phase).toBe('play')
    expect(applyRedPoint(s, { type: 'play', player: 0, card: C('H3') })).toEqual({ ok: false, reason: 'notYourTurn' })
  })
  it('不在手上的牌不能出', () => {
    expect(applyRedPoint(game(), { type: 'play', player: 0, card: C('C2') })).toEqual({ ok: false, reason: 'notInHand' })
  })
  it('手牌出完、牌堆翻完就結束，分數最高的人贏', () => {
    let s = createRedPoint([parseCards('HA'), parseCards('C2'), [], []], parseCards('H9 S3'), parseCards('D8 S4'))
    s = must(s, { type: 'play', player: 0, card: C('HA') })
    s = must(s, { type: 'flip', player: 0 })
    s = must(s, { type: 'play', player: 1, card: C('C2') })
    s = must(s, { type: 'flip', player: 1 })
    expect(s.phase).toBe('over')
    const sc = scoreRedPoint(s)
    expect(sc[0].points).toBe(20 + 9)
    expect(sc[1].points).toBe(8)
    expect(winners(s)).toEqual([0])
    expect(applyRedPoint(s, { type: 'flip', player: 1 })).toEqual({ ok: false, reason: 'over' })
  })
  it('targetsFor 列出可以配的桌上牌', () => {
    expect(targetsFor(game(), C('H3')).sort()).toEqual([C('S7'), C('D7')].sort())
  })
})

describe('撿紅點：AI', () => {
  it('能吃大分就吃', () => {
    const s = createRedPoint([parseCards('S9 C4'), [], [], []], parseCards('HA S3'), parseCards('D2'))
    const [a] = chooseRedPointAction(s, 'normal', seedRng(1))
    expect(a).toEqual({ type: 'play', player: 0, card: C('S9'), target: C('HA') })
  })
  it('20 位對手都能把一局正常打完，總分 208', () => {
    for (let p = 0; p < 20; p++) {
      let s = dealRedPoint(p * 17 + 3)
      let rng = seedRng(p)
      let guard = 0
      while (s.phase !== 'over' && guard++ < 200) {
        let a
        ;[a, rng] = chooseRedPointAction(s, PERSONAS[(p + s.turn * 5) % 20].redpoint, rng)
        s = must(s, a)
      }
      expect(s.phase).toBe('over')
      expect(scoreRedPoint(s).reduce((t, x) => t + x.points, 0) + s.table.reduce((t, c) => t + cardPoints(c), 0)).toBe(208)
    }
  })
  it('會算的人平均分數比較高', () => {
    let pro = 0
    let novice = 0
    for (let seed = 1; seed <= 80; seed++) {
      let s = dealRedPoint(seed)
      let rng = seedRng(seed)
      while (s.phase !== 'over') {
        let a
        ;[a, rng] = chooseRedPointAction(s, PERSONAS[s.turn % 2 ? 16 : 15].redpoint, rng)
        s = must(s, a)
      }
      const sc = scoreRedPoint(s)
      pro += sc[0].points + sc[2].points
      novice += sc[1].points + sc[3].points
    }
    expect(pro).toBeGreaterThan(novice)
  })
})
