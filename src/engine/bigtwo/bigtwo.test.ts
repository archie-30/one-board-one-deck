import { describe, expect, it } from 'vitest'
import { bigtwoAt, bigtwoLevel, type CardLevel } from '../common/difficulty'
import { PERSONAS } from '../common/personas'
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
    expect(beats('C8 D8 H8 S3 C3', 'H5 H6 H7 H8 H9', o)).toBe(false)
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
  it('預設：五張牌型只能同類型互壓，葫蘆壓不了順子；鐵支、同花順可以壓別的五張牌型', () => {
    expect(beats('C3 D3 H3 S4 C4', 'C2 D3 H4 S5 C6')).toBe(false)
    expect(beats('C2 D3 H4 S5 C6', 'C3 D3 H3 S4 C4')).toBe(false)
    expect(beats('D5 H6 C7 S8 D9', 'C4 D5 H6 S7 C8')).toBe(true)
    expect(beats('C3 D3 H3 S3 C4', 'C2 D2 H2 SA CA')).toBe(true)
    expect(beats('H3 H4 H5 H6 H7', 'C2 D2 H2 S2 CA')).toBe(true)
    expect(beats('C2 D2 H2 S2 CA', 'H3 H4 H5 H6 H7')).toBe(false)
  })
  it('兩對（預設不算）：兩個對子＋一張，只能接兩對，比大的那一對再比花色；鐵支可以壓', () => {
    expect(combo('C3 D3 H8 S8 CK')).toBeNull()
    const o = { ...D, allowTwoPair: true }
    expect(combo('C3 D3 H8 S8 CK', o)?.type).toBe('twoPair')
    expect(combo('C3 D3 H3 S8 C8', o)?.type).toBe('fullHouse')
    expect(beats('C4 D4 H9 S9 C5', 'C3 D3 H8 S8 CK', o)).toBe(true)
    expect(beats('CK DK H3 S3 C5', 'C3 D3 HQ SQ CA', o)).toBe(true)
    expect(beats('C3 D3 C8 D8 CK', 'H3 S3 H8 S8 DK', o)).toBe(false)
    expect(beats('H3 S3 H8 S8 DK', 'C3 D3 C8 D8 CK', o)).toBe(true)
    expect(beats('C4 D5 H6 S7 C8', 'C3 D3 H8 S8 CK', o)).toBe(false)
    expect(beats('C3 D3 H8 S8 CK', 'C4 D5 H6 S7 C8', o)).toBe(false)
    expect(beats('C5 D5 H5 S5 C9', 'C3 D3 H8 S8 CK', o)).toBe(true)
  })
  it('兩對開啟時，電腦也找得到兩對', () => {
    const hand = parseCards('C3 D3 H8 S8 CK')
    expect(listCombos(hand, D).some((c) => c.type === 'twoPair')).toBe(false)
    expect(listCombos(hand, { ...D, allowTwoPair: true }).some((c) => c.type === 'twoPair')).toBe(true)
  })
  it('同花（開啟時）也只能同花接同花', () => {
    const o = { ...D, allowFlush: true }
    expect(beats('S3 S6 S7 S8 SA', 'H4 H6 H7 H8 HK', o)).toBe(true)
    expect(beats('H3 H6 H7 H8 HK', 'C2 D3 H4 S5 C6', o)).toBe(false)
    expect(beats('C3 D3 H3 S4 C4', 'H3 H6 H7 H8 HK', o)).toBe(false)
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
  it('其他人都過牌後，桌面清空並由最後出牌的人自由出牌；下一輪過牌的人又可以出', () => {
    let s = game(['C3 D7 S9', 'C4 S4 D4', 'C5 S5 D5', 'C6 S6 D6'])
    s = must(s, { type: 'play', player: 0, cards: parseCards('C3') })
    s = must(s, { type: 'pass', player: 1 })
    expect(s.lastMoves[1]).toBe('pass')
    s = must(s, { type: 'play', player: 2, cards: parseCards('C5') })
    s = must(s, { type: 'pass', player: 3 })
    expect(s.turn).toBe(0)
    // 1 號這一輪已經過牌：0 號一過牌，這一輪就結束了
    s = must(s, { type: 'pass', player: 0 })
    expect(s.table).toBeNull()
    expect(s.turn).toBe(2)
    expect(s.lastMoves).toEqual([null, null, null, null])
    s = must(s, { type: 'play', player: 2, cards: parseCards('S5 D5') })
    expect(s.winner).toBe(2)
    expect(applyBigTwo(s, { type: 'pass', player: 3 })).toEqual({ ok: false, reason: 'finished' })
  })
  it('這一輪過牌之後就不能再出：輪到他時直接跳過', () => {
    let s = game(['C3 D7 S9', 'C4 S4 D4', 'C5 S5 D5', 'C6 S6 D6'])
    s = must(s, { type: 'play', player: 0, cards: parseCards('C3') })
    s = must(s, { type: 'pass', player: 1 })
    s = must(s, { type: 'play', player: 2, cards: parseCards('C5') })
    s = must(s, { type: 'play', player: 3, cards: parseCards('C6') })
    s = must(s, { type: 'play', player: 0, cards: parseCards('D7') })
    expect(s.turn).toBe(2)
    expect(applyBigTwo(s, { type: 'play', player: 1, cards: parseCards('C4') })).toEqual({ ok: false, reason: 'notYourTurn' })
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

describe('大老二：時間到被跳過', () => {
  const hands = () => createBigTwo([parseCards('C3 D4 H5'), parseCards('C6 D7'), parseCards('S8 H9'), parseCards('CJ DQ')])
  it('輪到自己首出時逾時：改由下一位首出，梅花 3 的限制取消', () => {
    const r = applyBigTwo(hands(), { type: 'timeout', player: 0 })
    if (!r.ok) throw new Error(r.reason)
    expect(r.state.turn).toBe(1)
    expect(r.state.table).toBeNull()
    expect(r.state.firstTurn).toBe(false)
    expect(r.state.lastMoves[0]).toBe('pass')
    expect(applyBigTwo(r.state, { type: 'play', player: 1, cards: parseCards('D7') }).ok).toBe(true)
  })
  it('桌上有牌時逾時：等於過牌', () => {
    const s = applyBigTwo(hands(), { type: 'play', player: 0, cards: parseCards('C3') })
    if (!s.ok) throw new Error(s.reason)
    const r = applyBigTwo(s.state, { type: 'timeout', player: 1 })
    if (!r.ok) throw new Error(r.reason)
    expect(r.state.turn).toBe(2)
    expect(r.state.passCount).toBe(1)
    expect(r.state.table?.player).toBe(0)
  })
  it('不是自己的回合不能逾時', () => {
    expect(applyBigTwo(hands(), { type: 'timeout', player: 2 }).ok).toBe(false)
  })
})

describe('大老二：小順（三張連號）', () => {
  const S = { ...D, allowSmallStraight: true }
  it('預設關閉；開啟後三張連號是小順，繞一圈的不算', () => {
    expect(combo('C3 D4 H5')).toBeNull()
    expect(combo('C3 D4 H5', S)?.type).toBe('smallStraight')
    expect(combo('SQ HK DA', S)?.type).toBe('smallStraight')
    expect(combo('HK DA C2', S)).toBeNull()
    expect(combo('C3 D4 H6', S)).toBeNull()
  })
  it('小順只能接小順；比最大那張，A23、234 照順子的 A 與 2（預設 234 最大、A23 第二）', () => {
    expect(beats('C4 D5 H6', 'C3 D4 H5', S)).toBe(true)
    expect(beats('C4 D5 H6', 'C3 D3 H3', { ...S, allowTriple: true })).toBe(false)
    expect(beats('C2 D3 H4', 'SQ HK DA', S)).toBe(true)
    expect(beats('CA D2 H3', 'SQ HK DA', S)).toBe(true)
    expect(beats('C2 D3 H4', 'CA D2 H3', S)).toBe(true)
    expect(beats('CA D2 H3', 'C3 D4 H5', { ...S, straightRule: 'aLow' })).toBe(false)
  })
  it('鐵支、同花順可以壓小順（預設鐵支可壓任何牌）', () => {
    expect(beats('C7 D7 H7 S7 C3', 'SQ HK DA', S)).toBe(true)
  })
  it('電腦也會出小順', () => {
    const list = listCombos(parseCards('C3 D4 H5 S9'), S)
    expect(list.some((c) => c.type === 'smallStraight')).toBe(true)
  })
})

describe('大老二：一條龍', () => {
  const dragonHand = 'C3 D4 H5 S6 C7 D8 H9 S10 CJ DQ HK SA C2'
  const others = ['D3 H3 S3 C4 H4 S4 C5 D5 S5 C6 D6 H6 D7', 'H7 S7 C8 H8 S8 C9 D9 S9 C10 D10 H10 CQ DJ', 'HJ SJ HQ SQ CK DK SK CA DA HA D2 H2 S2']
  it('開啟時拿到一條龍的人開局直接獲勝，其他人照手上 13 張扣分', () => {
    const s = createBigTwo([parseCards(others[0]), parseCards(dragonHand), parseCards(others[1]), parseCards(others[2])], { ...D, dragon: true })
    expect(s.winner).toBe(1)
    expect(s.dragon).toBe(1)
    const sc = scoreBigTwo(s)
    expect(sc[1].cards).toBe(0)
    expect(sc[1].points).toBe(-(sc[0].points + sc[2].points + sc[3].points))
  })
  it('預設關閉', () => {
    const s = createBigTwo([parseCards(others[0]), parseCards(dragonHand), parseCards(others[1]), parseCards(others[2])])
    expect(s.winner).toBe(-1)
  })
})

describe('大老二：電腦不偷看別人的牌', () => {
  it('把別人的手牌互相打亂（張數不變），電腦的決定完全一樣', () => {
    for (let seed = 1; seed <= 40; seed++) {
      let s = dealBigTwo(seed)
      // 先隨便走幾步，讓局面不一樣
      let rng = seedRng(seed)
      for (let i = 0; i < seed % 9; i++) {
        let a
        ;[a, rng] = chooseBigTwoAction(s, PERSONAS[seed % PERSONAS.length].bigtwo, rng)
        const r = applyBigTwo(s, a)
        if (!r.ok || r.state.winner >= 0) break
        s = r.state
      }
      const me = s.turn
      const hidden = s.hands.flatMap((h, p) => (p === me ? [] : h))
      const mixed = hidden.slice().reverse()
      let k = 0
      const hands2 = s.hands.map((h, p) => (p === me ? h : h.map(() => mixed[k++])))
      const s2 = { ...s, hands: hands2 }
      const r1 = chooseBigTwoAction(s, PERSONAS[(seed * 3) % PERSONAS.length].bigtwo, seedRng(seed * 7))[0]
      const r2 = chooseBigTwoAction(s2, PERSONAS[(seed * 3) % PERSONAS.length].bigtwo, seedRng(seed * 7))[0]
      expect(r2).toEqual(r1)
    }
  })
})

describe('瘋狂大老二（兩副牌）', () => {
  const X: BigTwoOptions = { ...D, decks: 2 }
  /** 第二副牌的同一張牌 */
  const twin = (text: string) => parseCard(text) + 52
  const cx = (cards: number[]) => identifyCombo(cards, X)!
  it('104 張、每人 26 張，兩副牌的每一張各出現兩次', () => {
    const s = dealBigTwo(7, X)
    expect(s.hands.map((h) => h.length)).toEqual([26, 26, 26, 26])
    const all = s.hands.flat()
    expect(new Set(all).size).toBe(104)
  })
  it('雙胞胎對子：先比數字，同數字時雙胞胎比一般對子大；兩張梅花 3 壓不過一對 4', () => {
    const t3 = cx([parseCard('C3'), twin('C3')])
    // 同數字：雙胞胎壓得過黑桃 3＋紅心 3（就算一般對子的花色比較大）
    const p3 = cx(parseCards('S3 H3'))
    expect(canBeat(t3, p3, X)).toBe(true)
    expect(canBeat(p3, t3, X)).toBe(false)
    // 數字比較小的雙胞胎壓不過比較大的一般對子
    const p4 = cx(parseCards('C4 D4'))
    expect(canBeat(t3, p4, X)).toBe(false)
    expect(canBeat(p4, t3, X)).toBe(true)
    expect(canBeat(t3, cx(parseCards('S2 H2')), X)).toBe(false)
    // 雙胞胎之間：先比數字，再比花色
    const t4 = cx([parseCard('D4'), twin('D4')])
    expect(canBeat(t4, t3, X)).toBe(true)
    const s3 = cx([parseCard('S3'), twin('S3')])
    expect(canBeat(s3, t3, X)).toBe(true)
  })
  it('關鍵最大張一模一樣：後出的壓不過（先出為主）', () => {
    const a = cx([parseCard('SK')])
    const b = cx([twin('SK')])
    expect(canBeat(b, a, X)).toBe(false)
    const pa = cx(parseCards('SK HK'))
    const pb = cx([twin('SK'), parseCard('DK')])
    expect(canBeat(pb, pa, X)).toBe(false)
    const sa = cx(parseCards('C4 D5 H6 S7 C8'))
    const sb = cx([parseCard('D4'), parseCard('C5'), parseCard('C6'), parseCard('D7'), twin('C8')])
    expect(canBeat(sb, sa, X)).toBe(false)
  })
  it('葫蘆、鐵支也看關鍵最大張的花色', () => {
    const f1 = cx(parseCards('C9 D9 H9 C4 D4'))
    const f2 = cx([twin('C9'), twin('D9'), parseCard('S9'), parseCard('C5'), parseCard('D5')])
    expect(canBeat(f2, f1, X)).toBe(true)
    expect(canBeat(f1, f2, X)).toBe(false)
  })
  it('梅花 3 在兩個人手上：從第二小的牌開始比，小的人先出；第一手要有梅花 3', () => {
    const a = [parseCard('C3'), parseCard('H3'), parseCard('S9')]
    const b = [twin('C3'), parseCard('D3'), parseCard('SA')]
    const s = createBigTwo([a, b, parseCards('C4 D4 H4'), parseCards('C5 D5 H5')], X)
    expect(s.turn).toBe(1)
    expect(s.firstTurn).toBe(true)
    expect(checkPlay(s, 1, [parseCard('D3')])).toEqual({ ok: false, reason: 'needClubThree' })
    expect(checkPlay(s, 1, [twin('C3')]).ok).toBe(true)
    // 第二小也一樣就繼續往下比
    const c = [parseCard('C3'), parseCard('D3'), parseCard('S9')]
    const d = [twin('C3'), twin('D3'), parseCard('H9')]
    expect(createBigTwo([c, d, parseCards('C4'), parseCards('C5')], X).turn).toBe(1)
    // 兩張梅花 3 都在同一個人手上
    expect(createBigTwo([parseCards('C9'), [parseCard('C3'), twin('C3')], parseCards('C4'), parseCards('C5')], X).turn).toBe(1)
  })
  it('計分：剩 20 張以上才加倍，2 不加倍', () => {
    const s = createBigTwo([parseCards('C3'), [...parseCards('S2 H2 D2'), ...Array.from({ length: 18 }, (_, i) => 52 + i + 4)], parseCards('C4 D4'), parseCards('C5')], X)
    const after = must(s, { type: 'play', player: 0, cards: parseCards('C3') })
    const sc = scoreBigTwo(after)
    expect(sc[1]).toMatchObject({ cards: 21, multiplier: 2, points: -42 })
    expect(sc[2]).toMatchObject({ cards: 2, multiplier: 1 })
  })
  it('電腦也能打完一局兩副牌（不會出不合法的牌、牌面一樣的牌型不重複列）', () => {
    let s = dealBigTwo(11, X)
    let rng = seedRng(3)
    for (let k = 0; k < 600 && s.winner < 0; k++) {
      let a
      ;[a, rng] = chooseBigTwoAction(s, PERSONAS[k % PERSONAS.length].bigtwo, rng)
      s = must(s, a)
    }
    expect(s.winner).toBeGreaterThanOrEqual(0)
    const combos = listCombos([parseCard('C3'), twin('C3'), parseCard('D3')], X)
    expect(combos.filter((c) => c.type === 'single')).toHaveLength(2)
    expect(combos.filter((c) => c.type === 'pair')).toHaveLength(2)
  })
})

describe('難度：高比中強、中比低強（電腦互打）', () => {
  /** 一位 strong 難度的電腦對三位 weak 難度：strong 的勝率、平均得分 */
  function duel(strong: CardLevel, weak: CardLevel, decks: 1 | 2, games: number) {
    let wins = 0
    let pts = 0
    for (let g = 0; g < games; g++) {
      let s = dealBigTwo(5000 + g, { decks })
      let rng = seedRng(g + 1)
      const seat = g % 4
      for (let step = 0; step < 2000 && s.winner < 0; step++) {
        const p = PERSONAS[(g * 7 + s.turn * 3) % 30]
        let a
        ;[a, rng] = chooseBigTwoAction(s, bigtwoAt(p.bigtwo, bigtwoLevel(s.turn === seat ? strong : weak)), rng)
        const r = applyBigTwo(s, a)
        if (!r.ok) throw new Error(r.reason)
        s = r.state
      }
      if (s.winner === seat) wins++
      pts += scoreBigTwo(s)[seat].points
    }
    return { rate: wins / games, avg: pts / games }
  }
  // 平均勝率是 25%（四個人）；實測約 高對中 40%、中對低 35%
  it('大老二：高對三位中、中對三位低，勝率都明顯超過四分之一', () => {
    expect(duel('high', 'mid', 1, 300).rate).toBeGreaterThan(0.33)
    expect(duel('mid', 'low', 1, 300).rate).toBeGreaterThan(0.3)
  }, 60000)
  it('瘋狂大老二：高對三位中、中對三位低，勝率都明顯超過四分之一', () => {
    expect(duel('high', 'mid', 2, 150).rate).toBeGreaterThan(0.35)
    expect(duel('mid', 'low', 2, 150).rate).toBeGreaterThan(0.33)
  }, 60000)
})

describe('玩到分出名次', () => {
  const R = { playToRank: true }
  const play = (s: BigTwoState, player: number, text: string) => {
    const r = applyBigTwo(s, { type: 'play', player, cards: parseCards(text) })
    if (!r.ok) throw new Error(r.reason)
    return r.state
  }
  const pass = (s: BigTwoState, player: number) => {
    const r = applyBigTwo(s, { type: 'pass', player })
    if (!r.ok) throw new Error(r.reason)
    return r.state
  }

  it('第一個人出完不結束；他最後那手照樣要壓，大家都過由他下一位自由出', () => {
    let s = createBigTwo([parseCards('C3 S2'), parseCards('C5 C6 C7'), parseCards('C8 C9'), parseCards('C10 CJ CQ CK')], R)
    s = play(s, 0, 'C3')
    s = play(s, 1, 'C5')
    s = play(s, 2, 'C8')
    s = play(s, 3, 'C10')
    s = play(s, 0, 'S2') // 0 號出完（第 1 名）
    expect(s.winner).toBe(-1)
    expect(s.out).toEqual([0])
    // 分數照 0 號出完那一刻
    expect(s.scoreHands!.map((h) => h.length)).toEqual([0, 2, 1, 3])
    expect(s.turn).toBe(1)
    s = pass(s, 1)
    s = pass(s, 2)
    s = pass(s, 3)
    // 大家都過：0 號已經出完，由 1 號自由出；之後輪不到 0 號
    expect(s.turn).toBe(1)
    expect(s.table).toBeNull()
    s = play(s, 1, 'C6')
    s = play(s, 2, 'C9')
    s = play(s, 3, 'CJ')
    expect(s.turn).toBe(1)
  })

  it('剩一個人就結束：名次 1～4 都排好，分數照第一個人出完那一刻算', () => {
    let s = createBigTwo([parseCards('C3 S2'), parseCards('C5 C6'), parseCards('C8 H2'), parseCards('C10 CJ CQ')], R)
    s = play(s, 0, 'C3')
    s = play(s, 1, 'C5')
    s = play(s, 2, 'C8')
    s = play(s, 3, 'C10')
    s = play(s, 0, 'S2') // 第 1 名
    s = pass(s, 1)
    s = pass(s, 2)
    s = pass(s, 3)
    s = play(s, 1, 'C6') // 第 2 名
    s = play(s, 2, 'H2') // 第 3 名，剩 3 號第 4 名
    expect(s.out).toEqual([0, 1, 2, 3])
    expect(s.winner).toBe(0)
    // 0 號出完時：1 號剩 1 張、2 號剩 1 張 2（×2）、3 號剩 2 張
    expect(scoreBigTwo(s).map((x) => x.points)).toEqual([5, -1, -2, -2])
  })

  it('沒開的話照舊：第一個人出完就結束', () => {
    let s = createBigTwo([parseCards('C3'), parseCards('C5 C6'), parseCards('C8'), parseCards('C10')], {})
    s = play(s, 0, 'C3')
    expect(s.winner).toBe(0)
    expect(s.out).toBeUndefined()
  })
})

describe('玩到分出名次：電腦自己打', () => {
  it('一副、兩副牌都能打到排出 1～4 名', () => {
    for (const decks of [1, 2] as const) {
      for (let g = 0; g < 60; g++) {
        let s = dealBigTwo(g * 7 + 1, { playToRank: true, decks })
        let rng = seedRng(g)
        const st = bigtwoAt(PERSONAS[g % 30].bigtwo, bigtwoLevel('mid'))
        let steps = 0
        while (s.winner < 0 && steps++ < 2000) {
          let a
          ;[a, rng] = chooseBigTwoAction(s, st, rng)
          const r = applyBigTwo(s, a)
          expect(r.ok).toBe(true)
          if (r.ok) s = r.state
        }
        expect(s.out).toHaveLength(4)
        expect(new Set(s.out).size).toBe(4)
        expect(s.winner).toBe(s.out![0])
        expect(scoreBigTwo(s).reduce((a, x) => a + x.points, 0)).toBe(0)
      }
    }
  })
})
