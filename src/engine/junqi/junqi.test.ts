import { describe, expect, it } from 'vitest'
import { seedRng } from '@/engine/common/rng'
import {
  applyJunqi, BOMB, CAMPS, cell, COMMANDER, COMPANY, CORPS, createJunqi, DEFAULT_LAYOUT, DIVISION, ENGINEER, FLAG, HOME, HQS, infoOf, layoutProblem,
  legalMoves, MINE, mirror, PER_SIDE, PLATOON, QUIET_LIMIT, randomLayout, ROAD_ADJ, targetsOf, UNKNOWN, viewFor, type JunqiAction, type JunqiState, type Side,
} from './rules'
import { aiLayout, chooseJunqiAction, movesOf, playOut } from './ai'

const apply = (s: JunqiState, a: JunqiAction) => {
  const r = applyJunqi(s, a)
  if (!r.ok) throw new Error(r.reason)
  return r.state
}
/** 自己擺一個對局中的局面：[點, 哪一方, 什麼子] */
function setup(pieces: [number, Side, number][], turn: Side = 0): JunqiState {
  const s = createJunqi()
  s.phase = 'play'
  s.deployed = [true, true]
  s.turn = turn
  const next = [0, PER_SIDE]
  s.alive = s.alive.map(() => false)
  for (const [at, side, rank] of pieces) {
    const id = next[side]++
    s.board[at] = id
    s.rank[id] = rank
    s.alive[id] = true
  }
  return s
}
const started = () => apply(apply(createJunqi(), { type: 'deploy', side: 0, layout: [...DEFAULT_LAYOUT] }), { type: 'deploy', side: 1, layout: [...DEFAULT_LAYOUT] })

describe('軍棋：棋盤與佈陣', () => {
  it('每人 25 個佈陣點、5 個行營；兩邊只在第 1、3、5 行接起來', () => {
    expect(HOME.length).toBe(25)
    expect(CAMPS.size).toBe(10)
    expect(HQS.size).toBe(4)
    const cross = [0, 1, 2, 3, 4].filter((c) => ROAD_ADJ[cell(6, c)].includes(cell(5, c)))
    expect(cross).toEqual([0, 2, 4])
    expect(ROAD_ADJ[cell(8, 2)].length).toBe(8) // 中間的行營：上下左右＋斜四格
  })
  it('陣形檢查：軍旗在大本營、地雷在最後兩列、炸彈不在第一列', () => {
    expect(layoutProblem(DEFAULT_LAYOUT)).toBe(null)
    const swap = (a: number, b: number) => {
      const l = [...DEFAULT_LAYOUT]
      ;[l[a], l[b]] = [l[b], l[a]]
      return l
    }
    const flagAt = DEFAULT_LAYOUT.indexOf(FLAG)
    expect(layoutProblem(swap(flagAt, 0))).toBe('flag')
    expect(layoutProblem(swap(DEFAULT_LAYOUT.indexOf(MINE), 0))).toBe('mine')
    expect(layoutProblem(swap(DEFAULT_LAYOUT.indexOf(BOMB), 0))).toBe('bomb')
    expect(layoutProblem(DEFAULT_LAYOUT.slice(1))).toBe('count')
  })
  it('隨機陣形、電腦的陣形都合規則', () => {
    let rng = seedRng(3)
    for (let i = 0; i < 200; i++) {
      let l: number[]
      ;[l, rng] = randomLayout(rng)
      expect(layoutProblem(l)).toBe(null)
      ;[l, rng] = aiLayout(rng, i % 2 ? 'high' : 'low')
      expect(layoutProblem(l)).toBe(null)
    }
  })
  it('先手佈陣、再後手佈陣，然後先手先走；不是輪到的不能佈；佈陣時間到用預設陣形', () => {
    const s = createJunqi()
    expect(applyJunqi(s, { type: 'deploy', side: 1, layout: [...DEFAULT_LAYOUT] }).ok).toBe(false)
    const t = apply(s, { type: 'timeout' })
    expect(t.deployed).toEqual([true, false])
    expect(t.rank[HOME.indexOf(HOME[0])]).toBe(DEFAULT_LAYOUT[0])
    const u = apply(t, { type: 'deploy', side: 1, layout: [...DEFAULT_LAYOUT] })
    expect(u.phase).toBe('play')
    expect(u.turn).toBe(0)
    // 1 號的子在上面（轉 180 度）
    expect(u.board[mirror(HOME[0])]).toBe(PER_SIDE)
  })
})

