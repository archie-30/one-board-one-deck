// 真的連線服務：跟 Cloudflare 上的房間伺服器（server/ 資料夾）連線。
//   開房、加入：HTTP 拿到房號、自己的玩家編號與私密憑證 → 用 WebSocket 連上房間，第一則訊息報上編號與憑證。
//   之後只送「意圖」（準備、觀戰、換模式、推薦、離開、回到房間）；房間長怎樣、什麼時候倒數開局，都由伺服器通知。
//   斷線會自動重連（伺服器幫你留位子 45 秒）；憑證存在這個分頁（sessionStorage），重新整理也接得回去。
import { ONLINE_PING, ONLINE_RETRY, ONLINE_TIMEOUT, ONLINE_URL } from '@/data/onlineServer'
import { receiveClosed, receiveRoom, receiveStart, type JoinError, type OnlineProfile, type OnlineService, type Room, type RoomIntent } from './online'

interface Creds {
  code: string
  pid: string
  token: string
}
/** 伺服器傳來的房間（每個人自己的視角） */
interface RoomView {
  code: string
  gameId: string
  phase: Room['phase']
  startIn: number
  players: Room['players']
  recommends: Room['recommends']
}

const STORE = 'obod.online.v1'
const loadCreds = (): Creds | null => {
  try {
    return JSON.parse(sessionStorage.getItem(STORE) ?? 'null')
  } catch {
    return null
  }
}
const saveCreds = (c: Creds | null) => {
  try {
    if (c) sessionStorage.setItem(STORE, JSON.stringify(c))
    else sessionStorage.removeItem(STORE)
  } catch {
    // 不能存（例如無痕模式限制）：只是重新整理後接不回去
  }
}

let creds: Creds | null = null
let ws: WebSocket | null = null
let ping = 0
let retryAt = 0
let retryTimer = 0
/** 正在等第一則房間訊息（開房、加入、重連） */
let waiting: ((r: Room | JoinError) => void) | null = null

const toRoom = (v: RoomView): Room => ({
  code: v.code,
  gameId: v.gameId,
  phase: v.phase,
  countdownEnd: v.startIn > 0 ? Date.now() + v.startIn : 0,
  players: v.players,
  recommends: v.recommends,
})

const ERRORS: JoinError[] = ['format', 'notFound', 'full', 'started', 'limited']
async function post(path: string, body: unknown): Promise<Creds | JoinError> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ONLINE_TIMEOUT)
  try {
    const res = await fetch(ONLINE_URL + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal })
    const data = (await res.json().catch(() => ({}))) as Partial<Creds> & { error?: string }
    if (res.ok && data.code && data.pid && data.token) return { code: data.code, pid: data.pid, token: data.token }
    return ERRORS.includes(data.error as JoinError) ? (data.error as JoinError) : 'network'
  } catch {
    return 'network'
  } finally {
    clearTimeout(t)
  }
}

/** 連上房間；收到第一則房間訊息才算進房 */
function connect(): Promise<Room | JoinError> {
  const c = creds
  if (!c) return Promise.resolve('network')
  closeSocket()
  return new Promise((resolve) => {
    waiting = resolve
    const url = `${ONLINE_URL.replace(/^http/, 'ws')}/rooms/${c.code}/ws`
    let sock: WebSocket
    try {
      sock = new WebSocket(url)
    } catch {
      return finishWait('network')
    }
    ws = sock
    const giveUp = setTimeout(() => sock === ws && finishWait('network'), ONLINE_TIMEOUT)
    sock.onopen = () => {
      sock.send(JSON.stringify({ t: 'hello', pid: c.pid, token: c.token }))
      window.clearInterval(ping)
      ping = window.setInterval(() => sock.readyState === WebSocket.OPEN && sock.send('ping'), ONLINE_PING)
    }
    sock.onmessage = (e) => {
      if (sock !== ws || typeof e.data !== 'string' || e.data === 'pong') return
      let m: { t?: string; room?: RoomView; gameId?: string; reason?: string; code?: string }
      try {
        m = JSON.parse(e.data)
      } catch {
        return
      }
      if (m.t === 'room' && m.room) {
        clearTimeout(giveUp)
        retryAt = 0
        const room = toRoom(m.room)
        if (waiting) finishWait(room)
        else receiveRoom(room)
      } else if (m.t === 'start' && m.gameId) receiveStart(m.gameId)
      else if (m.t === 'closed') {
        // 房主解散、自己離開：不用重連
        forget()
        if (m.reason !== 'left') receiveClosed(m.reason ?? 'closed')
      } else if (m.t === 'error') console.warn('online:', m.code)
    }
    sock.onclose = (e) => {
      if (sock !== ws) return
      clearTimeout(giveUp)
      window.clearInterval(ping)
      ws = null
      // 憑證不對、房間不在了：不用再試
      if (e.code === 4401 || e.code === 4404) {
        forget()
        if (waiting) finishWait('notFound')
        else receiveClosed('lost')
        return
      }
      if (waiting) return finishWait('network')
      if (creds) scheduleRetry()
    }
  })
}
function finishWait(r: Room | JoinError) {
  const w = waiting
  waiting = null
  w?.(r)
}

/** 斷線了：等一下再連（越等越久）；全部試完還連不上就當作離開房間 */
function scheduleRetry() {
  window.clearTimeout(retryTimer)
  if (retryAt >= ONLINE_RETRY.length) {
    forget()
    receiveClosed('lost')
    return
  }
  retryTimer = window.setTimeout(async () => {
    retryAt++
    const r = await connect()
    if (typeof r === 'string') {
      if (creds) scheduleRetry()
    } else receiveRoom(r)
  }, ONLINE_RETRY[retryAt])
}
/** 回到前景、網路恢復：馬上重連，不等 */
function reconnectNow() {
  if (!creds || ws || waiting) return
  window.clearTimeout(retryTimer)
  retryAt = Math.max(0, retryAt - 1)
  scheduleRetryNow()
}
function scheduleRetryNow() {
  void connect().then((r) => {
    if (typeof r === 'string') {
      if (creds) scheduleRetry()
    } else receiveRoom(r)
  })
}

function closeSocket() {
  const s = ws
  ws = null
  window.clearInterval(ping)
  if (s && s.readyState <= WebSocket.OPEN) s.close(1000)
}
function forget() {
  creds = null
  saveCreds(null)
  window.clearTimeout(retryTimer)
  retryAt = 0
  closeSocket()
}

async function enter(path: string, body: unknown): Promise<Room | JoinError> {
  forget()
  const c = await post(path, body)
  if (typeof c === 'string') return c
  creds = c
  saveCreds(c)
  const r = await connect()
  if (typeof r === 'string') forget()
  return r
}

export function createWsService(): OnlineService {
  window.addEventListener('online', reconnectNow)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && reconnectNow())
  return {
    create: (me: OnlineProfile) => enter('/rooms', { profile: me }),
    join: (code: string, me: OnlineProfile) => enter('/rooms/join', { code, profile: me }),
    async leave() {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'leave' }))
      forget()
    },
    send(it: RoomIntent) {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(it))
    },
  }
}

/** 開 App 時：這個分頁之前在房間裡（例如重新整理）就接回去 */
export async function resumeOnline(): Promise<void> {
  creds = loadCreds()
  if (!creds) return
  const r = await connect()
  if (typeof r === 'string') forget()
  else receiveRoom(r)
}
