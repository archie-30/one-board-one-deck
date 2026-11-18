// 連線伺服器的入口（Cloudflare Worker）。對外只有三個網址：
//   POST /rooms          開房（回傳房號、自己的玩家編號與私密憑證）
//   POST /rooms/join     用房號加入（同上）
//   GET  /rooms/1234/ws  連上房間（WebSocket；第一則訊息要帶玩家編號與憑證）
// 只接受允許的網頁來源（網頁版、Android App）；其他來源一律拒絕。
import { json } from './directory'
import type { Env } from './env'

export { Directory } from './directory'
export { Room } from './room'

/** 請求本文最多幾個字元 */
const MAX_BODY = 2048

function allowed(origin: string | null, env: Env): boolean {
  if (!origin) return false
  const list = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (list.includes(origin)) return true
  return env.ALLOW_LOCAL === '1' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
}

function cors(origin: string): Record<string, string> {
  return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' }
}
const withCors = (res: Response, origin: string) => {
  const out = new Response(res.body, res)
  for (const [k, v] of Object.entries(cors(origin))) out.headers.set(k, v)
  return out
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    const origin = req.headers.get('Origin')
    if (!allowed(origin, env)) return new Response('forbidden', { status: 403 })
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin!) })

    // WebSocket：直接交給那間房間（認人在房間裡做）
    const ws = url.pathname.match(/^\/rooms\/(\d{4})\/ws$/)
    if (ws && req.method === 'GET') {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 })
      const stub = env.ROOM.get(env.ROOM.idFromName(ws[1]))
      return stub.fetch(new Request('https://room/ws', req))
    }

    if (req.method !== 'POST' || (url.pathname !== '/rooms' && url.pathname !== '/rooms/join')) return withCors(json({ error: 'format' }, 404), origin!)
    const text = await req.text()
    if (text.length > MAX_BODY) return withCors(json({ error: 'format' }, 413), origin!)
    let body: { code?: unknown; profile?: unknown; rejoin?: unknown }
    try {
      body = JSON.parse(text)
    } catch {
      return withCors(json({ error: 'format' }, 400), origin!)
    }
    const ip = req.headers.get('CF-Connecting-IP') ?? 'local'
    const dir = env.DIRECTORY.get(env.DIRECTORY.idFromName('main'))
    const path = url.pathname === '/rooms' ? '/create' : '/join'
    const res = await dir.fetch(`https://dir${path}`, { method: 'POST', body: JSON.stringify({ ip, code: typeof body.code === 'string' ? body.code : '', profile: body.profile, rejoin: body.rejoin }) })
    return withCors(res, origin!)
  },
} satisfies ExportedHandler<Env>
