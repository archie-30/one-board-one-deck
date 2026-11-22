import { describe, expect, it } from 'vitest'
import { bluffAt } from '../common/difficulty'
import { PERSONAS } from '../common/personas'
import { seedRng, shuffle } from '../common/rng'
import { chooseBluffAction, truthChance } from './ai'
import { applyBluff, canCall, createBluff, dealBluff, makeCard, pileCount, placings, type BluffAction, type BluffState } from './rules'

const C = (s: number, r: number) => makeCard(s, r)
function must(s: BluffState, a: BluffAction) {
  const r = applyBluff(s, a)
  if (!r.ok) throw new Error(r.reason)
  return r.state
}

describe('吹牛：出牌與跟牌', () => {
  it('每人 13 張；帶頭要喊點數、不能過；一次 1～4 張', () => {
    const s = dealBluff(5, { fourDiscard: false })
    expect(s.hands.map((h) => h.length)).toEqual([13, 13, 13, 13])
    const p = s.turn
    expect(applyBluff(s, { type: 'pass', player: p })).toEqual({ ok: false, reason: 'mustLead' })
    expect(applyBluff(s, { type: 'play', player: p, cards: [s.hands[p][0]] })).toEqual({ ok: false, reason: 'needRank' })
    expect(applyBluff(s, { type: 'play', player: p, cards: s.hands[p].slice(0, 5), rank: 3 })).toEqual({ ok: false, reason: 'count' })
  })
  it('之後只能跟同一個點數；可以說謊', () => {
    let s = createBluff([[C(0, 7), C(1, 7), C(0, 2)], [C(0, 9), C(0, 3)], [C(2, 7)], [C(3, 1)]])
    s = must(s, { type: 'play', player: 0, cards: [C(0, 7), C(1, 7)], rank: 7 })
    expect(s.claim).toBe(7)
    expect(applyBluff(s, { type: 'play', player: 1, cards: [C(0, 9)], rank: 9 })).toEqual({ ok: false, reason: 'wrongRank' })
    s = must(s, { type: 'play', player: 1, cards: [C(0, 9)] })
    expect(pileCount(s)).toBe(3)
    expect(s.turn).toBe(2)
  })
  it('大家都過：桌上的牌收掉，最後出牌的人帶下一輪', () => {
    let s = createBluff([[C(0, 7), C(0, 2)], [C(0, 9), C(0, 3)], [C(2, 7), C(2, 5)], [C(3, 1), C(3, 4)]])
    s = must(s, { type: 'play', player: 0, cards: [C(0, 7)], rank: 7 })
    s = must(s, { type: 'pass', player: 1 })
    s = must(s, { type: 'pass', player: 2 })
    expect(s.turn).toBe(3)
    s = must(s, { type: 'pass', player: 3 })
    expect(s.plays).toEqual([])
    expect(s.discard).toEqual([C(0, 7)])
    expect(s.claim).toBeNull()
    expect(s.turn).toBe(0)
  })
})

