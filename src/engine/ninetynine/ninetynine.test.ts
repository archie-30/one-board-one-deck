import { describe, expect, it } from 'vitest'
import { ninetyNineAt, type CardLevel } from '../common/difficulty'
import { PERSONAS } from '../common/personas'
import { seedRng, shuffle } from '../common/rng'
import { chooseNinetyNineAction } from './ai'
import { applyNinetyNine, canPlay, createNinetyNine, dealNinetyNine, legalCards, mustOut, ranks, SPADE_ACE, timeoutPlay, totalAfter, winners, makeCard, type NinetyNineAction, type NinetyNineState } from './rules'

const C = (s: number, r: number) => makeCard(s, r)
function must(s: NinetyNineState, a: NinetyNineAction) {
  const r = applyNinetyNine(s, a)
  if (!r.ok) throw new Error(r.reason)
  return r.state
}
const play = (player: number, card: number, extra: { minus?: boolean; target?: number } = {}): NinetyNineAction => ({ type: 'play', player, card, ...extra })

describe('九九：發牌與出牌', () => {
  it('每人 5 張、牌堆 32 張、總數從 0 開始；同一個 seed 發一樣的牌', () => {
    const s = dealNinetyNine(5)
    expect(s.hands.map((h) => h.length)).toEqual([5, 5, 5, 5])
    expect(s.deck.length).toBe(32)
    expect(s.total).toBe(0)
    expect(dealNinetyNine(5)).toEqual(s)
  })
  it('數字牌照點數加、出完補一張；超過 99 不能出', () => {
    let s = createNinetyNine([[C(0, 9), C(0, 2)], [C(1, 3)], [C(1, 6)], [C(1, 7)]], [C(2, 8), C(2, 2)], 0, 90)
    expect(canPlay(s.total, C(0, 9))).toBe(true)
    expect(applyNinetyNine({ ...s, total: 91 }, play(0, C(0, 9)))).toEqual({ ok: false, reason: 'tooBig' })
    s = must(s, play(0, C(0, 9)))
    expect(s.total).toBe(99)
    expect(s.hands[0]).toEqual([C(0, 2), C(2, 8)])
    expect(s.deck).toEqual([C(2, 2)])
    expect(s.turn).toBe(1)
  })
  it('功能牌：K 變 99、黑桃 A 歸零、10／Q 加減（最少到 0）、J 不變', () => {
    expect(totalAfter(50, C(0, 13))).toBe(99)
    expect(totalAfter(98, SPADE_ACE)).toBe(0)
    expect(totalAfter(50, C(0, 1))).toBe(51) // 別的 A 算 1
    expect(totalAfter(95, C(0, 10), true)).toBe(85)
    expect(totalAfter(5, C(0, 12), true)).toBe(0)
    expect(totalAfter(70, C(0, 12))).toBe(90)
    expect(totalAfter(98, C(0, 11))).toBe(98)
    expect(canPlay(95, C(0, 10))).toBe(false)
    expect(canPlay(95, C(0, 10), true)).toBe(true)
  })
  it('4 迴轉換方向；5 指定下一個人（不能指定自己或出局的人）', () => {
    let s = createNinetyNine([[C(0, 4), C(0, 5)], [C(1, 4)], [C(1, 6)], [C(1, 7)]], [], 0)
    s = must(s, play(0, C(0, 4)))
    expect(s.dir).toBe(-1)
    expect(s.turn).toBe(3)
    const t = createNinetyNine([[C(0, 5)], [C(1, 2)], [C(1, 6)], [C(1, 7)]], [], 0)
    expect(applyNinetyNine(t, play(0, C(0, 5), { target: 0 }))).toEqual({ ok: false, reason: 'badTarget' })
    expect(applyNinetyNine({ ...t, alive: [true, true, false, true] }, play(0, C(0, 5), { target: 2 }))).toEqual({ ok: false, reason: 'badTarget' })
    expect(must(t, play(0, C(0, 5), { target: 2 })).turn).toBe(2)
  })
  it('手上全是會超過的數字牌就只能爆：爆的人出局、牌攤開，剩一個人就結束', () => {
    let s = createNinetyNine([[C(0, 9)], [C(1, 3), C(1, 2)], [C(1, 6)], [C(1, 7)]], [], 1, 98)
    expect(mustOut(s)).toBe(true)
    expect(applyNinetyNine(s, play(1, C(1, 3)))).toEqual({ ok: false, reason: 'tooBig' })
    s = must(s, { type: 'out', player: 1 })
    expect(s.alive).toEqual([true, false, true, true])
    expect(s.lastMove).toEqual({ type: 'out', player: 1, cards: [C(1, 2), C(1, 3)] })
    expect(s.turn).toBe(2)
    // 有牌能出不能爆
    expect(applyNinetyNine({ ...s, total: 10 }, { type: 'out', player: 2 })).toEqual({ ok: false, reason: 'canPlay' })
    s = must(s, { type: 'out', player: 2 })
    s = must(s, { type: 'out', player: 3 })
    expect(s.over).toBe(true)
    expect(winners(s)).toEqual([0])
    expect(ranks(s)).toEqual([1, 4, 3, 2])
  })
  it('出局的人之後都跳過；只剩兩個人時 5 自動指定另一位', () => {
    let s = createNinetyNine([[C(0, 2)], [C(1, 5)], [C(1, 6)], [C(1, 7)]], [C(2, 2), C(2, 3), C(2, 6)], 1)
    s = { ...s, alive: [true, true, false, false] }
    s = must(s, play(1, C(1, 5), { target: 3 }))
    expect(s.turn).toBe(0)
    s = must(s, play(0, C(0, 2)))
    expect(s.turn).toBe(1)
  })
  it('牌堆抽完：出過的牌（最上面那張留著）洗成新牌堆', () => {
    let s = createNinetyNine([[C(0, 2), C(0, 3)], [C(1, 2)], [C(1, 6)], [C(1, 7)]], [C(2, 2)], 0)
    s = { ...s, played: [C(3, 2), C(3, 3), C(3, 6)] }
    s = must(s, play(0, C(0, 2))) // 抽走最後一張
    expect(s.deck).toEqual([])
    s = must(s, play(1, C(1, 2))) // 牌堆空了：洗 played 除了最上面
    expect(s.played).toEqual([C(1, 2)])
    expect(s.deck.length).toBe(3)
    expect(s.hands[1].length).toBe(1)
    expect(s.reshuffles).toBe(1)
    expect([...s.deck, ...s.hands[1]].sort((a, b) => a - b)).toEqual([C(0, 2), C(3, 2), C(3, 3), C(3, 6)].sort((a, b) => a - b))
  })
  it('時間到：能出就出最不可惜的（數字牌最小），10／Q 照能出的方向；沒得出就爆', () => {
    const s = createNinetyNine([[C(0, 13), C(0, 10), C(0, 3), C(0, 2)], [C(1, 2)], [C(1, 6)], [C(1, 7)]], [], 0, 50)
    expect(timeoutPlay(s)).toMatchObject({ type: 'play', card: C(0, 2) })
    const hi = createNinetyNine([[C(0, 13), C(0, 10), C(0, 9)], [C(1, 2)], [C(1, 6)], [C(1, 7)]], [], 0, 95)
    expect(timeoutPlay(hi)).toMatchObject({ type: 'play', card: C(0, 10), minus: true })
    const dead = createNinetyNine([[C(0, 9)], [C(1, 2)], [C(1, 6)], [C(1, 7)]], [], 0, 95)
    expect(timeoutPlay(dead)).toEqual({ type: 'out', player: 0 })
    expect(must(dead, { type: 'timeout', player: 0 }).alive[0]).toBe(false)
  })
})

