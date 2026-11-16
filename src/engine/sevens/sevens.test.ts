import { describe, expect, it } from 'vitest'
import { sevensAt } from '../common/difficulty'
import { PERSONAS } from '../common/personas'
import { seedRng, shuffle } from '../common/rng'
import { chooseSevensAction } from './ai'
import { applySevens, canPlay, createSevens, dealSevens, legalPlays, makeCard, penalties, SPADE_SEVEN, winners, type SevensAction, type SevensState } from './rules'

const C = (s: number, r: number) => makeCard(s, r)
function must(s: SevensState, a: SevensAction) {
  const r = applySevens(s, a)
  if (!r.ok) throw new Error(r.reason)
  return r.state
}

describe('排七：開局與接牌', () => {
  it('每人 13 張，拿黑桃 7 的人先出，第一手只能出黑桃 7', () => {
    const s = dealSevens(3)
    expect(s.hands.map((h) => h.length)).toEqual([13, 13, 13, 13])
    expect(s.hands[s.turn]).toContain(SPADE_SEVEN)
    expect(legalPlays(s)).toEqual([SPADE_SEVEN])
  })
  it('7 開了才能往上下一張一張接；別的花色要先出 7', () => {
    let s = createSevens([[SPADE_SEVEN, C(3, 5)], [C(3, 8), C(0, 8)], [C(0, 7), C(3, 6)], [C(1, 1), C(2, 13)]])
    expect(applySevens(s, { type: 'play', player: 0, card: C(3, 5) })).toEqual({ ok: false, reason: 'needSpadeSeven' })
    s = must(s, { type: 'play', player: 0, card: SPADE_SEVEN })
    expect(s.rows[3]).toEqual([7, 7])
    expect(canPlay(s, C(3, 8))).toBe(true)
    expect(canPlay(s, C(3, 6))).toBe(true)
    expect(canPlay(s, C(3, 5))).toBe(false)
    expect(canPlay(s, C(0, 8))).toBe(false)
    expect(canPlay(s, C(0, 7))).toBe(true)
    s = must(s, { type: 'play', player: 1, card: C(3, 8) })
    expect(s.rows[3]).toEqual([7, 8])
  })
  it('有牌可以接就不能蓋；沒牌可以接才能蓋', () => {
    let s = createSevens([[SPADE_SEVEN, C(1, 2)], [C(3, 8), C(0, 1)], [C(2, 13)], [C(1, 1)]])
    s = must(s, { type: 'play', player: 0, card: SPADE_SEVEN })
    expect(applySevens(s, { type: 'cover', player: 1, card: C(0, 1) })).toEqual({ ok: false, reason: 'mustPlay' })
    s = must(s, { type: 'play', player: 1, card: C(3, 8) })
    expect(legalPlays(s)).toEqual([])
    s = must(s, { type: 'cover', player: 2, card: C(2, 13) })
    expect(s.covered[2]).toEqual([C(2, 13)])
    expect(s.hands[2]).toEqual([])
  })
  it('出完的人輪到時直接跳過；大家都出完或蓋完就結束，罰分最少的贏', () => {
    let s = createSevens([[SPADE_SEVEN], [C(0, 1), C(0, 2)], [C(3, 8)], [C(1, 13)]])
    s = must(s, { type: 'play', player: 0, card: SPADE_SEVEN })
    s = must(s, { type: 'cover', player: 1, card: C(0, 2) })
    s = must(s, { type: 'play', player: 2, card: C(3, 8) })
    s = must(s, { type: 'cover', player: 3, card: C(1, 13) })
    expect(s.turn).toBe(1)
    s = must(s, { type: 'cover', player: 1, card: C(0, 1) })
    expect(s.over).toBe(true)
    expect(penalties(s)).toEqual([0, 3, 0, 13])
    expect(winners(s)).toEqual([0, 2])
  })
  it('時間到：有牌可接就幫你出一張，沒有就蓋點數最小的', () => {
    let s = createSevens([[SPADE_SEVEN, C(0, 9)], [C(0, 12), C(1, 3)], [C(3, 8)], [C(1, 13)]])
    s = must(s, { type: 'timeout', player: 0 })
    expect(s.rows[3]).toEqual([7, 7])
    s = must(s, { type: 'timeout', player: 1 })
    expect(s.covered[1]).toEqual([C(1, 3)])
  })
})

describe('排七：電腦', () => {
  it('每個難度、每位對手都能把一局正常打完，52 張牌一張不少', () => {
    for (let g = 0; g < 30; g++) {
      let s = dealSevens(g + 1)
      let rng = seedRng(g)
      for (let k = 0; k < 80 && !s.over; k++) {
        let a
        ;[a, rng] = chooseSevensAction(s, sevensAt(PERSONAS[(g + s.turn) % PERSONAS.length].bigtwo, g % 2 ? 'hard' : 'easy'), rng)
        s = must(s, a)
      }
      expect(s.over).toBe(true)
      const played = s.rows.reduce((t, r) => t + (r ? r[1] - r[0] + 1 : 0), 0)
      expect(played + s.covered.flat().length).toBe(52)
    }
  })
  it('電腦不偷看：別人的手牌打亂（張數不變），電腦的決定一模一樣', () => {
    for (let seed = 1; seed <= 40; seed++) {
      let s = dealSevens(seed)
      let rng = seedRng(seed)
      for (let k = 0; k < (seed % 20) + 4 && !s.over; k++) {
        let a
        ;[a, rng] = chooseSevensAction(s, sevensAt(PERSONAS[1].bigtwo, 'hard'), rng)
        s = must(s, a)
      }
      if (s.over) continue
      const me = s.turn
      const others = s.hands.flatMap((h, p) => (p === me ? [] : h))
      const [mixed] = shuffle(others, seedRng(seed * 9))
      let i = 0
      const hands = s.hands.map((h, p) => (p === me ? h : h.map(() => mixed[i++])))
      const st = sevensAt(PERSONAS[seed % 30].bigtwo, 'hard')
      expect(chooseSevensAction({ ...s, hands }, st, seedRng(5))[0]).toEqual(chooseSevensAction(s, st, seedRng(5))[0])
    }
  })
  it('困難比簡單強：困難的電腦罰分平均比較少', () => {
    let hard = 0
    let easy = 0
    for (let g = 0; g < 200; g++) {
      let s = dealSevens(1000 + g)
      let rng = seedRng(g)
      const hardSeat = g % 4
      while (!s.over) {
        let a
        ;[a, rng] = chooseSevensAction(s, sevensAt(PERSONAS[(g * 3 + s.turn) % 30].bigtwo, s.turn === hardSeat ? 'hard' : 'easy'), rng)
        s = must(s, a)
      }
      const pen = penalties(s)
      hard += pen[hardSeat]
      easy += (pen.reduce((t, v) => t + v, 0) - pen[hardSeat]) / 3
    }
    expect(hard).toBeLessThan(easy * 0.8)
  })
})
