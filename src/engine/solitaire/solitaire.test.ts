import { describe, expect, it } from 'vitest'
import { fullDeck, parseCard as P } from '@/engine/bigtwo/cards'
import { seedRng } from '@/engine/common/rng'
import {
  applySolitaire,
  autoTarget,
  canAutoFinish,
  canPlace,
  createSolitaire,
  dealSolitaire,
  finalScore,
  hint,
  nextFinishMove,
  valueOf,
  chargeHint,
  finishPlan,
  isStuck,
  scoreOf,
  undoTo,
  type SolitaireAction,
  type SolitaireState,
} from './rules'

/** 空桌面，再依需要擺牌 */
function empty(draw: 1 | 3 = 1): SolitaireState {
  return { stock: [], waste: [], foundations: [[], [], [], []], tableau: Array.from({ length: 7 }, () => ({ down: [], up: [] })), draw, score: 0, moves: 0, recycles: 0, penalty: 0, won: false }
}
function ok(s: SolitaireState, a: SolitaireAction): SolitaireState {
  const r = applySolitaire(s, a)
  if (!r.ok) throw new Error(r.reason)
  return r.state
}

describe('接龍：發牌', () => {
  it('7 疊分別 1～7 張、只有最上面翻開，牌堆 24 張，總共 52 張不重複', () => {
    const [s] = dealSolitaire(seedRng(7), 1)
    s.tableau.forEach((c, i) => {
      expect(c.down.length).toBe(i)
      expect(c.up.length).toBe(1)
    })
    expect(s.stock.length).toBe(24)
    const all = [...s.stock, ...s.tableau.flatMap((c) => [...c.down, ...c.up])].sort((a, b) => a - b)
    expect(all).toEqual(fullDeck())
  })
  it('同一個 seed 發出同一副牌', () => {
    expect(dealSolitaire(seedRng(3), 1)[0]).toEqual(dealSolitaire(seedRng(3), 1)[0])
  })
  it('點數：A=1、10=10、K=13、2=2', () => {
    expect([P('SA'), P('H10'), P('DK'), P('C2')].map(valueOf)).toEqual([1, 10, 13, 2])
  })
})

describe('接龍：翻牌堆', () => {
  it('翻 1 張：一次翻一張；翻 3 張：一次三張，不夠就翻剩下的', () => {
    const s1 = createSolitaire(fullDeck(), 1)
    const a = ok(s1, { type: 'draw' })
    expect(a.waste.length).toBe(1)
    expect(a.stock.length).toBe(23)
    const s3 = { ...empty(3), stock: [P('S3'), P('S4')] }
    const b = ok(s3, { type: 'draw' })
    expect(b.waste).toEqual([P('S4'), P('S3')])
    expect(b.stock).toEqual([])
  })
  it('牌堆翻完再按一次：翻過的牌整疊翻回去，順序不變；第一輪重翻不扣分', () => {
    let s = { ...empty(1), stock: [P('S3'), P('S4'), P('S5')], score: 150 }
    s = ok(ok(ok(s, { type: 'draw' }), { type: 'draw' }), { type: 'draw' })
    const r = ok(s, { type: 'draw' })
    expect(r.stock).toEqual([P('S3'), P('S4'), P('S5')])
    expect(r.waste).toEqual([])
    expect(r.score).toBe(150)
    expect(r.recycles).toBe(1)
  })
  it('重翻扣分：翻 1 張第 2 次起每次 -100；翻 3 張前 3 次免費、第 4 次起每次 -20；不低於 0', () => {
    const one = { ...empty(1), waste: [P('S3')], score: 150, recycles: 1 }
    expect(ok(one, { type: 'draw' }).score).toBe(50)
    expect(ok({ ...one, score: 60 }, { type: 'draw' }).score).toBe(0)
    const three = { ...empty(3), waste: [P('S3')], score: 50, recycles: 2 }
    expect(ok(three, { type: 'draw' }).score).toBe(50)
    expect(ok({ ...three, recycles: 3 }, { type: 'draw' }).score).toBe(30)
  })
  it('牌堆和翻出來的都空了：不能再翻', () => {
    expect(applySolitaire(empty(), { type: 'draw' })).toEqual({ ok: false, reason: 'empty' })
  })
})