describe('吹牛：抓', () => {
  it('只有下一家（中間沒人過）可以抓', () => {
    let s = createBluff([[C(0, 7), C(0, 2)], [C(0, 9), C(0, 3)], [C(2, 7), C(2, 5)], [C(3, 1), C(3, 4)]])
    s = must(s, { type: 'play', player: 0, cards: [C(0, 2)], rank: 7 })
    expect(canCall(s)).toBe(true)
    s = must(s, { type: 'pass', player: 1 })
    expect(canCall(s)).toBe(false)
    expect(applyBluff(s, { type: 'call', player: 2 })).toEqual({ ok: false, reason: 'cantCall' })
  })
  it('抓到說謊：整疊給說謊的人，抓的人帶下一輪', () => {
    let s = createBluff([[C(0, 7), C(0, 2)], [C(1, 7), C(0, 3)], [C(2, 7), C(2, 5)], [C(3, 1), C(3, 4)]])
    s = must(s, { type: 'play', player: 0, cards: [C(0, 7)], rank: 7 })
    s = must(s, { type: 'play', player: 1, cards: [C(0, 3)] })
    s = must(s, { type: 'call', player: 2 })
    expect(s.hands[1]).toEqual(expect.arrayContaining([C(0, 7), C(0, 3), C(1, 7)]))
    expect(s.hands[1]).toHaveLength(3)
    expect(s.turn).toBe(2)
    expect(s.events[0]).toMatchObject({ type: 'call', liar: true, taker: 1, target: 1 })
  })
  it('抓錯：整疊給抓的人，被抓的人帶下一輪', () => {
    let s = createBluff([[C(0, 7), C(0, 2)], [C(1, 7), C(0, 3)], [C(2, 7), C(2, 5)], [C(3, 1), C(3, 4)]])
    s = must(s, { type: 'play', player: 0, cards: [C(0, 7)], rank: 7 })
    s = must(s, { type: 'call', player: 1 })
    expect(s.hands[1]).toHaveLength(3)
    expect(s.turn).toBe(0)
  })
  it('出完最後的牌：下一家沒抓就出線；抓錯也出線', () => {
    let s = createBluff([[C(0, 7)], [C(0, 9), C(0, 3)], [C(2, 7), C(2, 5)], [C(3, 1), C(3, 4)]])
    s = must(s, { type: 'play', player: 0, cards: [C(0, 7)], rank: 7 })
    expect(s.out).toEqual([])
    s = must(s, { type: 'pass', player: 1 })
    expect(s.out).toEqual([0])
    let t = createBluff([[C(0, 7)], [C(0, 9), C(0, 3)], [C(2, 7), C(2, 5)], [C(3, 1), C(3, 4)]])
    t = must(t, { type: 'play', player: 0, cards: [C(0, 7)], rank: 7 })
    t = must(t, { type: 'call', player: 1 })
    expect(t.out).toEqual([0])
    expect(t.turn).toBe(1)
  })
  it('只剩一個人有牌就結束，排出 1～4 名', () => {
    let s = createBluff([[C(0, 7)], [C(0, 9)], [C(2, 7), C(2, 5)], []])
    s = { ...s, out: [3] }
    s = must(s, { type: 'play', player: 0, cards: [C(0, 7)], rank: 7 })
    s = must(s, { type: 'play', player: 1, cards: [C(0, 9)] })
    expect(s.out).toEqual([3, 0])
    s = must(s, { type: 'pass', player: 2 })
    expect(s.over).toBe(true)
    expect(placings(s)).toEqual([2, 3, 4, 1])
  })
  it('時間到：帶頭就照實蓋最小的一張，跟牌就過', () => {
    let s = createBluff([[C(0, 7), C(0, 2)], [C(0, 9), C(0, 3)], [C(2, 7)], [C(3, 1)]])
    s = must(s, { type: 'timeout', player: 0 })
    expect(s.claim).toBe(2)
    s = must(s, { type: 'timeout', player: 1 })
    expect(s.events[0]).toMatchObject({ type: 'pass' })
  })
})

describe('吹牛：四張一樣棄牌', () => {
  const four = (r: number) => [0, 1, 2, 3].map((suit) => C(suit, r))
  it('四張都棄掉的點數不能喊', () => {
    const s = createBluff([[...four(9), C(0, 2)], [C(1, 3)], [C(2, 5)], [C(3, 6)]], 0, { fourDiscard: true })
    expect(applyBluff(s, { type: 'play', player: 0, cards: [C(0, 2)], rank: 9 })).toMatchObject({ ok: false, reason: 'deadRank' })
    expect(applyBluff(s, { type: 'play', player: 0, cards: [C(0, 2)], rank: 2 }).ok).toBe(true)
  })
  it('開局發到四張一樣：自動棄掉、公開', () => {
    const s = createBluff([[...four(9), C(0, 2)], [C(1, 3)], [C(2, 5)], [C(3, 6)]], 0, { fourDiscard: true })
    expect(s.hands[0]).toEqual([C(0, 2)])
    expect(s.quads).toEqual([{ player: 0, rank: 9 }])
    expect(createBluff([[...four(9), C(0, 2)], [C(1, 3)], [C(2, 5)], [C(3, 6)]], 0, { fourDiscard: false }).hands[0]).toHaveLength(5)
  })
  it('吃下整疊湊齊四張：自動棄掉；棄光就出線', () => {
    let s = createBluff([[C(0, 7), C(1, 7)], [C(2, 7), C(3, 7)], [C(0, 2), C(1, 2)], [C(3, 1)]], 0, { fourDiscard: true })
    s = must(s, { type: 'play', player: 0, cards: [C(0, 7), C(1, 7)], rank: 7 })
    s = must(s, { type: 'call', player: 1 })
    // 0 號說真話，1 號抓錯吃下兩張 7，湊齊四張 7 棄光 → 出線；0 號也出完了 → 出線
    expect(s.hands[1]).toEqual([])
    expect(s.quads).toEqual([{ player: 1, rank: 7 }])
    expect(s.out).toEqual([0, 1])
    expect(s.events.map((e) => e.type)).toEqual(['call', 'quad'])
  })
})

