import { beforeEach, describe, expect, it } from 'vitest'
import { canChangeMode, changeMode, createRoom, joinRoom, online, recommendMode, setAllowOthers, setReady, setSpectator, startState, type RoomPlayer } from './online'

const guest = (id: string, extra: Partial<RoomPlayer> = {}): RoomPlayer => ({ id, name: id, host: false, me: false, ready: false, spectator: false, ...extra })

describe('連線房間', () => {
  beforeEach(async () => {
    await createRoom('我', 'bigtwo')
  })

  it('開房：自己是房主、可以換模式；房號 4 位數', () => {
    expect(online.room!.code).toMatch(/^\d{4}$/)
    expect(canChangeMode.value).toBe(true)
  })

  it('房號格式不對、找不到房間', async () => {
    expect(await joinRoom('12a', '我')).toBe('format')
    expect(await joinRoom('1234', '我')).toBe('notFound')
  })

  it('不是房主：預設不能換模式，只能推薦；房主打開權限後就能換', () => {
    const room = online.room!
    room.players[0].host = false
    room.players.push(guest('h', { host: true }))
    expect(canChangeMode.value).toBe(false)
    changeMode('gomoku', 2)
    expect(room.gameId).toBe('bigtwo')
    recommendMode('gomoku')
    recommendMode('go')
    expect(room.recommends).toEqual([{ playerId: 'me', gameId: 'go' }])
    setAllowOthers(true) // 不是房主不能設定
    expect(room.allowOthers).toBe(false)
    room.allowOthers = true
    expect(canChangeMode.value).toBe(true)
  })

  it('大家都準備、對戰人數剛好才開始；換模式後準備全部取消', () => {
    const room = online.room!
    room.players.push(guest('a'), guest('b'), guest('c'))
    expect(startState(4).canStart).toBe(false)
    for (const p of room.players) p.ready = true
    expect(startState(4).canStart).toBe(true)
    changeMode('gomoku', 2)
    expect(room.players.every((p) => !p.ready)).toBe(true)
    // 4 人玩 2 人的棋：要 2 人改觀戰
    expect(startState(2).tooMany).toBe(2)
    setSpectator(true)
    room.players[1].spectator = true
    for (const p of room.players) p.ready = true
    expect(startState(2)).toMatchObject({ tooMany: 0, canStart: true })
  })

  it('改成觀戰要重新準備', () => {
    setReady(true)
    setSpectator(true)
    expect(online.room!.players[0]).toMatchObject({ spectator: true, ready: false })
  })
})