describe('接龍：桌面往下接', () => {
  it('紅黑交錯、點數少 1 才能接', () => {
    const s = empty()
    s.tableau[0].up = [P('S9')]
    expect(canPlace(s, [P('H8')], { pile: 'tableau', col: 0 })).toBe(true)
    expect(canPlace(s, [P('C8')], { pile: 'tableau', col: 0 })).toBe(false)
    expect(canPlace(s, [P('H7')], { pile: 'tableau', col: 0 })).toBe(false)
    expect(canPlace(s, [P('H10')], { pile: 'tableau', col: 0 })).toBe(false)
  })
  it('空的一疊只能放 K（可以帶著下面接好的牌一起搬）', () => {
    const s = empty()
    s.tableau[0].up = [P('SK'), P('HQ'), P('CJ')]
    s.tableau[1].down = [P('D2')]
    s.tableau[1].up = [P('DQ')]
    expect(canPlace(s, [P('DQ')], { pile: 'tableau', col: 2 })).toBe(false)
    const r = ok(s, { type: 'move', from: { pile: 'tableau', col: 0, index: 0 }, to: { pile: 'tableau', col: 2 } })
    expect(r.tableau[2].up).toEqual([P('SK'), P('HQ'), P('CJ')])
    expect(r.tableau[0].up).toEqual([])
  })
  it('一疊只剩蓋著的牌時不能放（要先翻開）', () => {
    const s = empty()
    s.tableau[0].down = [P('S9')]
    expect(canPlace(s, [P('SK')], { pile: 'tableau', col: 0 })).toBe(false)
  })
  it('搬走後露出蓋著的牌會自動翻開並加 5 分', () => {
    const s = empty()
    s.tableau[0].down = [P('C3'), P('D4')]
    s.tableau[0].up = [P('H8')]
    s.tableau[1].up = [P('S9')]
    const r = ok(s, { type: 'move', from: { pile: 'tableau', col: 0, index: 0 }, to: { pile: 'tableau', col: 1 } })
    expect(r.tableau[0].down).toEqual([P('C3')])
    expect(r.tableau[0].up).toEqual([P('D4')])
    expect(r.score).toBe(5)
    expect(r.moves).toBe(1)
  })
  it('從中間拿：只能拿翻開的牌，連同上面的一起搬', () => {
    const s = empty()
    s.tableau[0].up = [P('S9'), P('H8'), P('C7')]
    s.tableau[1].up = [P('D9')]
    // 紅 8 不能接在紅 9 上
    expect(applySolitaire(s, { type: 'move', from: { pile: 'tableau', col: 0, index: 1 }, to: { pile: 'tableau', col: 1 } }).ok).toBe(false)
    const s2 = empty()
    s2.tableau[0].up = [P('S9'), P('H8'), P('C7')]
    s2.tableau[1].up = [P('C9')]
    const r2 = ok(s2, { type: 'move', from: { pile: 'tableau', col: 0, index: 1 }, to: { pile: 'tableau', col: 1 } })
    expect(r2.tableau[1].up).toEqual([P('C9'), P('H8'), P('C7')])
    expect(r2.tableau[0].up).toEqual([P('S9')])
    expect(applySolitaire(s2, { type: 'move', from: { pile: 'tableau', col: 0, index: 5 }, to: { pile: 'tableau', col: 1 } })).toEqual({ ok: false, reason: 'badSource' })
  })
})

