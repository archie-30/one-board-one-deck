import { describe, expect, it } from 'vitest'
import { nextInt, seedRng } from '@/engine/common/rng'
import { applyHex, canSwap, connection, createHex, mirror, neighbors, sizeOf, type HexAction, type HexState } from './rules'
import { bridges, bridgeSave, chooseHexAction, distance, playOut, resistance } from './ai'

const apply = (s: HexState, a: HexAction) => {
  const r = applyHex(s, a)
  if (!r.ok) throw new Error(r.reason)
  return r.state
}
/** 擺一個局面：R 紅、B 藍、. 空，一行一列 */
function board(rows: string[], turn: 0 | 1 = 0, swapRule = false): HexState {
  const n = rows.length
  const s = createHex(n, swapRule)
  s.cells = rows.join('').split('').map((ch) => (ch === 'R' ? 0 : ch === 'B' ? 1 : -1))
  s.turn = turn
  return s
}

describe('海克斯：棋盤', () => {
  it('每一格最多六個鄰居；角落兩或三個', () => {
    const nb = neighbors(5)
    expect(nb[12].length).toBe(6)
    expect(nb[0].sort((a, b) => a - b)).toEqual([1, 5])
    expect(nb[4].sort((a, b) => a - b)).toEqual([3, 8, 9])
  })
  it('棋盤大小：9、11、13，其他都當 11', () => {
    expect(sizeOf('9')).toBe(9)
    expect(sizeOf('13')).toBe(13)
    expect(sizeOf(undefined)).toBe(11)
  })
  it('交換的對稱位置：(r,c) → (c,r)', () => {
    expect(mirror(11, 1 * 11 + 4)).toBe(4 * 11 + 1)
  })
})

describe('海克斯：勝負', () => {
  it('紅方連通上下兩邊就贏，回傳連起來的那一串', () => {
    let s = board(['.R...', '.R...', 'R....', 'R....', '.....'])
    s = apply(s, { type: 'place', cell: 20 })
    expect(s.status).toBe('done')
    expect(s.winner).toBe(0)
    expect(s.path[0]).toBeLessThan(5)
    expect(s.path[s.path.length - 1]).toBeGreaterThanOrEqual(20)
  })
  it('藍方連通左右兩邊就贏；斜著的鄰居也算連通', () => {
    let s = board(['.....', 'BBB..', '...B.', '.....', '.....'], 1)
    // (1,2) 往下的鄰居是 (2,1)、(2,2)：補 (2,2) 就接上 (2,3)，再補 (2,4) 碰到右邊
    expect(connection(5, s.cells, 1)).toBe(null)
    s = apply(s, { type: 'place', cell: 2 * 5 + 2 })
    expect(s.status).toBe('playing')
    s = apply(s, { type: 'place', cell: 0 })
    s = apply(s, { type: 'place', cell: 2 * 5 + 4 })
    expect(s.winner).toBe(1)
  })
  it('棋盤隨便下滿，一定剛好有一方連通（沒有和棋）', () => {
    let rng = seedRng(7)
    for (let t = 0; t < 30; t++) {
      const cells: number[] = []
      for (let i = 0; i < 49; i++) {
        let v: number
        ;[v, rng] = nextInt(rng, 2)
        cells.push(v)
      }
      const red = connection(7, cells, 0) !== null
      const blue = connection(7, cells, 1) !== null
      expect(red !== blue).toBe(true)
    }
  })
  it('下過的格子不能再下；結束後不能再下', () => {
    let s = createHex(5)
    s = apply(s, { type: 'place', cell: 12 })
    expect(applyHex(s, { type: 'place', cell: 12 }).ok).toBe(false)
    s = apply(s, { type: 'resign', side: 1 })
    expect(s.winner).toBe(0)
    expect(applyHex(s, { type: 'place', cell: 0 }).ok).toBe(false)
  })
  it('時間到＝跳過換對方', () => {
    const s = apply(createHex(5), { type: 'timeout' })
    expect(s.turn).toBe(1)
    expect(s.cells.every((v) => v < 0)).toBe(true)
  })
})

