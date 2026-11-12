import { describe, expect, it } from 'vitest'
import { seedRng } from '../common/rng'
import { chooseBigTwoAction, legalPlays, listCombos } from './ai'
import { CLUB_THREE, cardPower, parseCard, parseCards } from './cards'
import { canBeat, identifyCombo } from './combos'
import { applyBigTwo, checkPlay, createBigTwo, dealBigTwo, scoreBigTwo, type BigTwoState } from './game'
import { DEFAULT_BIGTWO_OPTIONS as D, type BigTwoOptions } from './options'

const combo = (text: string, opts: BigTwoOptions = D) => identifyCombo(parseCards(text), opts)
const beats = (a: string, b: string, opts: BigTwoOptions = D) => canBeat(combo(a, opts)!, combo(b, opts)!, opts)

describe('大老二：單張與花色', () => {
  it('2 最大、3 最小；同點數比花色（黑桃>紅心>方塊>梅花）', () => {
    expect(beats('C2', 'SA')).toBe(true)
    expect(beats('S3', 'C4')).toBe(false)
    expect(beats('S5', 'H5')).toBe(true)
    expect(beats('H5', 'D5')).toBe(true)
    expect(beats('D5', 'C5')).toBe(true)
  })
  it('花色順序可改成 黑桃>紅心>梅花>方塊', () => {
    const o = { ...D, suitOrder: 'shcd' as const }
    expect(beats('C5', 'D5', o)).toBe(true)
    expect(cardPower(parseCard('D3'), o.suitOrder)).toBe(0)
  })
})

describe('大老二：牌型判定', () => {
  it('對子要同點數；比點數再比較大的花色', () => {
    expect(combo('C5 D5')?.type).toBe('pair')
    expect(combo('C5 D6')).toBeNull()
    expect(beats('C6 D6', 'H5 S5')).toBe(true)
    expect(beats('C5 S5', 'D5 H5')).toBe(true)
  })
  it('三條預設不能單獨出，開啟後可以', () => {
    expect(combo('C5 D5 H5')).toBeNull()
    expect(combo('C5 D5 H5', { ...D, allowTriple: true })?.type).toBe('triple')
  })
  it('四張、六張或重複的牌都不合法', () => {
    expect(combo('C5 D5 H5 S5')).toBeNull()
    expect(combo('C3 D4 H5 S6 C7 D8')).toBeNull()
    expect(identifyCombo([0, 0], D)).toBeNull()
  })
  it('葫蘆、鐵支、同花順', () => {
    expect(combo('C5 D5 H5 S9 C9')?.type).toBe('fullHouse')
    expect(combo('C5 D5 H5 S5 C9')?.type).toBe('four')
    expect(combo('H5 H6 H7 H8 H9')?.type).toBe('straightFlush')
    expect(combo('C5 D5 H6 S6 C9')).toBeNull()
  })
  it('同花預設不算牌型，開啟後才算', () => {
    expect(combo('H3 H6 H7 H8 HK')).toBeNull()
    expect(combo('H3 H6 H7 H8 HK', { ...D, allowFlush: true })?.type).toBe('flush')
  })
  it('關閉同花順後，同花順只當一般順子', () => {
    const o = { ...D, straightFlushSpecial: false }
    expect(combo('H5 H6 H7 H8 H9', o)?.type).toBe('straight')
    expect(beats('C8 D8 H8 S3 C3', 'H5 H6 H7 H8 H9', o)).toBe(true)
  })
})