describe('接龍：收牌區', () => {
  it('每疊收牌區固定一種花色（梅花 0、方塊 1、紅心 2、黑桃 3）；空的只能放該花色的 A，之後依序往上，一次一張', () => {
    const s = empty()
    expect(canPlace(s, [P('H2')], { pile: 'foundation', slot: 2 })).toBe(false)
    expect(canPlace(s, [P('HA')], { pile: 'foundation', slot: 2 })).toBe(true)
    expect(canPlace(s, [P('HA')], { pile: 'foundation', slot: 0 })).toBe(false)
    expect(canPlace(s, [P('SA')], { pile: 'foundation', slot: 3 })).toBe(true)
    s.foundations[2] = [P('HA')]
    expect(canPlace(s, [P('H2')], { pile: 'foundation', slot: 2 })).toBe(true)
    expect(canPlace(s, [P('D2')], { pile: 'foundation', slot: 2 })).toBe(false)
    expect(canPlace(s, [P('H3')], { pile: 'foundation', slot: 2 })).toBe(false)
    expect(canPlace(s, [P('H2'), P('SA')], { pile: 'foundation', slot: 2 })).toBe(false)
  })
  it('計分：牌堆→桌面 +5、收牌 +10、收牌區拿回桌面 -15', () => {
    const s = empty()
    s.waste = [P('HA'), P('D8')]
    s.tableau[0].up = [P('S9')]
    let r = ok(s, { type: 'move', from: { pile: 'waste' }, to: { pile: 'tableau', col: 0 } })
    expect(r.score).toBe(5)
    r = ok(r, { type: 'move', from: { pile: 'waste' }, to: { pile: 'foundation', slot: 2 } })
    expect(r.score).toBe(15)
    const t = empty()
    t.foundations[2] = [P('HA'), P('H2'), P('H3'), P('H4'), P('H5'), P('H6'), P('H7'), P('H8')]
    t.tableau[0].up = [P('S9')]
    t.score = 20
    expect(ok(t, { type: 'move', from: { pile: 'foundation', slot: 2 }, to: { pile: 'tableau', col: 0 } }).score).toBe(5)
  })
  it('四疊都收到 K 就過關，過關後不能再動', () => {
    const s = empty()
    for (let suit = 0; suit < 4; suit++) {
      const order = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'].map((r) => P('CDHS'[suit] + r))
      s.foundations[suit] = order.slice(0, suit === 3 ? 12 : 13)
    }
    s.tableau[0].up = [P('SK')]
    const r = ok(s, { type: 'move', from: { pile: 'tableau', col: 0, index: 0 }, to: { pile: 'foundation', slot: 3 } })
    expect(r.won).toBe(true)
    expect(applySolitaire(r, { type: 'draw' })).toEqual({ ok: false, reason: 'won' })
  })
})

describe('接龍：點一下自動放、提示、自動收牌', () => {
  it('點一下：能收就先收，不然找能接的桌面，最後才考慮空位', () => {
    const s = empty()
    s.foundations[2] = [P('HA')]
    s.tableau[0].up = [P('H2')]
    s.tableau[1].up = [P('S3')]
    expect(autoTarget(s, { pile: 'tableau', col: 0, index: 0 })).toEqual({ pile: 'foundation', slot: 2 })
    const t = empty()
    t.tableau[0].up = [P('SK')]
    t.tableau[0].down = [P('C2')]
    t.tableau[3].up = [P('H8')]
    t.waste = [P('C7')]
    expect(autoTarget(t, { pile: 'waste' })).toEqual({ pile: 'tableau', col: 3 })
    expect(autoTarget(t, { pile: 'tableau', col: 0, index: 0 })).toEqual({ pile: 'tableau', col: 1 })
  })
  it('已經在空位最底下的 K 不會被搬到另一個空位', () => {
    const s = empty()
    s.tableau[0].up = [P('SK')]
    expect(autoTarget(s, { pile: 'tableau', col: 0, index: 0 })).toBeNull()
  })
  it('提示：先收牌，再翻開蓋著的牌，再用牌堆，最後建議翻牌堆', () => {
    const s = empty()
    s.tableau[0].down = [P('C5')]
    s.tableau[0].up = [P('H8')]
    s.tableau[1].up = [P('S9')]
    s.stock = [P('D3')]
    expect(hint(s)).toEqual({ type: 'move', from: { pile: 'tableau', col: 0, index: 0 }, to: { pile: 'tableau', col: 1 } })
    s.tableau[2].up = [P('CA')]
    expect(hint(s)).toEqual({ type: 'move', from: { pile: 'tableau', col: 2, index: 0 }, to: { pile: 'foundation', slot: 0 } })
    const t = empty()
    t.stock = [P('D3')]
    expect(hint(t)).toEqual({ type: 'draw' })
    expect(hint(empty())).toBeNull()
  })
  it('沒有蓋著的牌、牌堆也空了：可以自動收完，一步一步收到過關', () => {
    let s = empty()
    const suits = 'CDHS'
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
    // 每疊一個花色，由 K 往下排（最上面是 A）
    for (let k = 0; k < 4; k++) s.tableau[k].up = ranks.slice().reverse().map((r) => P(suits[k] + r))
    expect(canAutoFinish(s)).toBe(true)
    for (let i = 0; i < 52; i++) {
      const m = nextFinishMove(s)
      expect(m).not.toBeNull()
      s = ok(s, m!)
    }
    expect(s.won).toBe(true)
    expect(s.score).toBe(520)
  })
})

