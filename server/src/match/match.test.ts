import { describe, expect, it } from 'vitest'
import { addMember, applyIntent, connect, COUNTDOWN_MS, createRoomState, disconnect, nextWake, parseMessage, tick, type RoomState } from '../roomCore'
import { parseRules } from '../games'
import { entryFor, matchIntro, playerAct, START_DELAY, type MatchState } from './run'
import type { BigTwoState } from '../../../src/engine/bigtwo/game'
import type { SevensState } from '../../../src/engine/sevens/rules'
import type { RedPointState } from '../../../src/engine/redpoint/rules'

let n = 0
const rand = (bytes: number) => (n++).toString(16).padStart(bytes * 2, '0')
const T0 = 1_000_000

/** 開房、humans 個人進房、選好模式、大家準備 → 倒數完開局 */
function started(gameId: string, humans = 2, rules: Record<string, string | boolean> = {}) {
  const { room, member } = createRoomState('1234', { name: 'A' }, T0, rand)
  const ids = [member.id]
  for (let k = 1; k < humans; k++) {
    const m = addMember(room, { name: `P${k}` }, T0, rand)
    if (typeof m === 'string') throw new Error(m)
    ids.push(m.id)
  }
  for (const id of ids) connect(room, id, T0)
  applyIntent(room, ids[0], { t: 'mode', gameId }, T0)
  applyIntent(room, ids[0], { t: 'rules', gameId, options: rules }, T0)
  for (const id of ids) applyIntent(room, id, { t: 'ready', on: true }, T0)
  const r = tick(room, T0 + COUNTDOWN_MS, 12345)
  expect(r.started).toBe(true)
  return { room, ids, m: room.match! }
}

/** 一直讓時間往前走（電腦出牌、真人逾時）直到結束 */
function runToEnd(room: RoomState, from: number) {
  let t = from
  for (let k = 0; k < 3000 && room.match && !room.match.over; k++) {
    t = Math.max(t + 1, nextWake(room))
    tick(room, t, 1)
  }
  return t
}

