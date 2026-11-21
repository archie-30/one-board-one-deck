import { describe, expect, it } from 'vitest'
import { seedRng } from '../common/rng'
import { chooseDotsAction, endgame, partsOf, type DotsLevel } from './ai'
import { applyDots, boxesOf, createDots, edgesOf, endsOf, hCount, isSafe, lineCount, sizeOf, type DotsAction, type DotsState } from './rules'

const ok = (s: DotsState, a: DotsAction) => {
  const r = applyDots(s, a)
  if (!r.ok) throw new Error(r.reason)
  return r.state
}
const L = (line: number): DotsAction => ({ type: 'line', line })
/** 把一串線依序畫上去（不管輪到誰，測試擺局面用） */
function draw(s: DotsState, lines: number[]): DotsState {
  return { ...s, lines: s.lines.map((v, i) => (lines.includes(i) ? 1 : v)) }
}

describe('點格棋：棋盤', () => {
  it('難度決定大小：低 4、中 5、高 6 格', () => {
    expect([sizeOf('low'), sizeOf('mid'), sizeOf('high'), sizeOf('???')]).toEqual([4, 5, 6, 5])
    expect(lineCount(4)).toBe(40)
    expect(createDots(6).boxes.length).toBe(36)
  })
  it('每格四邊、每條線旁邊一或兩格、端點相鄰', () => {
    const n = 3
    expect(edgesOf(n, 4)).toEqual([4, 7, hCount(n) + 5, hCount(n) + 6])
    for (let l = 0; l < lineCount(n); l++) {
      const bs = boxesOf(n, l)
      expect(bs.length === 1 || bs.length === 2).toBe(true)
      for (const b of bs) expect(edgesOf(n, b)).toContain(l)
      const [a, b] = endsOf(n, l)
      expect(b - a === 1 || b - a === n + 1).toBe(true)
    }
  })
})

describe('點格棋：規則', () => {
  it('沒圍到格子就換人；圍到就拿到那一格、再畫一條', () => {
    let s = createDots(2)
    const [t, b, l, r] = edgesOf(2, 0)
    s = ok(s, L(t))
    expect(s.turn).toBe(1)
    s = ok(s, L(b))
    s = ok(s, L(l))
    expect(s.turn).toBe(1)
    s = ok(s, L(r)) // 1 號畫第四邊
    expect(s.boxes[0]).toBe(1)
    expect(s.score).toEqual([0, 1])
    expect(s.turn).toBe(1)
    expect(s.last).toEqual({ side: 1, line: r, boxes: [0] })
  })
  it('一條線同時圍住兩格：兩格都拿', () => {
    const n = 2
    // 第 0、1 格只差中間那條直線
    const mid = edgesOf(n, 0)[3]
    let s = draw(createDots(n), [...edgesOf(n, 0), ...edgesOf(n, 1)].filter((e) => e !== mid))
    s = ok(s, L(mid))
    expect(s.score).toEqual([2, 0])
    expect(s.turn).toBe(0)
  })
  it('畫過的線不能再畫；結束後不能動', () => {
    let s = ok(createDots(2), L(0))
    expect(applyDots(s, L(0))).toEqual({ ok: false, reason: 'taken' })
    expect(applyDots(s, L(999))).toEqual({ ok: false, reason: 'illegal' })
    s = ok(s, { type: 'resign', side: 1 })
    expect(s.winner).toBe(0)
    expect(applyDots(s, L(1))).toEqual({ ok: false, reason: 'over' })
  })
  it('時間到：這一手跳過、換對方', () => {
    const s = ok(createDots(3), { type: 'timeout' })
    expect(s.turn).toBe(1)
    expect(s.lines.every((v) => v === 0)).toBe(true)
  })
  it('線畫完就結束：格子多的贏，一樣多和局', () => {
    let s = createDots(2)
    let rng = seedRng(3)
    while (s.status === 'playing') {
      let a: DotsAction
      ;[a, rng] = chooseDotsAction(s, 'mid', rng)
      s = ok(s, a)
    }
    expect(s.status).toBe('done')
    expect(s.score[0] + s.score[1]).toBe(4)
    expect(s.winner).toBe(s.score[0] === s.score[1] ? null : s.score[0] > s.score[1] ? 0 : 1)
  })
})

describe('點格棋：電腦', () => {
  it('能吃一定吃（中、高）', () => {
    const [t, b, l] = edgesOf(3, 4)
    const s = draw(createDots(3), [t, b, l])
    for (const lv of ['mid', 'high'] as const) {
      const [a] = chooseDotsAction(s, lv, seedRng(1))
      expect(a).toEqual(L(edgesOf(3, 4)[3]))
    }
  })
  it('有安全的線就不送格子（中、高）', () => {
    const [t, b] = edgesOf(3, 4)
    const s = draw(createDots(3), [t, b])
    for (const lv of ['mid', 'high'] as const)
      for (let seed = 1; seed < 20; seed++) {
        const [a] = chooseDotsAction(s, lv, seedRng(seed))
        expect(a.type === 'line' && isSafe(s, a.line)).toBe(true)
      }
  })
  it('鏈的結算：只剩一串 3 格，開的人一定送 3 格；兩串 3 格，接手的人留兩格反而多賺', () => {
    expect(endgame([{ loop: false, size: 3 }])).toBe(-3)
    expect(endgame([{ loop: false, size: 3 }, { loop: false, size: 3 }])).toBe(-2)
    expect(endgame([])).toBe(0)
  })
  it('把格子分成鏈：一排 3 格、兩頭通到外面＝一串 3 格的鏈', () => {
    const n = 3
    // 第一列三格：上下邊都畫了，左右邊沒畫
    const lines = [0, 1, 2, 3, 4, 5]
    const s = { ...draw(createDots(n), lines), boxes: createDots(n).boxes.map((v, i) => (i < 3 ? v : 0)) }
    const parts = partsOf(s)
    expect(parts).toHaveLength(1)
    expect(parts[0]).toMatchObject({ loop: false, size: 3 })
  })
  it('難度一級比一級強（5 × 5，電腦互下）', () => {
    const run = (a: DotsLevel, b: DotsLevel, games: number) => {
      let wins = 0
      for (let g = 0; g < games; g++) {
        const swap = g % 2 === 1
        let s = createDots(5)
        let rng = seedRng(g * 13 + 5)
        while (s.status === 'playing') {
          let act: DotsAction
          ;[act, rng] = chooseDotsAction(s, (s.turn === 0) !== swap ? a : b, rng)
          s = ok(s, act)
        }
        if (s.winner === (swap ? 1 : 0)) wins++
      }
      return wins
    }
    expect(run('mid', 'low', 16)).toBeGreaterThanOrEqual(12)
    expect(run('high', 'mid', 16)).toBeGreaterThanOrEqual(11)
  }, 60000)
})