describe('接龍：復原扣分', () => {
  it('復原回到上一步，並依難度扣分（簡單 20、困難 10），扣分會累積、分數不低於 0', () => {
    const a = empty(1)
    a.waste = [P('HA')]
    const b = ok(a, { type: 'move', from: { pile: 'waste' }, to: { pile: 'foundation', slot: 2 } })
    expect(scoreOf(b)).toBe(10)
    const back = undoTo(a, b)
    expect(back.waste).toEqual([P('HA')])
    expect(back.penalty).toBe(20)
    expect(scoreOf(back)).toBe(0)
    const c = ok(back, { type: 'move', from: { pile: 'waste' }, to: { pile: 'foundation', slot: 2 } })
    expect(c.penalty).toBe(20)
    expect(scoreOf(c)).toBe(0)
    const h = empty(3)
    h.score = 50
    expect(scoreOf(undoTo(h, h))).toBe(40)
    expect(undoTo(h, undoTo(h, h)).penalty).toBe(20)
  })
})

describe('接龍：最後分數', () => {
  it('每 10 秒扣 2 分，不低於 0；過關且超過 30 秒有時間獎勵', () => {
    expect(finalScore(100, 25, false)).toBe(96)
    expect(finalScore(10, 600, false)).toBe(0)
    expect(finalScore(520, 100, true)).toBe(500 + 7000)
    expect(finalScore(520, 20, true)).toBe(516)
  })
})

describe('接龍：提示扣分、自動收牌、卡關', () => {
  it('看一次提示扣分（簡單 15、困難 10）', () => {
    expect(chargeHint(empty(1)).penalty).toBe(15)
    expect(chargeHint(chargeHint(empty(3))).penalty).toBe(20)
  })
  it('桌面還有蓋著的牌：不能自動收牌', () => {
    const s = empty()
    s.tableau[0].down = [P('C2')]
    s.tableau[0].up = [P('CA')]
    expect(finishPlan(s)).toBeNull()
  })
  it('牌都翻開、只靠收牌和翻牌堆就能收完：給出整套步驟，照做會過關', () => {
    let s = empty(1)
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
    // 黑桃、紅心在桌面（由 K 往下），梅花、方塊在牌堆
    s.tableau[0].up = ranks.slice().reverse().map((r) => P('S' + r))
    s.tableau[1].up = ranks.slice().reverse().map((r) => P('H' + r))
    s.stock = [...ranks.map((r) => P('C' + r)), ...ranks.map((r) => P('D' + r))].reverse()
    const plan = finishPlan(s)
    expect(plan).not.toBeNull()
    for (const a of plan!) s = ok(s, a)
    expect(s.won).toBe(true)
  })
  it('收不完（要收的牌被壓在別張下面）：不給自動收牌；換個順序就可以', () => {
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
    const base = empty()
    base.foundations = ['C', 'D', 'H', 'S'].map((x) => ranks.map((r) => P(x + r)))
    base.foundations[0] = base.foundations[0].slice(0, 11)
    base.foundations[3] = base.foundations[3].slice(0, 11)
    const stuck = structuredClone(base)
    stuck.tableau[0].up = [P('CQ'), P('SK')]
    stuck.tableau[1].up = [P('SQ'), P('CK')]
    expect(finishPlan(stuck)).toBeNull()
    const fine = structuredClone(base)
    fine.tableau[0].up = [P('SK'), P('CQ')]
    fine.tableau[1].up = [P('CK'), P('SQ')]
    expect(finishPlan(fine)?.length).toBe(4)
  })
  it('卡關：沒有任何能讓局面前進的步', () => {
    const s = empty()
    s.tableau[0].down = [P('D5')]
    s.tableau[0].up = [P('S9')]
    s.tableau[1].down = [P('C5')]
    s.tableau[1].up = [P('C9')]
    s.stock = [P('H3')]
    expect(isStuck(s)).toBe(true)
    // 牌堆裡有一張能放上桌面：沒卡關
    expect(isStuck({ ...s, stock: [P('H8')] })).toBe(false)
    // 有 A 可以收：沒卡關
    expect(isStuck({ ...s, waste: [P('CA')] })).toBe(false)
    // 搬一串能翻開蓋著的牌：沒卡關
    const t = structuredClone(s)
    t.tableau[2].up = [P('H10')]
    expect(isStuck(t)).toBe(false)
  })
})