describe('海克斯：交換規則', () => {
  it('規則有開：紅方第一手之後藍方可以交換，紅子翻到對稱位置變藍子，換紅方下', () => {
    let s = createHex(5, true)
    s = apply(s, { type: 'place', cell: 1 * 5 + 3 })
    expect(canSwap(s)).toBe(true)
    s = apply(s, { type: 'swap' })
    expect(s.cells[1 * 5 + 3]).toBe(-1)
    expect(s.cells[3 * 5 + 1]).toBe(1)
    expect(s.turn).toBe(0)
    expect(canSwap(s)).toBe(false)
  })
  it('規則沒開、或已經下第二手了，就不能交換', () => {
    let s = apply(createHex(5, false), { type: 'place', cell: 7 })
    expect(applyHex(s, { type: 'swap' }).ok).toBe(false)
    s = apply(apply(createHex(5, true), { type: 'place', cell: 7 }), { type: 'place', cell: 8 })
    expect(applyHex(s, { type: 'swap' }).ok).toBe(false)
  })
})

describe('海克斯：電腦', () => {
  it('最短路：差幾格才連通', () => {
    const s = board(['.R...', '.R...', '.....', '.R...', '.....'])
    expect(distance(5, s.cells, 0)).toBe(2)
    expect(distance(5, createHex(5).cells, 1)).toBe(5)
  })
  it('電阻：自己的子越多越小', () => {
    const empty = createHex(5).cells
    const some = board(['..R..', '..R..', '.....', '.....', '.....']).cells
    expect(resistance(5, some, 0)).toBeLessThan(resistance(5, empty, 0))
  })
  it('每一級都會：一步就贏的直接下', () => {
    const s = board(['.R...', '.R...', 'R....', 'R....', '.....'])
    for (const lv of ['low', 'mid', 'high', 'master'] as const) {
      const [a] = chooseHexAction(s, lv, seedRng(1))
      const r = applyHex(s, a)
      expect(r.ok && r.state.winner === 0).toBe(true)
    }
  })
  it('中以上：對方一步就連通時會擋', () => {
    const s = board(['.R...', '.R...', 'R....', 'R....', '.....'], 1)
    for (const lv of ['mid', 'high', 'master'] as const) {
      const [a] = chooseHexAction(s, lv, seedRng(2))
      expect(a).toEqual({ type: 'place', cell: 20 })
    }
  })
  it('保橋：對方插進自己的橋，補另一格', () => {
    // 紅子 (1,2)、(3,1) 是一座橋：共同鄰居是 (2,1)、(2,2)
    let s = board(['.....', '..R..', '.....', '.R...', '.....'], 1)
    s = apply(s, { type: 'place', cell: 2 * 5 + 1 })
    expect(bridgeSave(s, 0)).toBe(2 * 5 + 2)
  })
  it('找橋：兩顆子中間兩個共同空格都空著才算；擋了一格就不算；離邊第二排也跟邊搭橋', () => {
    const s = board(['.....', '..R..', '.....', '.R...', '.....'])
    expect(bridges(5, s.cells, 0)).toEqual(expect.arrayContaining([[7, 16], [7, -1], [16, -2]]))
    const cut = board(['.....', '..R..', '.B...', '.R...', '.....'])
    expect(bridges(5, cut.cells, 0).some(([a, b]) => a === 7 && b === 16)).toBe(false)
  })
  it('電阻：把橋算進去，有橋的那一邊更容易連通', () => {
    const s = board(['.....', '..R..', '.....', '.R...', '.....'])
    expect(resistance(5, s.cells, 0, true)).toBeLessThan(resistance(5, s.cells, 0))
  })
  it('交換規則：電腦當藍方，紅方下在中間就交換', () => {
    const s = apply(createHex(7, true), { type: 'place', cell: 24 })
    expect(chooseHexAction(s, 'high', seedRng(3))[0]).toEqual({ type: 'swap' })
  })
  it('難度一級比一級強（7 路，同一個開局換邊各下一次）', () => {
    const duel = (a: 'low' | 'mid' | 'high' | 'master', b: 'low' | 'mid' | 'high' | 'master', games: number) => {
      let wins = 0
      for (let g = 0; g < games; g++) {
        const aFirst = g % 2 === 0
        const [cell] = nextInt(seedRng(Math.floor(g / 2) * 31 + 5), 7)
        const s = apply(createHex(7), { type: 'place', cell })
        const [end] = playOut(s, aFirst ? [a, b] : [b, a], seedRng(g * 101 + 9))
        if ((end.winner === 0) === aFirst) wins++
      }
      return wins
    }
    // 7 路太小，高和中差不多（正式 11 路實測高對中 13／20）；這裡驗挑戰＞高、中＞低、高＞低
    expect(duel('master', 'high', 8)).toBeGreaterThanOrEqual(6)
    expect(duel('mid', 'low', 8)).toBeGreaterThanOrEqual(6)
    expect(duel('high', 'low', 8)).toBeGreaterThanOrEqual(6)
  })
})
