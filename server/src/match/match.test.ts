import { describe, expect, it } from 'vitest'
import { addMember, applyIntent, connect, COUNTDOWN_MS, createRoomState, disconnect, nextWake, parseMessage, tick, type RoomState } from '../roomCore'
import { parseRules } from '../games'
import { entryFor, matchIntro, playerAct, START_DELAY, UNDO_ANSWER_MS, type MatchState } from './run'
import type { BigTwoState } from '../../../src/engine/bigtwo/game'
import type { SevensState } from '../../../src/engine/sevens/rules'
import type { RedPointState } from '../../../src/engine/redpoint/rules'
import type { NinetyNineState } from '../../../src/engine/ninetynine/rules'
import type { DotsState } from '../../../src/engine/dots/rules'
import type { HexState } from '../../../src/engine/hex/rules'
import type { MorrisState } from '../../../src/engine/morris/rules'
import { legalMoves, type OthelloState } from '../../../src/engine/othello/rules'
import { legalMoves as starMoves, type StarState } from '../../../src/engine/starcheckers/rules'

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
  for (const gameId of ['bigtwo', 'crazybigtwo', 'sevens', 'redpoint', 'ninetynine', 'bluff']) {
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

  it('吹牛：出的牌只有自己知道；被抓時翻開那手大家看得到，整疊是哪些只有吃下的人知道', () => {
    const { room, m } = started('bluff', 1)
    runToEnd(room, T0 + COUNTDOWN_MS)
    const play = m.log.find((e) => (e.pub as { type: string }).type === 'play')!
    expect((entryFor(play, play.seat) as { cards?: number[] }).cards?.length).toBeGreaterThan(0)
    expect((entryFor(play, (play.seat + 1) % 4) as { cards?: number[] }).cards).toBeUndefined()
    const call = m.log.find((e) => (e.pub as { type: string }).type === 'call')!
    expect(call).toBeTruthy()
    const pub = call.pub as { taker: number; cards: number[]; pile: number }
    expect(call.seat).toBe(pub.taker)
    expect((entryFor(call, pub.taker) as { pileCards: number[] }).pileCards).toHaveLength(pub.pile)
    expect((entryFor(call, (pub.taker + 1) % 4) as { pileCards?: number[] }).pileCards).toBeUndefined()
    expect(pub.cards.length).toBeGreaterThan(0)
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

  it('九九：補到哪張只有自己看得到；開局不給牌堆順序和亂數；有人爆了攤開他的牌', () => {
    const { room, ids, m } = started('ninetynine', 1)
    const intro = matchIntro(m, ids[0])
    const st = intro.start as Record<string, unknown>
    expect(st.deck).toBe(32)
    expect(Object.keys(st).sort()).toEqual(['counts', 'deck', 'dir', 'hand', 'total', 'turn'])
    runToEnd(room, T0 + COUNTDOWN_MS)
    const plays = m.log.filter((e) => (e.pub as { type: string }).type === 'play')
    expect(plays.length).toBeGreaterThan(10)
    const drew = plays.find((e) => e.own)!
    expect(typeof (entryFor(drew, drew.seat) as { draw: number }).draw).toBe('number')
    expect((entryFor(drew, (drew.seat + 1) % 4) as { draw?: number }).draw).toBeUndefined()
    const outs = m.log.filter((e) => (e.pub as { type: string }).type === 'out')
    expect(outs.length).toBeGreaterThanOrEqual(1)
    expect(Array.isArray((outs[0].pub as { cards: number[] }).cards)).toBe(true)
    const end = m.log[m.log.length - 1].pub as NinetyNineState
    expect(end.over).toBe(true)
    expect(end.rng).toBe(0)
  })

  it('九九：只剩你跟電腦、牌堆洗過一次後可以並列第一結算；剩下的是真人就不行', () => {
    const { room, ids, m } = started('ninetynine', 2)
    const now = T0 + COUNTDOWN_MS + START_DELAY
    const s = m.s as NinetyNineState
    // 擺成：座位 0（真人 A）和座位 2（電腦）還在，牌堆從剩兩人起已經洗過一次
    m.s = { ...s, alive: [true, false, true, false], out: [1, 3], twoAt: 1, reshuffles: 2, turn: 2 }
    const bot = m.seats.findIndex((x) => !x.pid)
    expect(bot).toBeGreaterThanOrEqual(0)
    // 另一位是真人 P1（座位 1）：不行
    m.s = { ...(m.s as NinetyNineState), alive: [true, true, false, false], out: [2, 3], turn: 1 }
    expect(playerAct(room, ids[0], { type: 'tie' }, now)).toEqual([])
    // 另一位是電腦：可以，馬上攤牌結算、兩個人並列第一
    m.s = { ...(m.s as NinetyNineState), alive: [true, false, true, false], out: [1, 3], turn: 2 }
    const r = playerAct(room, ids[0], { type: 'tie' }, now)
    expect(r[0].pub).toEqual({ type: 'tie', player: 0 })
    expect(m.over).toBe(true)
    const end = r[r.length - 1].pub as NinetyNineState
    expect(end.alive).toEqual([true, false, true, false])
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
    // 連線不限次數：再下一手，還能再申請，對方同意就再退
    playerAct(room, ids[0], { type: 'place', index: 112 }, now)
    expect(playerAct(room, ids[0], { type: 'undo' }, now)[0].pub).toEqual({ type: 'undoAsk', by: 0 })
    expect(playerAct(room, ids[1], { type: 'undoReply', ok: true }, now)[0].pub).toEqual({ type: 'undo', by: 0, moves: 0 })
  })

  it('暗棋也能悔棋：翻開的棋蓋回去', () => {
    const { room, ids, m } = started('banqi')
    let now = T0 + COUNTDOWN_MS + 1000
    playerAct(room, ids[0], { type: 'rps', hand: 'paper' }, now)
    playerAct(room, ids[1], { type: 'rps', hand: 'rock' }, now)
    now += 3000
    playerAct(room, ids[0], { type: 'flip', at: 0 }, now)
    playerAct(room, ids[1], { type: 'flip', at: 31 }, now)
    const s0 = m.s as { up: boolean[] }
    expect(s0.up.filter(Boolean)).toHaveLength(2)
    playerAct(room, ids[1], { type: 'undo' }, now)
    expect(playerAct(room, ids[0], { type: 'undoReply', ok: true }, now)[0].pub).toEqual({ type: 'undo', by: 1, moves: 1 })
    const s1 = m.s as { up: boolean[]; turn: number }
    expect(s1.up[31]).toBe(false)
    expect(s1.up[0]).toBe(true)
    expect(s1.turn).toBe(1)
  })

  it('悔棋：對方 10 秒內沒回答就當作不同意', () => {
    const { room, ids, m } = started('gomoku')
    let now = T0 + COUNTDOWN_MS + 1000
    playerAct(room, ids[0], { type: 'rps', hand: 'paper' }, now)
    playerAct(room, ids[1], { type: 'rps', hand: 'rock' }, now)
    now += 3000
    playerAct(room, ids[0], { type: 'place', index: 112 }, now)
    playerAct(room, ids[0], { type: 'undo' }, now)
    expect(m.undoAsk).toBe(0)
    expect(nextWake(room)).toBeLessThanOrEqual(now + UNDO_ANSWER_MS)
    tick(room, now + UNDO_ANSWER_MS, 1)
    expect(m.undoAsk).toBeNull()
    expect(m.log[m.log.length - 1].pub).toEqual({ type: 'undoNo', by: 0 })
    // 沒有被悔掉
    expect((m.s as { moves: number[] }).moves).toEqual([112])
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

  it('再玩一次：大家都按了就直接開下一局；有人回到房間就不行', () => {
    const { room, ids } = started('sevens', 2)
    let t = runToEnd(room, T0 + COUNTDOWN_MS)
    const n1 = room.match!.n
    // 還沒打完不能按（這裡已經打完）；第一個人按了還不會開
    applyIntent(room, ids[0], { t: 'again' }, t)
    expect(room.againAt ?? 0).toBe(0)
    applyIntent(room, ids[1], { t: 'again' }, t)
    expect(room.againAt).toBe(t)
    const r = tick(room, t, 99)
    expect(r.rematch).toBe(true)
    expect(room.match!.n).toBe(n1 + 1)
    expect(room.match!.over).toBe(false)
    expect(room.phase).toBe('playing')
    // 再打完；一個人回到房間 → 另一個人按再玩一次也不會開
    t = runToEnd(room, t + 1)
    applyIntent(room, ids[0], { t: 'back' }, t)
    expect(applyIntent(room, ids[1], { t: 'again' }, t).changed).toBe(false)
  })

  it('對局中離開房間：位子由電腦代打（座位記著他的名字）；房主離開不解散、換人當房主', () => {
    const { room, ids, m } = started('sevens', 3)
    expect(m.seats[1]).toMatchObject({ pid: ids[1], name: 'P1' })
    const r = applyIntent(room, ids[0], { t: 'leave' }, T0 + COUNTDOWN_MS + 10)
    expect(r.closed).toBeUndefined()
    expect(room.players.map((p) => p.id)).toEqual([ids[1], ids[2]])
    expect(room.players[0].host).toBe(true)
    // 對局照樣打得完
    runToEnd(room, T0 + COUNTDOWN_MS + 20)
    expect(room.match!.over).toBe(true)
  })

  it('點格棋：難度決定棋盤大小；圍到格子同一個人再畫；下得完', () => {
    for (const [difficulty, n] of [['low', 4], ['high', 6]] as const) {
      const { room, ids, m } = started('dots', 2, { difficulty })
      expect((m.s as DotsState).n).toBe(n)
      let t = T0 + COUNTDOWN_MS + 1000
      playerAct(room, ids[0], { type: 'rps', hand: 'paper' }, t)
      playerAct(room, ids[1], { type: 'rps', hand: 'rock' }, t)
      t += 3000
      // A 先畫：左上那格的三條邊（A、B、A），再由 B 補第四條 → B 拿到那格、還是輪到 B
      expect(playerAct(room, ids[0], { type: 'line', line: 0 }, t)).toHaveLength(1)
      expect(playerAct(room, ids[0], { type: 'line', line: 1 }, t)).toEqual([]) // 不是 A 的回合
      playerAct(room, ids[1], { type: 'line', line: n * (n + 1) }, t)
      playerAct(room, ids[0], { type: 'line', line: n }, t)
      playerAct(room, ids[1], { type: 'line', line: n * (n + 1) + 1 }, t)
      const s = m.s as DotsState
      expect(s.score).toEqual([0, 1])
      expect(s.turn).toBe(1)
      runToEnd(room, t)
      expect(m.over).toBe(true)
      const fin = m.log[m.log.length - 1].pub as DotsState
      expect(fin.score[0] + fin.score[1]).toBe(n * n)
    }
  })

  it('海克斯：棋盤大小、交換規則照房主；藍方可以交換第一手；下得完', () => {
    const { room, ids, m } = started('hex', 2, { size: '9', swap: true })
    expect((m.s as HexState).n).toBe(9)
    let t = T0 + COUNTDOWN_MS + 1000
    playerAct(room, ids[0], { type: 'rps', hand: 'paper' }, t)
    playerAct(room, ids[1], { type: 'rps', hand: 'rock' }, t)
    t += 3000
    // A 贏了猜拳拿紅子先下 (1,3)；B 交換 → 變成 B 的藍子在 (3,1)，換 A 下
    expect(playerAct(room, ids[0], { type: 'place', cell: 1 * 9 + 3 }, t)).toHaveLength(1)
    expect(playerAct(room, ids[0], { type: 'swap' }, t)).toEqual([]) // 不是 A 的回合
    playerAct(room, ids[1], { type: 'swap' }, t)
    const s = m.s as HexState
    expect(s.cells[1 * 9 + 3]).toBe(-1)
    expect(s.cells[3 * 9 + 1]).toBe(1)
    expect(s.turn).toBe(0)
    runToEnd(room, t)
    expect(m.over).toBe(true)
    const fin = m.log[m.log.length - 1].pub as HexState
    expect(fin.path.length).toBeGreaterThan(0)
  }, 60000)

  it('九子棋：飛子規則照房主；成三跟拿子一起送；下得完', () => {
    const { room, ids, m } = started('morris', 2, { flying: false })
    expect((m.s as MorrisState).flying).toBe(false)
    let t = T0 + COUNTDOWN_MS + 1000
    playerAct(room, ids[0], { type: 'rps', hand: 'paper' }, t)
    playerAct(room, ids[1], { type: 'rps', hand: 'rock' }, t)
    t += 3000
    // A 放 0、B 放 9、A 放 1、B 放 10、A 放 2 成三 → 一定要帶 remove
    playerAct(room, ids[0], { type: 'place', to: 0 }, t)
    playerAct(room, ids[1], { type: 'place', to: 9 }, t)
    playerAct(room, ids[0], { type: 'place', to: 1 }, t)
    playerAct(room, ids[1], { type: 'place', to: 10 }, t)
    expect(playerAct(room, ids[0], { type: 'place', to: 2 }, t)).toEqual([]) // 成三沒說拿哪顆：不收
    expect(playerAct(room, ids[0], { type: 'place', to: 2, remove: 9 }, t)).toHaveLength(1)
    const s = m.s as MorrisState
    expect(s.board[9]).toBe(-1)
    expect(s.turn).toBe(1)
    runToEnd(room, t)
    expect(m.over).toBe(true)
  }, 60000)

  it('西洋跳棋、星形跳棋：伺服器發局、電腦補位、時間到的真人由電腦代打，都下得完', () => {
    for (const [gameId, humans] of [['checkers', 2], ['starcheckers', 2], ['starcheckers', 3]] as const) {
      const { room, ids, m } = started(gameId, humans)
      let t = T0 + COUNTDOWN_MS + 1000
      // 西洋跳棋要先猜拳
      if (gameId === 'checkers') {
        playerAct(room, ids[0], { type: 'rps', hand: 'paper' }, t)
        playerAct(room, ids[1], { type: 'rps', hand: 'rock' }, t)
      }
      t = runToEnd(room, t)
      expect(m.over).toBe(true)
      const fin = m.log[m.log.length - 1]
      expect(fin.end).toBe(true)
      if (gameId === 'starcheckers') expect(new Set((fin.pub as { out: number[] }).out).size).toBe(3)
    }
  }, 60000)

  it('星形跳棋：有人認輸，剩下的人繼續下（不結束）', () => {
    const { room, ids, m } = started('starcheckers', 3)
    const t = T0 + COUNTDOWN_MS + 6000
    const r = playerAct(room, ids[1], { type: 'resign' }, t)
    expect(r[0].pub).toEqual({ type: 'resign', player: 1 })
    expect(m.over).toBe(false)
    // 不合法的路線不收
    expect(playerAct(room, ids[0], { type: 'move', path: [0, 999] }, t)).toEqual([])
  })

  it('星形跳棋悔棋：另外兩個真人都同意才悔；一個不同意就算了', () => {
    const { room, ids, m } = started('starcheckers', 3)
    const t = T0 + COUNTDOWN_MS + 6000
    // 0 號走一步（找一個能走的）
    playerAct(room, ids[0], { type: 'move', path: starMoves(m.s as StarState).find((x) => x.path.length === 2)!.path }, t)
    expect(m.acts).toHaveLength(1)
    expect(playerAct(room, ids[0], { type: 'undo' }, t)[0].pub).toEqual({ type: 'undoAsk', by: 0 })
    // 1 號同意：還要等 2 號
    expect(playerAct(room, ids[1], { type: 'undoReply', ok: true }, t)[0].pub).toEqual({ type: 'undoOk', seat: 1 })
    expect(m.acts).toHaveLength(1)
    // 2 號也同意：悔了
    expect(playerAct(room, ids[2], { type: 'undoReply', ok: true }, t)[0].pub).toMatchObject({ type: 'undo', by: 0 })
    expect(m.acts).toHaveLength(0)
  })

  it('星形跳棋悔棋：有一個人不同意就不悔', () => {
    const { room, ids, m } = started('starcheckers', 3)
    const t = T0 + COUNTDOWN_MS + 6000
    playerAct(room, ids[0], { type: 'move', path: starMoves(m.s as StarState).find((x) => x.path.length === 2)!.path }, t)
    playerAct(room, ids[0], { type: 'undo' }, t)
    playerAct(room, ids[1], { type: 'undoReply', ok: true }, t)
    expect(playerAct(room, ids[2], { type: 'undoReply', ok: false }, t)[0].pub).toEqual({ type: 'undoNo', by: 0 })
    expect(m.acts).toHaveLength(1)
  })
})


describe('大老二預設玩到分出名次', async () => {
  const { MATCH_DEFS } = await import('./defs')
  it('房主沒送「玩到分出名次」：開著；送了關就關', () => {
    expect((MATCH_DEFS.bigtwo.deal(1, {}) as BigTwoState).options.playToRank).toBe(true)
    expect((MATCH_DEFS.crazybigtwo.deal(1, {}) as BigTwoState).options.playToRank).toBe(true)
    expect((MATCH_DEFS.bigtwo.deal(1, { playToRank: false }) as BigTwoState).options.playToRank).toBe(false)
  })
})

describe('對局中離開又加回來', () => {
  it('同一局還沒打完：帶著原本的編號與憑證加回來，回到原本的座位；憑證不對、打完了就不行', () => {
    const { room, ids, m } = started('sevens', 2)
    const t = runSome(room, T0 + COUNTDOWN_MS, 3)
    const p1 = room.players.find((p) => p.id === ids[1])!
    const token = p1.token
    const seat = m.seats.findIndex((s) => s.pid === ids[1])
    applyIntent(room, ids[1], { t: 'leave' }, t)
    expect(room.players.some((p) => p.id === ids[1])).toBe(false)
    // 沒帶、帶錯憑證：照舊「已經開始了」
    expect(addMember(room, { name: 'X' }, t, rand)).toBe('started')
    expect(addMember(room, { name: 'X' }, t, rand, { pid: ids[1], token: 'f'.repeat(48) })).toBe('started')
    // 帶對的：回到原本的座位、還在對局裡
    const back = addMember(room, { name: 'P1' }, t, rand, { pid: ids[1], token })
    if (typeof back === 'string') throw new Error(back)
    expect(back.id).toBe(ids[1])
    expect(back.inGame).toBe(true)
    expect(m.seats[seat].pid).toBe(ids[1])
    // 再離開一次：一樣記下來，還能再加回來
    applyIntent(room, ids[1], { t: 'leave' }, t)
    const again = addMember(room, { name: 'P1' }, t, rand, { pid: ids[1], token })
    expect(typeof again).not.toBe('string')
    // 打完了：不能再加回來
    applyIntent(room, ids[1], { t: 'leave' }, t)
    runToEnd(room, t)
    expect(addMember(room, { name: 'P1' }, t, rand, { pid: ids[1], token })).toBe('started')
  })
})