describe('大老二：順子的 A 與 2', () => {
  it('JQKA2、QKA23、KA234 不算順子', () => {
    expect(combo('CJ DQ HK SA C2')).toBeNull()
    expect(combo('CQ DK HA S2 C3')).toBeNull()
    expect(combo('CK DA H2 S3 C4')).toBeNull()
  })
  it('台灣規則：23456 > A2345 > 10JQKA > … > 34567', () => {
    expect(combo('CA D2 H3 S4 C5')?.type).toBe('straight')
    expect(beats('C2 D3 H4 S5 C6', 'SA S2 H3 S4 D5')).toBe(true)
    expect(beats('CA D2 H3 S4 C5', 'S10 SJ HQ SK DA')).toBe(true)
    expect(beats('C10 DJ HQ SK CA', 'S9 S10 HJ SQ DK')).toBe(true)
    expect(beats('C4 D5 H6 S7 C8', 'S3 S4 H5 S6 D7')).toBe(true)
  })
  it('同樣大的順子比關鍵牌的花色', () => {
    expect(beats('C3 D4 H5 S6 S7', 'S3 S4 S5 H6 H7')).toBe(true)
    expect(beats('S2 D3 H4 S5 C6', 'H2 S3 S4 D5 S6')).toBe(true)
  })
  it('A2345 最小的規則', () => {
    const o = { ...D, straightRule: 'aLow' as const }
    expect(beats('C3 D4 H5 S6 C7', 'SA S2 H3 S4 D5', o)).toBe(true)
    expect(beats('C2 D3 H4 S5 C6', 'S10 SJ HQ SK DA', o)).toBe(true)
  })
  it('依最大牌比的規則：含 2 的順子都比 10JQKA 大', () => {
    const o = { ...D, straightRule: 'high' as const }
    expect(beats('CA C2 H3 S4 C5', 'S10 SJ HQ SK DA', o)).toBe(true)
    expect(beats('SA S2 H3 S4 C5', 'C2 D3 H4 S5 C6', o)).toBe(true)
  })
})

describe('大老二：壓牌', () => {
  it('五張牌型：順子 < 葫蘆 < 鐵支 < 同花順', () => {
    expect(beats('C3 D3 H3 S4 C4', 'C2 D3 H4 S5 C6')).toBe(true)
    expect(beats('C3 D3 H3 S3 C4', 'C2 D2 H2 SA CA')).toBe(true)
    expect(beats('H3 H4 H5 H6 H7', 'C2 D2 H2 S2 CA')).toBe(true)
    expect(beats('C2 D3 H4 S5 C6', 'C3 D3 H3 S4 C4')).toBe(false)
  })
  it('開啟同花時：順子 < 同花 < 葫蘆', () => {
    const o = { ...D, allowFlush: true }
    expect(beats('H3 H6 H7 H8 HK', 'C2 D3 H4 S5 C6', o)).toBe(true)
    expect(beats('C3 D3 H3 S4 C4', 'H3 H6 H7 H8 HK', o)).toBe(true)
    expect(beats('S3 S6 S7 S8 SA', 'H4 H6 H7 H8 HK', o)).toBe(true)
  })
  it('葫蘆比三條的點數、鐵支比四條的點數', () => {
    expect(beats('C3 D3 H3 S2 C2', 'C4 D4 H4 S5 C5')).toBe(false)
    expect(beats('C4 D4 H4 S3 D3', 'S3 H3 C3 S2 C2')).toBe(true)
    expect(beats('C4 D4 H4 S4 D3', 'S3 H3 C3 D3 C2')).toBe(true)
  })
  it('鐵支與同花順可以壓單張、對子（預設）', () => {
    expect(beats('C3 D3 H3 S3 C4', 'S2')).toBe(true)
    expect(beats('H3 H4 H5 H6 H7', 'S2 H2')).toBe(true)
    expect(beats('C3 D3 H3 S4 C4', 'S2')).toBe(false)
  })
  it('關閉後鐵支只能壓五張牌型', () => {
    const o = { ...D, bombBeatsAll: false }
    expect(beats('C3 D3 H3 S3 C4', 'S2', o)).toBe(false)
    expect(beats('C3 D3 H3 S3 C4', 'C2 D2 H2 SA CA', o)).toBe(true)
  })
  it('張數不同不能互壓', () => {
    expect(beats('S2 H2', 'C3')).toBe(false)
    expect(beats('S2', 'C3 D3')).toBe(false)
  })
})

function game(hands: string[], opts: Partial<BigTwoOptions> = {}): BigTwoState {
  return createBigTwo(hands.map(parseCards), opts)
}
function must(state: BigTwoState, action: Parameters<typeof applyBigTwo>[1]): BigTwoState {
  const r = applyBigTwo(state, action)
  if (!r.ok) throw new Error(r.reason)
  return r.state
}

