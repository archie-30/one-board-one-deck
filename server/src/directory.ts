// 房號簿（全站只有一個）：發房號（保證不重複）、轉交加入請求、限制同一個來源亂試房號。
// 對外不直接開放，只有 index.ts 轉進來的 /create、/join，和房間關掉時的 /release。
import { DurableObject } from 'cloudflare:workers'
import type { Env } from './env'
import { Window } from './limits'

/** 同一個 IP：每分鐘最多開幾間房 */
const CREATE_PER_MIN = 6
/** 同一個 IP：每分鐘最多試幾次加入 */
const JOIN_PER_MIN = 12
/** 同一個 IP：10 分鐘內房號打錯幾次就先擋 10 分鐘 */
const FAILS_PER_10MIN = 8

const key = (code: string) => `r:${code}`

export class Directory extends DurableObject<Env> {
  private creates = new Window(CREATE_PER_MIN, 60_000)
  private joins = new Window(JOIN_PER_MIN, 60_000)
  private fails = new Window(FAILS_PER_10MIN, 600_000)

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)
    const body = (await req.json().catch(() => null)) as { ip?: string; code?: string; profile?: unknown } | null
    if (!body) return json({ error: 'format' }, 400)
    const now = Date.now()
    const ip = body.ip ?? 'unknown'

    if (url.pathname === '/release' && body.code) {
      await this.ctx.storage.delete(key(body.code))
      return json({ ok: true })
    }

    if (url.pathname === '/create') {
      if (!this.creates.hit(ip, now)) return json({ error: 'limited' }, 429)
      // 隨機挑一個沒人用的 4 位數房號
      for (let tries = 0; tries < 40; tries++) {
        const code = String(crypto.getRandomValues(new Uint16Array(1))[0] % 10000).padStart(4, '0')
        if (await this.ctx.storage.get(key(code))) continue
        await this.ctx.storage.put(key(code), now)
        const res = await this.room(code).fetch('https://room/init', { method: 'POST', body: JSON.stringify({ code, profile: body.profile }) })
        if (res.status === 409) continue // 這個房號的房間其實還在（房號簿漏記）：換一個
        if (!res.ok) {
          await this.ctx.storage.delete(key(code))
          return new Response(res.body, res)
        }
        return res
      }
      return json({ error: 'busy' }, 503)
    }

    if (url.pathname === '/join') {
      const code = body.code ?? ''
      if (this.fails.count(ip, now) >= FAILS_PER_10MIN || !this.joins.hit(ip, now)) return json({ error: 'limited' }, 429)
      if (!/^\d{4}$/.test(code)) return json({ error: 'format' }, 400)
      if (!(await this.ctx.storage.get(key(code)))) {
        this.fails.hit(ip, now)
        return json({ error: 'notFound' }, 404)
      }
      const res = await this.room(code).fetch('https://room/join', { method: 'POST', body: JSON.stringify({ profile: body.profile }) })
      if (res.status === 404) {
        // 房號簿有、房間其實已經關了：順手清掉
        await this.ctx.storage.delete(key(code))
        this.fails.hit(ip, now)
      }
      return res
    }
    return json({ error: 'format' }, 404)
  }

  private room(code: string) {
    return this.env.ROOM.get(this.env.ROOM.idFromName(code))
  }
}

export const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