describe('軍棋：走法', () => {
  it('公路一格；鐵路直線不限格數；不能轉彎（工兵可以）', () => {
    const s = setup([[cell(10, 0), 0, DIVISION], [cell(10, 4), 0, ENGINEER], [cell(0, 0), 1, COMPANY]])
    const div = targetsOf(s, cell(10, 0))
    expect(div).toContain(cell(1, 0)) // 左邊鐵路一路往上
    expect(div).toContain(cell(10, 3)) // 第 10 列鐵路往右，停在工兵前面
    expect(div).not.toContain(cell(6, 1)) // 不能轉彎
    const eng = targetsOf(s, cell(10, 4))
    expect(eng).toContain(cell(6, 2)) // 工兵轉彎
    expect(eng).toContain(cell(1, 1))
  })
  it('行營可以斜走；行營裡的子不能被吃', () => {
    const s = setup([[cell(8, 2), 0, PLATOON], [cell(7, 1), 1, COMPANY]])
    expect(targetsOf(s, cell(8, 2))).toContain(cell(9, 3))
    expect(targetsOf(s, cell(8, 2))).not.toContain(cell(7, 1))
  })
  it('第 2、4 行中間是山界不通；地雷、軍旗、大本營裡的子不能動', () => {
    const s = setup([[cell(6, 1), 0, COMPANY], [cell(11, 0), 0, MINE], [cell(11, 1), 0, CORPS], [cell(11, 3), 0, FLAG]])
    expect(targetsOf(s, cell(6, 1))).not.toContain(cell(5, 1))
    expect(targetsOf(s, cell(11, 0))).toEqual([])
    expect(targetsOf(s, cell(11, 1))).toEqual([])
    expect(targetsOf(s, cell(11, 3))).toEqual([])
  })
})

describe('軍棋：碰子', () => {
  const duel = (a: number, d: number) => {
    const s = setup([[cell(7, 0), 0, a], [cell(6, 0), 1, d], [cell(10, 2), 0, COMPANY], [cell(1, 2), 1, COMPANY]])
    return apply(s, { type: 'move', from: cell(7, 0), to: cell(6, 0) })
  }
  it('大吃小、一樣大同歸於盡', () => {
    expect(duel(DIVISION, COMPANY).board[cell(6, 0)]).toBe(0)
    expect(duel(COMPANY, DIVISION).board[cell(6, 0)]).toBe(PER_SIDE)
    const t = duel(COMPANY, COMPANY)
    expect(t.board[cell(6, 0)]).toBe(-1)
    expect(t.last?.out).toBe('tie')
  })
  it('炸彈同歸於盡；碰地雷陣亡、工兵挖地雷', () => {
    expect(duel(BOMB, COMMANDER).last?.out).toBe('tie')
    expect(duel(COMMANDER, MINE).last?.out).toBe('lose')
    expect(duel(ENGINEER, MINE).last?.out).toBe('win')
    expect(duel(BOMB, MINE).last?.out).toBe('tie')
  })
  it('奪到軍旗就贏', () => {
    const t = duel(PLATOON, FLAG)
    expect(t.status).toBe('flag')
    expect(t.winner).toBe(0)
  })
  it('司令陣亡就亮出軍旗', () => {
    const s = setup([[cell(7, 0), 0, BOMB], [cell(6, 0), 1, COMMANDER], [cell(10, 2), 0, COMPANY], [cell(0, 1), 1, FLAG], [cell(1, 2), 1, COMPANY]])
    const t = apply(s, { type: 'move', from: cell(7, 0), to: cell(6, 0) })
    expect(t.flagShown).toEqual([false, true])
    const v = viewFor(t, 0)
    expect(v.rank[t.board[cell(0, 1)]]).toBe(FLAG)
    expect(v.rank[t.board[cell(1, 2)]]).toBe(UNKNOWN)
  })
  it('對方沒有子能走就輸；太久沒碰子和棋', () => {
    const s = setup([[cell(7, 0), 0, DIVISION], [cell(6, 0), 1, COMPANY], [cell(0, 1), 1, FLAG]])
    const t = apply(s, { type: 'move', from: cell(7, 0), to: cell(6, 0) })
    expect(t.status).toBe('stuck')
    expect(t.winner).toBe(0)
    const q = setup([[cell(9, 0), 0, DIVISION], [cell(2, 0), 1, COMPANY]])
    q.quiet = QUIET_LIMIT - 1
    expect(apply(q, { type: 'move', from: cell(9, 0), to: cell(8, 0) }).status).toBe('quiet')
  })
})

