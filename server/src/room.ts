// 一間房間（一個房號一個）：用 WebSocket 跟房間裡的每個人保持連線。
// 用 Cloudflare 的「休眠」WebSocket：沒人說話時伺服器可以睡著，連線不會斷，也不耗免費額度。
// 房間狀態存在這個房間自己的儲存空間，睡醒再讀回來。
import { DurableObject } from 'cloudflare:workers'
import { json } from './directory'
import type { Env } from './env'
import { Bucket } from './limits'
import { entryFor, matchIntro, playerAct, type LogEntry } from './match/run'
import { addMember, applyIntent, connect, createRoomState, disconnect, nextWake, parseMessage, parseProfile, sameToken, tick, viewFor, type CloseReason, type RoomState } from './roomCore'

const hex = (bytes: number) => [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('')

/** 每條連線：最多連發 10 則，每秒補 4 則；超過 3 次就斷線 */
const BURST = 10
const RATE = 4
const STRIKES = 3

interface Attachment {
  pid: string
}

export class Room extends DurableObject<Env> {
  private room: RoomState | null = null
  private buckets = new Map<WebSocket, { bucket: Bucket; strikes: number }>()

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    ctx.blockConcurrencyWhile(async () => {
      this.room = (await ctx.storage.get<RoomState>('room')) ?? null
    })
    // 客戶端的心跳 ping 直接回 pong，不用叫醒伺服器
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)
    const now = Date.now()
    if (url.pathname === '/ws') {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 })
      if (!this.room) return new Response('not found', { status: 404 })
      const pair = new WebSocketPair()
      this.ctx.acceptWebSocket(pair[1])
      return new Response(null, { status: 101, webSocket: pair[0] })
    }
    const body = (await req.json().catch(() => null)) as { code?: string; profile?: unknown } | null
    const profile = parseProfile(body?.profile)
    if (!profile) return json({ error: 'format' }, 400)
    if (url.pathname === '/init') {
      if (this.room) return json({ error: 'exists' }, 409)
      const { room, member } = createRoomState(String(body?.code), profile, now, hex)
      this.room = room
      await this.save()
      return json({ code: room.code, pid: member.id, token: member.token })
    }
    if (url.pathname === '/join') {
      if (!this.room) return json({ error: 'notFound' }, 404)
      const m = addMember(this.room, profile, now, hex)
      if (typeof m === 'string') return json({ error: m }, 409)
      await this.save()
      this.broadcast()
      return json({ code: this.room.code, pid: m.id, token: m.token })
    }
    return json({ error: 'format' }, 404)
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const now = Date.now()
    // 頻率限制
    let b = this.buckets.get(ws)
    if (!b) this.buckets.set(ws, (b = { bucket: new Bucket(BURST, RATE, now), strikes: 0 }))
    if (!b.bucket.take(now)) {
      if (++b.strikes >= STRIKES) ws.close(1008, 'rate')
      else this.send(ws, { t: 'error', code: 'rate' })
      return
    }
    const msg = parseMessage(raw)
    if (!msg) return this.send(ws, { t: 'error', code: 'format' })
    const room = this.room
    if (!room) return ws.close(4404, 'gone')
    const att = ws.deserializeAttachment() as Attachment | null

    // 第一則一定是「我是誰」：用進房時拿到的編號與私密憑證
    if (msg.t === 'hello') {
      const m = room.players.find((p) => p.id === msg.pid)
      if (!m || !sameToken(m.token, msg.token)) return ws.close(4401, 'auth')
      // 同一個人開了新連線：舊的關掉
      for (const other of this.ctx.getWebSockets()) {
        if (other !== ws && (other.deserializeAttachment() as Attachment | null)?.pid === m.id) other.close(4000, 'replaced')
      }
      ws.serializeAttachment({ pid: m.id } satisfies Attachment)
      connect(room, m.id, now)
      await this.save()
      this.broadcast()
      // 對局進行中連回來：重送開局資訊和到目前為止的每一步（客戶端照編號補上沒收到的）
      if (room.match && room.match.seats.some((x) => x.pid === m.id)) this.sendIntro(ws, m.id, true)
      return
    }
    if (!att) return ws.close(4401, 'auth')
    // 對局中出牌：伺服器檢查是不是輪到他、合不合規則，通過才算數，再告訴大家
    if (msg.t === 'act') {
      const entries = playerAct(room, att.pid, msg.a, now)
      if (!entries.length) return this.send(ws, { t: 'error', code: 'act' })
      await this.save()
      this.sendEntries(entries)
      return
    }
    const r = applyIntent(room, att.pid, msg, now)
    if (r.left) {
      ws.serializeAttachment(null)
      this.send(ws, { t: 'closed', reason: 'left' })
      ws.close(1000, 'left')
    }
    if (r.closed) return this.closeRoom(r.closed)
    if (r.changed) {
      await this.save()
      this.broadcast()
    }
  }

  async webSocketClose(ws: WebSocket) {
    this.lost(ws)
  }
  async webSocketError(ws: WebSocket) {
    this.lost(ws)
  }
  private async lost(ws: WebSocket) {
    this.buckets.delete(ws)
    const att = ws.deserializeAttachment() as Attachment | null
    if (!att || !this.room) return
    // 同一個人還有別條連線（剛連回來）就不算斷線
    const still = this.ctx.getWebSockets().some((o) => o !== ws && (o.deserializeAttachment() as Attachment | null)?.pid === att.pid)
    if (still) return
    if (disconnect(this.room, att.pid, Date.now())) {
      await this.save()
      this.broadcast()
    }
  }

  /** 時間到：倒數結束開局、斷線太久的人移出 */
  async alarm() {
    const room = this.room
    if (!room) return
    const seed = crypto.getRandomValues(new Uint32Array(1))[0]
    const r = tick(room, Date.now(), seed)
    if (r.closed) return this.closeRoom(r.closed)
    // 開局：先送對局資訊（自己的手牌等），再說「開始」
    if (r.started) {
      for (const ws of this.ctx.getWebSockets()) {
        const att = ws.deserializeAttachment() as Attachment | null
        if (att && room.match) this.sendIntro(ws, att.pid, false)
        this.send(ws, { t: 'start', gameId: room.gameId })
      }
    }
    if (r.changed || r.entries.length) await this.save()
    if (r.changed) this.broadcast()
    if (r.entries.length) this.sendEntries(r.entries)
  }

  /** 對局開局資訊（每個人自己的視角）；withLog：連回來的人一起補上到目前為止的每一步 */
  private sendIntro(ws: WebSocket, pid: string, withLog: boolean) {
    const m = this.room?.match
    if (!m) return
    const intro = matchIntro(m, pid)
    this.send(ws, { t: 'match', ...intro, log: withLog ? m.log.map((e) => ({ seq: e.seq, ev: entryFor(e, intro.seat), ...(e.end ? { end: true } : {}) })) : [] })
  }

  /** 對局的新動作：每個人收到自己看得到的版本 */
  private sendEntries(entries: LogEntry[]) {
    const m = this.room?.match
    if (!m) return
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null
      if (!att) continue
      const seat = m.seats.findIndex((x) => x.pid === att.pid)
      for (const e of entries) this.send(ws, { t: 'mact', n: m.n, seq: e.seq, ev: entryFor(e, seat), ...(e.end ? { end: true } : {}) })
    }
  }

  private async save() {
    if (!this.room) return
    await this.ctx.storage.put('room', this.room)
    const t = nextWake(this.room)
    if (t) await this.ctx.storage.setAlarm(t)
    else await this.ctx.storage.deleteAlarm()
  }

  /** 每個人收到自己視角的房間 */
  private broadcast() {
    const room = this.room
    if (!room) return
    const now = Date.now()
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null
      if (att) this.send(ws, { t: 'room', room: viewFor(room, att.pid, now) })
    }
  }

  private send(ws: WebSocket, msg: unknown) {
    try {
      ws.send(JSON.stringify(msg))
    } catch {
      // 連線已經斷了
    }
  }

  /** 房間關掉：通知大家、斷線、清空儲存、把房號還給房號簿 */
  private async closeRoom(reason: CloseReason) {
    const code = this.room?.code
    for (const ws of this.ctx.getWebSockets()) {
      this.send(ws, { t: 'closed', reason })
      ws.close(1000, reason)
    }
    this.room = null
    await this.ctx.storage.deleteAlarm()
    await this.ctx.storage.deleteAll()
    if (code) await this.env.DIRECTORY.get(this.env.DIRECTORY.idFromName('main')).fetch('https://dir/release', { method: 'POST', body: JSON.stringify({ code }) })
  }
}