describe('連線對局（伺服器當裁判）', () => {
  for (const gameId of ['bigtwo', 'crazybigtwo', 'sevens', 'redpoint']) {
    it(`${gameId}：兩個真人＋兩個電腦，一路跑到結束（真人沒動就逾時跳過），最後攤牌`, () => {
      const { room, m } = started(gameId)
      expect(m.seats.filter((s) => s.pid)).toHaveLength(2)
      expect(new Set(m.seats.map((s) => s.bot)).size).toBe(4)
      // 發牌動畫播完前誰都不動
      expect(nextWake(room)).toBeGreaterThanOrEqual(T0 + COUNTDOWN_MS + START_DELAY)
      runToEnd(room, T0 + COUNTDOWN_MS)
      expect(m.over).toBe(true)
      const last = m.log[m.log.length - 1]
      expect(last.end).toBe(true)
      expect(m.log.map((e) => e.seq)).toEqual(m.log.map((_, i) => i + 1))
    })
  }

  it('伺服器的鬧鐘早幾毫秒響也照樣處理（不然對局會卡住）', () => {
    const { room } = started('sevens', 1)
    const before = room.match!.log.length
    const at = nextWake(room)
    tick(room, at - 20, 1)
    expect(room.match!.log.length).toBe(before + 1)
  })

  it('只有輪到的人能出；出的牌要在自己手上、合規則；格式不對不收', () => {
    const { room, ids, m } = started('bigtwo')
    const s = m.s as BigTwoState
    const t = s.turn
    const pid = m.seats[t].pid
    const now = T0 + COUNTDOWN_MS + START_DELAY
    const other = ids.find((x) => x !== pid)!
    expect(playerAct(room, other, { type: 'pass' }, now)).toEqual([])
    if (pid) {
      // 第一手要有梅花 3（牌編號 0）
      expect(playerAct(room, pid, { type: 'play', cards: [s.hands[t].find((c) => c !== 0)!] }, now)).toEqual([])
      expect(playerAct(room, pid, { type: 'play', cards: 'x' }, now)).toEqual([])
      const ok = playerAct(room, pid, { type: 'play', cards: [0] }, now)
      expect(ok).toHaveLength(1)
      expect(ok[0].pub).toEqual({ type: 'play', player: t, cards: [0] })
    }
  })

  it('開局資訊：只有自己的手牌，別人只知道張數；不給發牌的種子', () => {
    const { ids, m } = started('bigtwo')
    const intro = matchIntro(m, ids[1])
    const s = m.s as BigTwoState
    const json = JSON.stringify(intro)
    expect(intro.seat).toBe(1)
    expect((intro.start as { hand: number[] }).hand).toEqual(s.hands[1])
    expect((intro.start as { counts: number[] }).counts).toEqual([13, 13, 13, 13])
    // 別人的手牌不在裡面（拿一手別人的牌比對整串）
    expect(json).not.toContain(JSON.stringify(s.hands[0]))
    expect(json).not.toContain('seed')
  })

  it('排七：蓋牌只有自己知道蓋了哪張，別人只看到「蓋了一張」', () => {
    const { room, m } = started('sevens', 1)
    runToEnd(room, T0 + COUNTDOWN_MS)
    const cover = m.log.find((e) => (e.pub as { type: string }).type === 'cover')!
    expect(cover).toBeTruthy()
    expect((entryFor(cover, cover.seat) as { card: number }).card).toBeGreaterThanOrEqual(0)
    expect((entryFor(cover, (cover.seat + 1) % 4) as { card: number }).card).toBe(-1)
    // 結束攤牌：大家都看得到蓋了什麼
    const end = m.log[m.log.length - 1].pub as SevensState
    expect(end.covered.flat().length).toBeGreaterThan(0)
  })

  it('撿紅點：輪到翻牌時，牌堆最上面那張翻開給大家看（其他時候牌堆不給）', () => {
    const { room, m } = started('redpoint', 1)
    runToEnd(room, T0 + COUNTDOWN_MS)
    const plays = m.log.filter((e) => (e.pub as { type: string }).type === 'play')
    expect(plays.length).toBeGreaterThan(0)
    // 牌堆還有牌時，出完牌一定接著翻牌（有 top）；牌堆翻完就沒有了
    expect(plays.filter((e) => typeof (e.pub as { top?: number }).top === 'number').length).toBeGreaterThan(10)
    const intro = matchIntro(m, m.seats[0].pid!)
    expect((intro.start as { pile: unknown }).pile).toBe(24)
    expect((m.log[m.log.length - 1].pub as RedPointState).phase).toBe('over')
  })

  it('真人斷線或離開對局：輪到他時改由電腦代打（很快就出）；連回來又換回自己', () => {
    const { room, ids, m } = started('sevens', 4)
    const now = T0 + COUNTDOWN_MS + START_DELAY
    const t = (m.s as SevensState).turn
    const pid = m.seats[t].pid!
    const wait = nextWake(room) - now
    expect(wait).toBeGreaterThan(15_000) // 真人：等倒數
    disconnect(room, pid, now)
    expect(room.match!.nextAt - now).toBeLessThan(3000)
    connect(room, pid, now)
    expect(room.match!.nextAt - now).toBeGreaterThan(15_000)
    applyIntent(room, pid, { t: 'back' }, now)
    expect(room.match!.nextAt - now).toBeLessThan(3000)
    expect(ids).toContain(pid)
  })

  it('大家都回到房間：對局收掉，回到等待中；可以再開下一局（局號往上加）', () => {
    const { room, ids, m } = started('redpoint')
    const t = runToEnd(room, T0 + COUNTDOWN_MS)
    for (const id of ids) applyIntent(room, id, { t: 'back' }, t)
    expect(room.phase).toBe('lobby')
    expect(room.match).toBeUndefined()
    for (const id of ids) applyIntent(room, id, { t: 'ready', on: true }, t)
    tick(room, t + COUNTDOWN_MS, 99)
    expect((room.match as MatchState).n).toBe(m.n + 1)
  })

  it('房主的規則設定：照著開局；不是房主不能改；不認得的設定整份不收', () => {
    const { room, ids, m } = started('bigtwo', 2, { allowFlush: true, difficulty: 'high' })
    expect(m.opts).toEqual({ allowFlush: true, difficulty: 'high' })
    expect((m.s as BigTwoState).options.allowFlush).toBe(true)
    applyIntent(room, ids[1], { t: 'rules', gameId: 'bigtwo', options: { allowFlush: false } }, T0)
    expect(room.rules!.options.allowFlush).toBe(true)
    expect(parseRules('bigtwo', { allowFlush: 'yes' })).toBeNull()
    expect(parseRules('bigtwo', { hacked: true })).toBeNull()
    expect(parseRules('gomoku', {})).toBeNull()
    expect(parseMessage(JSON.stringify({ t: 'act', a: { type: 'pass' } }))).toEqual({ t: 'act', a: { type: 'pass' } })
    expect(parseMessage(JSON.stringify({ t: 'act', a: 3 }))).toBeNull()
  })

  it('還不能同步的玩法（棋類）：照樣開局，但伺服器不發牌', () => {
    const { room, member } = createRoomState('5678', { name: 'A' }, T0, rand)
    connect(room, member.id, T0)
    applyIntent(room, member.id, { t: 'mode', gameId: 'gomoku' }, T0)
    applyIntent(room, member.id, { t: 'ready', on: true }, T0)
    expect(tick(room, T0 + COUNTDOWN_MS, 1).started).toBe(true)
    expect(room.match).toBeUndefined()
  })
})