describe('軍棋：看不到的局面（連線）', () => {
  it('照伺服器送來的結果套用，跟完整局面一樣', () => {
    let full = started()
    let view = viewFor(full, 1)
    let rng = seedRng(9)
    for (let i = 0; i < 80 && full.status === 'playing'; i++) {
      let a: JunqiAction
      ;[a, rng] = chooseJunqiAction(viewFor(full, full.turn), 'mid', rng)
      const info = a.type === 'move' ? infoOf(full, a.from, a.to) : undefined
      const next = apply(full, a)
      const r = applyJunqi(view, a, info && next.status !== 'playing' && next.status !== 'flag' ? { ...info, end: { status: next.status, winner: next.winner } } : info)
      if (!r.ok) throw new Error(r.reason)
      full = next
      view = r.state
      expect(view.board).toEqual(full.board)
      expect(view.status).toBe(full.status)
    }
  })
})

describe('軍棋：電腦', () => {
  it('不偷看：對方看不到的子換成別的，電腦的決定一樣', () => {
    const s = started()
    const t: JunqiState = { ...s, rank: s.rank.slice() }
    // 把 1 號的子（看不到）整個打亂
    const ids = Array.from({ length: PER_SIDE }, (_, k) => PER_SIDE + k)
    const ranks = ids.map((id) => t.rank[id]).reverse()
    ids.forEach((id, k) => (t.rank[id] = ranks[k]))
    for (const lv of ['low', 'mid', 'high'] as const) expect(chooseJunqiAction(viewFor(t, 0), lv, seedRng(4))).toEqual(chooseJunqiAction(viewFor(s, 0), lv, seedRng(4)))
  })
  it('看得到對方的軍旗就去奪', () => {
    const s = setup([[cell(1, 1), 0, PLATOON], [cell(0, 1), 1, FLAG], [cell(5, 4), 1, CORPS], [cell(10, 2), 0, COMPANY]])
    s.flagShown = [false, true]
    expect(chooseJunqiAction(viewFor(s, 0), 'high', seedRng(1))[0]).toEqual({ type: 'move', from: cell(1, 1), to: cell(0, 1) })
  })
  it('算的時候用的走法跟規則一樣', () => {
    let s = started()
    let rng = seedRng(21)
    for (let i = 0; i < 60 && s.status === 'playing'; i++) {
      for (const side of [0, 1] as Side[]) {
        const fast = movesOf({ board: s.board, rank: s.rank, over: -1 }, side).map((m) => m.from * 100 + m.to).sort((a, b) => a - b)
        const slow = legalMoves(s, side).map((m) => m.from * 100 + m.to).sort((a, b) => a - b)
        expect(fast).toEqual(slow)
      }
      let a: JunqiAction
      ;[a, rng] = chooseJunqiAction(viewFor(s, s.turn), 'low', rng)
      s = apply(s, a)
    }
  })
  it('電腦下得完，中比低強（12 局）', () => {
    let wins = 0
    let losses = 0
    for (let g = 0; g < 12; g++) {
      const midFirst = g % 2 === 0
      const [end] = playOut(createJunqi(), midFirst ? ['mid', 'low'] : ['low', 'mid'], seedRng(g * 131 + 7))
      expect(end.status).not.toBe('playing')
      if (end.winner === null) continue
      if ((end.winner === 0) === midFirst) wins++
      else losses++
    }
    expect(wins).toBeGreaterThanOrEqual(losses + 3)
  }, 120000)
})