describe('吹牛：電腦', () => {
  const play = (seed: number, levels: ('low' | 'mid' | 'high')[]) => {
    let s = dealBluff(seed)
    let rng = seedRng(seed * 7 + 1)
    for (let k = 0; k < 3000 && !s.over; k++) {
      let a
      ;[a, rng] = chooseBluffAction(s, bluffAt(PERSONAS[(seed + s.turn * 5) % PERSONAS.length].bigtwo, levels[s.turn]), rng)
      s = must(s, a)
    }
    return s
  }
  it('每個難度都能把一局打完，52 張一張不少', () => {
    for (let g = 0; g < 30; g++) {
      const lv = (['low', 'mid', 'high'] as const)[g % 3]
      const s = play(g + 1, [lv, lv, lv, lv])
      expect(s.over).toBe(true)
      expect(s.hands.flat().length + s.discard.length + pileCount(s) + (s.quads?.length ?? 0) * 4).toBe(52)
      expect(new Set(s.out).size).toBe(4)
    }
  })
  it('看不到別人的牌：打亂別人的手牌和桌上蓋著的牌，決定完全一樣', () => {
    for (let g = 0; g < 60; g++) {
      let s = dealBluff(g + 100)
      let rng = seedRng(g)
      for (let k = 0; k < 10 + (g % 25) && !s.over; k++) [s, rng] = ((a) => [must(s, a[0]), a[1]] as const)(chooseBluffAction(s, bluffAt(PERSONAS[g % 30].bigtwo, 'mid'), rng))
      if (s.over) continue
      const me = s.turn
      const hidden = [...s.hands.filter((_, i) => i !== me).flat(), ...s.plays.flatMap((p) => p.cards), ...s.discard]
      const [mix] = shuffle(hidden, seedRng(g + 9))
      let k = 0
      const take = (n: number) => mix.slice(k, (k += n))
      const other: BluffState = {
        ...s,
        hands: s.hands.map((h, i) => (i === me ? h : take(h.length))),
        plays: s.plays.map((p) => ({ ...p, cards: take(p.cards.length) })),
        discard: take(s.discard.length),
      }
      for (const lv of ['low', 'mid', 'high'] as const) {
        const st = bluffAt(PERSONAS[g % 30].bigtwo, lv)
        expect(chooseBluffAction(other, st, 42)[0]).toEqual(chooseBluffAction(s, st, 42)[0])
      }
    }
  })
  it('喊的張數加上自己手上的超過 4 張：一定說謊', () => {
    let s = createBluff([[C(0, 7), C(1, 7), C(0, 2)], [C(2, 7), C(3, 7), C(0, 3)], [C(2, 5)], [C(3, 1)]])
    s = must(s, { type: 'play', player: 0, cards: [C(0, 7), C(0, 2), C(1, 7)], rank: 7 })
    expect(truthChance(s, 1)).toBe(0)
    expect(chooseBluffAction(s, bluffAt(PERSONAS[0].bigtwo, 'high'), 1)[0]).toEqual({ type: 'call', player: 1 })
  })
  it('高比中強、中比低強（平均名次）', () => {
    const avg = (me: 'low' | 'mid' | 'high', rest: 'low' | 'mid' | 'high') => {
      let t = 0
      const N = 160
      for (let g = 0; g < N; g++) {
        const seat = g % 4
        const lv = [rest, rest, rest, rest]
        lv[seat] = me
        t += placings(play(g + 500, lv))[seat]
      }
      return t / N
    }
    expect(avg('high', 'mid')).toBeLessThan(2.3)
    expect(avg('mid', 'low')).toBeLessThan(2.3)
  })
})
