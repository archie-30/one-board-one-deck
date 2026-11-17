import { describe, expect, it } from 'vitest'
import { GAME_SEATS } from './games'
import { addMember, applyIntent, canStart, connect, CONNECT_MS, COUNTDOWN_MS, createRoomState, disconnect, GRACE_MS, nextWake, parseMessage, parseProfile, tick, viewFor, type RoomState } from './roomCore'

let n = 0
const rand = (bytes: number) => (n++).toString(16).padStart(bytes * 2, '0')
const T0 = 1_000_000

/** 開一間房：房主 A，再加入 B…；大家都連上了 */
function room(names = ['A', 'B']) {
  const { room, member } = createRoomState('1234', { name: names[0] }, T0, rand)
  const ids = [member.id]
  for (const nm of names.slice(1)) {
    const m = addMember(room, { name: nm }, T0, rand)
    if (typeof m === 'string') throw new Error(m)
    ids.push(m.id)
  }
  for (const id of ids) connect(room, id)
  return { room, ids }
}
const readyAll = (r: RoomState, ids: string[], t = T0) => ids.forEach((id) => applyIntent(r, id, { t: 'ready', on: true }, t))

describe('連線房間（伺服器規則）', () => {
  it('開房：一開始未選擇模式；房主是開房的人', () => {
    const { room: r, ids } = room(['A'])
    expect(r.gameId).toBe('')
    expect(r.players[0]).toMatchObject({ id: ids[0], host: true })
  })

  it('最多 4 人；開局後不能加入', () => {
    const { room: r, ids } = room(['A', 'B', 'C', 'D'])
    expect(addMember(r, { name: 'E' }, T0, rand)).toBe('full')
    applyIntent(r, ids[1], { t: 'leave' }, T0)
    applyIntent(r, ids[0], { t: 'mode', gameId: 'bigtwo' }, T0)
    readyAll(r, r.players.map((p) => p.id))
    tick(r, T0 + COUNTDOWN_MS, 7)
    expect(r.phase).toBe('playing')
    expect(addMember(r, { name: 'E' }, T0, rand)).toBe('started')
  })

  it('只有房主能換模式；其他人只能推薦（同一人只留最新的）', () => {
    const { room: r, ids } = room()
    applyIntent(r, ids[1], { t: 'mode', gameId: 'gomoku' }, T0)
    expect(r.gameId).toBe('')
    applyIntent(r, ids[1], { t: 'recommend', gameId: 'gomoku' }, T0)
    applyIntent(r, ids[1], { t: 'recommend', gameId: 'go' }, T0)
    expect(r.recommends).toEqual([{ playerId: ids[1], gameId: 'go' }])
    applyIntent(r, ids[0], { t: 'mode', gameId: 'go' }, T0)
    expect(r.gameId).toBe('go')
    // 換成推薦的模式：那則推薦拿掉
    expect(r.recommends).toEqual([])
  })

  it('還沒選模式不能準備；換模式會取消大家的準備', () => {
    const { room: r, ids } = room()
    applyIntent(r, ids[0], { t: 'ready', on: true }, T0)
    expect(r.players[0].ready).toBe(false)
    applyIntent(r, ids[0], { t: 'mode', gameId: 'bigtwo' }, T0)
    applyIntent(r, ids[0], { t: 'ready', on: true }, T0)
    applyIntent(r, ids[0], { t: 'mode', gameId: 'sevens' }, T0)
    expect(r.players[0].ready).toBe(false)
  })

  it('大家準備 → 倒數 3 秒 → 伺服器開局，準備清掉；有人取消準備倒數就停', () => {
    const { room: r, ids } = room()
    applyIntent(r, ids[0], { t: 'mode', gameId: 'bigtwo' }, T0)
    readyAll(r, ids)
    expect(r.phase).toBe('countdown')
    expect(nextWake(r)).toBe(T0 + COUNTDOWN_MS)
    expect(viewFor(r, ids[1], T0 + 1000).startIn).toBe(COUNTDOWN_MS - 1000)
    applyIntent(r, ids[1], { t: 'ready', on: false }, T0 + 1000)
    expect(r.phase).toBe('lobby')
    applyIntent(r, ids[1], { t: 'ready', on: true }, T0 + 1500)
    expect(tick(r, T0 + 1500 + COUNTDOWN_MS - 200, 1).started).toBe(false)
    const t = tick(r, T0 + 1500 + COUNTDOWN_MS, 99)
    expect(t.started).toBe(true)
    expect(r).toMatchObject({ phase: 'playing', seed: 99 })
    expect(r.players.every((p) => !p.ready && p.inGame)).toBe(true)
    // 大家都回到房間才回到等待中
    applyIntent(r, ids[0], { t: 'back' }, T0 + 9000)
    expect(r.phase).toBe('playing')
    applyIntent(r, ids[1], { t: 'back' }, T0 + 9000)
    expect(r.phase).toBe('lobby')
  })

  it('人比模式多：多出來的人要改觀戰才能開始', () => {
    const { room: r, ids } = room(['A', 'B', 'C'])
    applyIntent(r, ids[0], { t: 'mode', gameId: 'gomoku' }, T0)
    readyAll(r, ids)
    expect(canStart(r)).toBe(false)
    applyIntent(r, ids[2], { t: 'spectate', on: true }, T0)
    expect(r.players[2].ready).toBe(false)
    applyIntent(r, ids[2], { t: 'ready', on: true }, T0)
    expect(r.phase).toBe('countdown')
  })

  it('房主離開＝解散；其他人離開就只是自己走', () => {
    const { room: r, ids } = room(['A', 'B', 'C'])
    expect(applyIntent(r, ids[1], { t: 'leave' }, T0)).toMatchObject({ left: true, closed: undefined })
    expect(r.players.map((p) => p.id)).toEqual([ids[0], ids[2]])
    expect(applyIntent(r, ids[0], { t: 'leave' }, T0).closed).toBe('disbanded')
  })

  it('房主可以請人出房間：只有房主、不能請自己、對局中不行', () => {
    const { room: r, ids } = room(['A', 'B', 'C'])
    expect(applyIntent(r, ids[1], { t: 'kick', id: ids[2] }, T0).changed).toBe(false)
    expect(applyIntent(r, ids[0], { t: 'kick', id: ids[0] }, T0).changed).toBe(false)
    const res = applyIntent(r, ids[0], { t: 'kick', id: ids[2] }, T0)
    expect(res).toMatchObject({ changed: true, kicked: ids[2] })
    expect(r.players.map((p) => p.id)).toEqual([ids[0], ids[1]])
    applyIntent(r, ids[0], { t: 'mode', gameId: 'gomoku' }, T0)
    readyAll(r, ids.slice(0, 2))
    tick(r, T0 + COUNTDOWN_MS, 7)
    expect(r.phase).toBe('playing')
    expect(applyIntent(r, ids[0], { t: 'kick', id: ids[1] }, T0).changed).toBe(false)
    expect(parseMessage(JSON.stringify({ t: 'kick', id: 'zz' }))).toBeNull()
    expect(parseMessage(JSON.stringify({ t: 'kick', id: ids[1] }))).toEqual({ t: 'kick', id: ids[1] })
  })

  it('斷線：取消準備、位子留一段時間；連回來就恢復；太久就移出（房主換人）', () => {
    const { room: r, ids } = room(['A', 'B'])
    applyIntent(r, ids[0], { t: 'mode', gameId: 'bigtwo' }, T0)
    readyAll(r, ids)
    disconnect(r, ids[0], T0 + 100)
    expect(r.phase).toBe('lobby')
    expect(viewFor(r, ids[1], T0).players[0]).toMatchObject({ away: true, ready: false })
    connect(r, ids[0])
    expect(r.players[0].away).toBe(0)
    disconnect(r, ids[0], T0 + 200)
    tick(r, T0 + 200 + GRACE_MS, 1)
    expect(r.players).toHaveLength(1)
    expect(r.players[0]).toMatchObject({ id: ids[1], host: true })
    disconnect(r, ids[1], T0 + 300)
    expect(tick(r, T0 + 300 + GRACE_MS, 1).closed).toBe('empty')
  })

  it('進房後一直沒連上 WebSocket：當作斷線，時間到移出', () => {
    const { room: r } = createRoomState('1111', { name: 'A' }, T0, rand)
    expect(nextWake(r)).toBe(T0 + CONNECT_MS)
    expect(tick(r, T0 + CONNECT_MS, 1).closed).toBe('empty')
  })

  it('每個人看到自己的視角：自己標 me，看不到任何人的憑證', () => {
    const { room: r, ids } = room()
    const v = viewFor(r, ids[1], T0)
    expect(v.players.map((p) => p.me)).toEqual([false, true])
    expect(JSON.stringify(v)).not.toContain(r.players[0].token)
    expect(JSON.stringify(v)).not.toContain(r.players[1].token)
    expect(v.private).toEqual({})
  })

  it('訊息檢查：只收認得的意圖，格式、長度不對就不收', () => {
    expect(parseMessage('{"t":"ready","on":true}')).toEqual({ t: 'ready', on: true })
    expect(parseMessage('{"t":"ready","on":"yes"}')).toBeNull()
    expect(parseMessage('{"t":"mode","gameId":"solitaire"}')).toBeNull()
    expect(parseMessage('{"t":"mode","gameId":"chess"}')).toEqual({ t: 'mode', gameId: 'chess' })
    expect(parseMessage('{"t":"room","room":{}}')).toBeNull()
    expect(parseMessage('not json')).toBeNull()
    expect(parseMessage('[1]')).toBeNull()
    expect(parseMessage(JSON.stringify({ t: 'recommend', gameId: 'go', pad: 'x'.repeat(1100) }))).toBeNull()
    expect(parseMessage('{"t":"hello","pid":"abcd1234","token":"zz"}')).toBeNull()
  })

  it('個人資料檢查：名字去頭尾空白、最多 16 字；頭像、等級、稱號格式不對就不收', () => {
    expect(parseProfile({ name: '  小明\u0007 ' })).toEqual({ name: '小明' })
    expect(parseProfile({ name: '' })).toBeNull()
    expect(parseProfile({ name: 'x'.repeat(40) })!.name).toHaveLength(16)
    expect(parseProfile({ name: 'a', look: { shape: 'circle', tone: 'red', fill: 'solid', acc: 'glasses' }, level: 3, titles: ['t1'] })).toMatchObject({ level: 3 })
    expect(parseProfile({ name: 'a', look: { shape: '<b>' } })).toBeNull()
    expect(parseProfile({ name: 'a', level: -1 })).toBeNull()
    expect(parseProfile({ name: 'a', titles: ['a', 'b', 'c'] })).toBeNull()
  })

  it('電腦補位的名字跟著房主；房主換人就跟著新房主；名字格式不對整份不收', () => {
    const { room: r, member } = createRoomState('2222', { name: 'A', bots: ['小明', '', '阿花'] }, T0, rand)
    const b = addMember(r, { name: 'B', bots: ['別人取的'] }, T0, rand)
    if (typeof b === 'string') throw new Error(b)
    connect(r, member.id)
    connect(r, b.id)
    expect(viewFor(r, b.id, T0).botNames).toEqual(['小明', '', '阿花'])
    // 看不到別人的名字表（只給房主那份）
    expect(JSON.stringify(viewFor(r, member.id, T0))).not.toContain('別人取的')
    disconnect(r, member.id, T0)
    tick(r, T0 + GRACE_MS, 1)
    expect(viewFor(r, b.id, T0).botNames).toEqual(['別人取的'])
    expect(parseProfile({ name: 'a', bots: Array(31).fill('x') })).toBeNull()
    expect(parseProfile({ name: 'a', bots: [1] })).toBeNull()
    expect(parseProfile({ name: 'a', bots: ['  超級長的名字超級長的名字超級長  '] })!.bots![0]).toHaveLength(12)
  })

  it('伺服器認得的玩法都是 2～4 人', () => {
    for (const s of Object.values(GAME_SEATS)) expect(s).toBeGreaterThanOrEqual(2)
  })
})