describe('大老二：對局流程', () => {
  it('發牌：每人 13 張、不重複、梅花 3 的人先出，同 seed 同牌', () => {
    const s = dealBigTwo(2024)
    expect(s.hands.map((h) => h.length)).toEqual([13, 13, 13, 13])
    expect(new Set(s.hands.flat()).size).toBe(52)
    expect(s.hands[s.turn]).toContain(CLUB_THREE)
    expect(dealBigTwo(2024)).toEqual(s)
    expect(JSON.parse(JSON.stringify(s))).toEqual(s)
  })
  it('第一手必須包含梅花 3', () => {
    const s = game(['C3 D3 S9', 'C4 S4', 'C5 S5', 'C6 S6'])
    expect(checkPlay(s, 0, parseCards('S9'))).toEqual({ ok: false, reason: 'needClubThree' })
    expect(checkPlay(s, 0, parseCards('C3 D3')).ok).toBe(true)
  })
  it('各種不能出的情況', () => {
    let s = game(['C3 D7 S9', 'C4 S4 D4', 'C5 S5 D5', 'C6 S6 D6'])
    expect(applyBigTwo(s, { type: 'pass', player: 0 })).toEqual({ ok: false, reason: 'mustLead' })
    expect(applyBigTwo(s, { type: 'play', player: 1, cards: parseCards('C4') })).toEqual({ ok: false, reason: 'notYourTurn' })
    expect(checkPlay(s, 0, parseCards('S2'))).toEqual({ ok: false, reason: 'notInHand' })
    expect(checkPlay(s, 0, parseCards('C3 D7'))).toEqual({ ok: false, reason: 'invalidCombo' })
    s = must(s, { type: 'play', player: 0, cards: parseCards('C3') })
    expect(checkPlay(s, 1, parseCards('C4 S4'))).toEqual({ ok: false, reason: 'wrongType' })
    s = must(s, { type: 'play', player: 1, cards: parseCards('S4') })
    expect(checkPlay(s, 2, parseCards('C5')).ok).toBe(true)
    s = must(s, { type: 'play', player: 2, cards: parseCards('S5') })
    expect(checkPlay(s, 3, parseCards('C6')).ok).toBe(true)
    s = must(s, { type: 'play', player: 3, cards: parseCards('D6') })
    expect(checkPlay(s, 0, parseCards('D7')).ok).toBe(true)
    s = must(s, { type: 'play', player: 0, cards: parseCards('S9') })
    expect(checkPlay(s, 1, parseCards('C4'))).toEqual({ ok: false, reason: 'tooSmall' })
  })
  it('其他三家都過牌後，桌面清空並由出牌者自由出牌；過牌後下一輪仍可出牌', () => {
    let s = game(['C3 D7 S9', 'C4 S4 D4', 'C5 S5 D5', 'C6 S6 D6'])
    s = must(s, { type: 'play', player: 0, cards: parseCards('C3') })
    s = must(s, { type: 'pass', player: 1 })
    expect(s.lastMoves[1]).toBe('pass')
    s = must(s, { type: 'play', player: 2, cards: parseCards('C5') })
    s = must(s, { type: 'pass', player: 3 })
    s = must(s, { type: 'pass', player: 0 })
    expect(s.table).not.toBeNull()
    s = must(s, { type: 'pass', player: 1 })
    expect(s.table).toBeNull()
    expect(s.turn).toBe(2)
    expect(s.lastMoves).toEqual([null, null, null, null])
    s = must(s, { type: 'play', player: 2, cards: parseCards('S5 D5') })
    expect(s.winner).toBe(2)
    expect(applyBigTwo(s, { type: 'pass', player: 3 })).toEqual({ ok: false, reason: 'finished' })
  })
  it('動作不會改動原本的狀態', () => {
    const s = game(['C3 D7', 'C4 S4', 'C5 S5', 'C6 S6'])
    const copy = JSON.parse(JSON.stringify(s))
    must(s, { type: 'play', player: 0, cards: parseCards('C3') })
    expect(s).toEqual(copy)
  })
})

