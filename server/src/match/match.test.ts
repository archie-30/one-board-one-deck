import { describe, expect, it } from 'vitest'
import { addMember, applyIntent, connect, COUNTDOWN_MS, createRoomState, disconnect, nextWake, parseMessage, tick, type RoomState } from '../roomCore'
import { parseRules } from '../games'
import { entryFor, matchIntro, playerAct, START_DELAY, type MatchState } from './run'
import type { BigTwoState } from '../../../src/engine/bigtwo/game'
import type { SevensState } from '../../../src/engine/sevens/rules'
import type { RedPointState } from '../../../src/engine/redpoint/rules'
import { legalMoves, type OthelloState } from '../../../src/engine/othello/rules'

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

/** 讓時間往前走幾步 */
function runSome(room: RoomState, from: number, steps: number) {
  let t = from
  for (let k = 0; k < steps && room.match && !room.match.over; k++) {
    t = Math.max(t + 1, nextWake(room))
    tick(room, t, 1)
  }
  return t
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
    expect(parseRules('solitaire', {})).toBeNull()
    expect(parseMessage(JSON.stringify({ t: 'act', a: { type: 'pass' } }))).toEqual({ t: 'act', a: { type: 'pass' } })
    expect(parseMessage(JSON.stringify({ t: 'act', a: 3 }))).toBeNull()
  })

  for (const gameId of ['gomoku', 'go', 'othello', 'chess', 'xiangqi', 'banqi']) {
    it(`${gameId}：先猜拳（都沒出就隨便一個先），再一路跑到結束`, () => {
      const { room, m } = started(gameId, 2, gameId === 'go' ? { size: '9' } : {})
      expect(m.first).toBe(-1)
      expect(m.rps).not.toBeNull()
      runToEnd(room, T0 + COUNTDOWN_MS)
      expect(m.first).toBeGreaterThanOrEqual(0)
      expect(m.over).toBe(true)
      expect(m.log[m.log.length - 1].end).toBe(true)
    }, 60000)
  }

  it('猜拳：兩人出拳比勝負；平手再來一輪；只有一個人出、時間到就是出的人贏；猜拳中不能下棋', () => {
    const { room, ids, m } = started('gomoku')
    const now = T0 + COUNTDOWN_MS + 1000
    expect(playerAct(room, ids[0], { type: 'place', index: 0 }, now)).toEqual([])
    expect((playerAct(room, ids[0], { type: 'rps', hand: 'rock' }, now)[0].pub as { type: string }).type).toBe('rpsPicked')
    // 出過了不能改
    expect(playerAct(room, ids[0], { type: 'rps', hand: 'paper' }, now)).toEqual([])
    const tie = playerAct(room, ids[1], { type: 'rps', hand: 'rock' }, now)
    expect(tie[0].pub).toMatchObject({ type: 'rps', winner: -1 })
    expect(m.rps).not.toBeNull()
    playerAct(room, ids[1], { type: 'rps', hand: 'paper' }, now)
    tick(room, m.rps!.deadline, 1)
    expect(m.first).toBe(1)
    expect(m.log[m.log.length - 1].pub).toMatchObject({ type: 'rps', winner: 1, missed: [true, false] })
  })

  it('悔棋：要對方同意；不同意就算了；每局一次；同意後退回到他上一手之前', () => {
    const { room, ids, m } = started('gomoku')
    let now = T0 + COUNTDOWN_MS + 1000
    playerAct(room, ids[0], { type: 'rps', hand: 'paper' }, now)
    playerAct(room, ids[1], { type: 'rps', hand: 'rock' }, now)
    expect(m.first).toBe(0)
    now += 3000
    playerAct(room, ids[0], { type: 'place', index: 112 }, now)
    playerAct(room, ids[1], { type: 'place', index: 113 }, now)
    // B 還沒下過不能悔；A 申請悔棋
    expect(playerAct(room, ids[0], { type: 'undo' }, now)[0].pub).toEqual({ type: 'undoAsk', by: 0 })
    // 自己不能回答自己
    expect(playerAct(room, ids[0], { type: 'undoReply', ok: true }, now)).toEqual([])
    expect(playerAct(room, ids[1], { type: 'undoReply', ok: false }, now)[0].pub).toEqual({ type: 'undoNo', by: 0 })
    expect(playerAct(room, ids[0], { type: 'undo' }, now)).toHaveLength(1)
    const ok = playerAct(room, ids[1], { type: 'undoReply', ok: true }, now)
    expect(ok[0].pub).toEqual({ type: 'undo', by: 0, moves: 0 })
    expect((m.s as { moves: number[] }).moves).toEqual([])
    // 每局一次
    playerAct(room, ids[0], { type: 'place', index: 112 }, now)
    expect(playerAct(room, ids[0], { type: 'undo' }, now)).toEqual([])
  })

  it('悔棋：對手是電腦就直接同意', () => {
    const { room, ids, m } = started('othello', 1)
    let now = T0 + COUNTDOWN_MS + 1000
    playerAct(room, ids[0], { type: 'rps', hand: 'paper' }, now)
    tick(room, m.rps?.deadline ?? now, 1)
    now += 5000
    const me = (0 - m.first + 2) % 2
    // 真人自己下兩手（電腦照常回）
    for (let k = 0; k < 6 && m.acts.filter((x) => x.side === me).length < 2; k++) {
      const s = m.s as OthelloState
      if (s.turn - 1 === me) playerAct(room, ids[0], { type: 'play', index: legalMoves(s.board, s.turn)[0] }, now)
      else tick(room, (now = Math.max(now, nextWake(room))), 1)
    }
    const before = m.acts.length
    const r = playerAct(room, ids[0], { type: 'undo' }, now)
    expect(r[0].pub).toMatchObject({ type: 'undo', by: me })
    expect(m.acts.length).toBeLessThan(before)
  })

  it('認輸：任何時候都可以（不用輪到自己）；五子棋、黑白棋沒有認輸', () => {
    const { room, ids, m } = started('chess')
    const now = T0 + COUNTDOWN_MS + 1000
    playerAct(room, ids[0], { type: 'rps', hand: 'paper' }, now)
    playerAct(room, ids[1], { type: 'rps', hand: 'rock' }, now)
    const r = playerAct(room, ids[1], { type: 'resign' }, now + 3000)
    expect(r[0].pub).toEqual({ type: 'resign', player: 1 })
    expect(m.over).toBe(true)
    expect((r[1].pub as { winner: string }).winner).toBe('w')
    const g = started('gomoku')
    expect(playerAct(g.room, g.ids[0], { type: 'resign' }, now)).toEqual([])
  })

  it('暗棋：開局只給「哪裡有棋」，不給是哪顆；翻開時才告訴大家', () => {
    const { room, m } = started('banqi')
    const intro = matchIntro(m, m.seats[0].pid!)
    expect((intro.start as { board: string[] }).board.every((p) => p === '?')).toBe(true)
    runToEnd(room, T0 + COUNTDOWN_MS)
    const flip = m.log.find((e) => (e.pub as { type: string }).type === 'flip')!
    expect(typeof (flip.pub as { piece: string }).piece).toBe('string')
  })

  it('圍棋：雙方都虛手後，照電腦判斷的死活結算（攤牌時附上死子）', () => {
    const { room, m } = started('go', 2, { size: '9' })
    runToEnd(room, T0 + COUNTDOWN_MS)
    const fin = m.log[m.log.length - 1].pub as { state: { phase: string }; dead: number[] }
    expect(fin.state.phase).toBe('over')
    expect(Array.isArray(fin.dead)).toBe(true)
  })
})