describe('九九電腦', () => {
  const game = (levels: CardLevel[], seed: number) => {
    let s = dealNinetyNine(seed)
    let rng = seedRng(seed + 9)
    while (!s.over) {
      let a: NinetyNineAction
      ;[a, rng] = chooseNinetyNineAction(s, ninetyNineAt(PERSONAS[(seed + s.turn * 7) % 30].bigtwo, levels[s.turn]), rng)
      s = must(s, a)
    }
    return s
  }
  it('三個難度都打得完、只出合法的牌', () => {
    for (const lv of ['low', 'mid', 'high'] as const) expect(game([lv, lv, lv, lv], 11).over).toBe(true)
  })
  it('難度一級比一級強（拿第一的次數）', () => {
    const firsts = (levels: CardLevel[], n: number) => {
      let w = 0
      for (let g = 0; g < n; g++) if (ranks(game(levels, 300 + g))[0] === 1) w++
      return w
    }
    // 一打三，平均是 25%
    expect(firsts(['high', 'mid', 'mid', 'mid'], 120)).toBeGreaterThan(120 * 0.38)
    expect(firsts(['mid', 'low', 'low', 'low'], 120)).toBeGreaterThan(120 * 0.45)
  }, 60000)
  it('不偷看：別人的手牌、牌堆打亂，電腦的決定完全一樣', () => {
    for (let g = 0; g < 40; g++) {
      let s = dealNinetyNine(700 + g)
      let rng = seedRng(g)
      // 先隨便打幾手
      for (let k = 0; k < 8 && !s.over; k++) {
        let a: NinetyNineAction
        ;[a, rng] = chooseNinetyNineAction(s, ninetyNineAt(PERSONAS[k].bigtwo, 'mid'), rng)
        s = must(s, a)
      }
      if (s.over) continue
      const me = s.turn
      const st = ninetyNineAt(PERSONAS[g % 30].bigtwo, 'high')
      const [a1] = chooseNinetyNineAction(s, st, seedRng(42))
      // 把別人的手牌和牌堆混在一起重發
      const pool = [...s.deck, ...s.hands.flatMap((h, p) => (p === me ? [] : h))]
      const [mixed] = shuffle(pool, seedRng(g + 1))
      let k = 0
      const hands = s.hands.map((h, p) => (p === me ? h : mixed.slice(k, (k += h.length))))
      const t: NinetyNineState = { ...s, hands, deck: mixed.slice(k), rng: 12345 }
      const [a2] = chooseNinetyNineAction(t, st, seedRng(42))
      expect(a2).toEqual(a1)
      expect(legalCards(t, me)).toEqual(legalCards(s, me))
    }
  })
})