describe('大老二：計分', () => {
  const finished = (opts: Partial<BigTwoOptions> = {}) => {
    const s = game(['C3', 'C4 S4 D4', 'S2 H2 C5', 'C6 S6 D6 C7 S7 D7 C8 S8 D8 C9'], opts)
    return must(s, { type: 'play', player: 0, cards: parseCards('C3') })
  }
  it('剩牌扣分，10 張以上加倍，每張 2 再加倍，贏家拿總和', () => {
    const scores = scoreBigTwo(finished())
    expect(scores[1]).toMatchObject({ cards: 3, multiplier: 1, points: -3 })
    expect(scores[2]).toMatchObject({ cards: 3, twos: 2, multiplier: 4, points: -12 })
    expect(scores[3]).toMatchObject({ cards: 10, multiplier: 2, points: -20 })
    expect(scores[0].points).toBe(35)
    expect(scores.reduce((sum, s) => sum + s.points, 0)).toBe(0)
  })
  it('加倍可以關閉', () => {
    const scores = scoreBigTwo(finished({ doubleOverTen: false, doubleTwos: false }))
    expect(scores.map((s) => s.points)).toEqual([16, -3, -3, -10])
  })
})

describe('大老二：AI', () => {
  it('列出所有牌型', () => {
    const hand = parseCards('C3 D3 H3 S3 C4 D4 C5 C6 C7')
    const types = new Set(listCombos(hand, D).map((c) => c.type))
    expect(types).toEqual(new Set(['single', 'pair', 'fullHouse', 'four', 'straight', 'straightFlush']))
    expect(new Set(listCombos(hand, { ...D, allowTriple: true, allowFlush: true }).map((c) => c.type))).toContain('triple')
  })
  it('第一手的合法出牌都包含梅花 3', () => {
    const s = dealBigTwo(7)
    const plays = legalPlays(s)
    expect(plays.length).toBeGreaterThan(0)
    expect(plays.every((c) => c.cards.includes(CLUB_THREE))).toBe(true)
  })
  it('能一手出完就出完；沒牌可壓就過牌', () => {
    let s = game(['C3 S9', 'C4 S4', 'C5', 'C6 S6'])
    s = must(s, { type: 'play', player: 0, cards: parseCards('C3') })
    s = must(s, { type: 'play', player: 1, cards: parseCards('S4') })
    expect(chooseBigTwoAction(s, 'normal', seedRng(1))[0]).toEqual({ type: 'play', player: 2, cards: parseCards('C5') })
    const t = must(game(['C3 S2', 'C4 D4', 'C5 S5', 'C6 S6']), { type: 'play', player: 0, cards: parseCards('C3') })
    const u = must(must(must(t, { type: 'play', player: 1, cards: parseCards('D4') }), { type: 'pass', player: 2 }), { type: 'pass', player: 3 })
    const v = must(u, { type: 'play', player: 0, cards: parseCards('S2') })
    expect(v.winner).toBe(0)
  })
  it('簡單難度出最小可贏的牌', () => {
    let s = game(['C3 S9', 'D5 S7 S2', 'C5 D9', 'C6 S6'])
    s = must(s, { type: 'play', player: 0, cards: parseCards('C3') })
    const [a] = chooseBigTwoAction(s, 'easy', seedRng(1))
    expect(a).toEqual({ type: 'play', player: 1, cards: parseCards('D5') })
  })
  it('四個 AI 能把很多局都正常打完，且同 seed 結果相同', () => {
    const run = (seed: number, opts: Partial<BigTwoOptions> = {}) => {
      let s = dealBigTwo(seed, opts)
      let rng = seedRng(seed)
      let guard = 0
      while (s.winner < 0 && guard++ < 500) {
        let action
        ;[action, rng] = chooseBigTwoAction(s, s.turn % 2 ? 'easy' : 'normal', rng)
        const r = applyBigTwo(s, action)
        if (!r.ok) throw new Error(`seed ${seed}: ${r.reason}`)
        s = r.state
      }
      expect(s.winner).toBeGreaterThanOrEqual(0)
      return s
    }
    for (let seed = 1; seed <= 40; seed++) run(seed)
    for (let seed = 1; seed <= 15; seed++) {
      run(seed, { allowTriple: true, allowFlush: true, straightRule: 'high', bombBeatsAll: false, suitOrder: 'shcd' })
    }
    expect(run(5)).toEqual(run(5))
  })
})
