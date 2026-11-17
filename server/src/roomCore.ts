// 房間規則（純邏輯，不碰網路、不碰 Cloudflare，方便測試）。
// 伺服器說了算：誰是房主、誰能換模式、什麼時候開始倒數、什麼時候開局，都在這裡決定；
// 客戶端只送「意圖」（準備、觀戰、換模式、推薦、離開、回到房間），不能送整個房間。
//
// 規則（跟 src/core/online.ts 開頭的註解一樣）：
// - 一間最多 4 人。房主開房，一開始「未選擇模式」。
// - 只有房主能換模式；其他人推薦（同一人只留最新一個）。換模式會取消大家的準備。
// - 大家都準備、對戰人數不超過模式人數 → 倒數 3 秒 → 開局（伺服器通知所有人同時開始）。
// - 倒數中有人取消準備、改觀戰、換模式、有人加入／斷線 → 倒數停下來。
// - 開局後不能加入；大家都回到房間才回到「等待中」。
// - 房主按離開＝解散房間；其他人離開就只是自己走。
// - 斷線：位子留一段時間（GRACE_MS）等他連回來；過了就移出房間（房主斷太久就換下一位當房主）。
import { GAME_SEATS, parseRules } from './games'
import { canMatch, matchTick, schedule, startMatch, type LogEntry, type MatchState } from './match/run'

export const ROOM_MAX = 4
export const COUNTDOWN_MS = 3000
/** 斷線後位子保留多久 */
export const GRACE_MS = 45_000
/** 開房／加入後，多久內要連上 WebSocket（不然當作斷線） */
export const CONNECT_MS = 20_000

export interface Profile {
  name: string
  look?: { shape: string; tone: string; fill: string; acc?: string }
  level?: number
  titles?: string[]
  /** 這位玩家幫電腦取的名字（依電腦編號）；房主的那份給房間裡的電腦補位用 */
  bots?: string[]
}

/** 電腦對手的數量（名字最多收幾個） */
export const BOT_COUNT = 30

export interface Member extends Profile {
  /** 公開的玩家編號（大家看得到） */
  id: string
  /** 私密憑證（只有本人知道，之後靠它認人） */
  token: string
  host: boolean
  ready: boolean
  spectator: boolean
  /** 斷線中：幾點之前要連回來（0＝連線中） */
  away: number
  /** 開局後還在對局裡（還沒回到房間） */
  inGame: boolean
  joined: number
}

export type Phase = 'lobby' | 'countdown' | 'playing'

export interface RoomState {
  code: string
  gameId: string
  players: Member[]
  recommends: { playerId: string; gameId: string }[]
  phase: Phase
  /** 倒數結束、開局的時間（伺服器時間） */
  startAt: number
  /** 開局用的亂數種子 */
  seed: number
  /** 房主的規則設定（開局時照這份；房主換模式、按準備時送上來） */
  rules?: { gameId: string; options: Record<string, string | boolean> }
  /** 進行中的對局（能同步的玩法才有；大家都回到房間就清掉） */
  match?: MatchState
  /** 這個房間開過幾局 */
  matchN?: number
}

export type Intent =
  | { t: 'ready'; on: boolean }
  | { t: 'spectate'; on: boolean }
  | { t: 'mode'; gameId: string }
  | { t: 'recommend'; gameId: string }
  | { t: 'leave' }
  | { t: 'back' }
  | { t: 'rules'; gameId: string; options: Record<string, string | boolean> }

/** 對局中出牌：內容由各玩法自己檢查（match/defs.ts 的 parse） */
export type Act = { t: 'act'; a: unknown }

export type Hello = { t: 'hello'; pid: string; token: string }

/** 房間關掉的原因 */
export type CloseReason = 'disbanded' | 'empty'

// ── 檢查客戶端送來的東西 ──

const WORD = /^[A-Za-z0-9_-]{1,24}$/
/** 名字：去掉控制字元、頭尾空白，最多 16 個字 */
function cleanName(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = [...v.replace(/[\p{C}]/gu, '').trim()].slice(0, 16).join('')
  return s ? s : null
}
/** 一則訊息最多幾個字 */
export const MAX_MESSAGE = 1024

/** 個人資料（名字、頭像、等級、稱號）：格式不對就整份不收 */
export function parseProfile(raw: unknown): Profile | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const name = cleanName(r.name)
  if (!name) return null
  const out: Profile = { name }
  if (r.look !== undefined) {
    const l = r.look as Record<string, unknown>
    if (!l || typeof l !== 'object') return null
    for (const k of ['shape', 'tone', 'fill']) if (typeof l[k] !== 'string' || !WORD.test(l[k] as string)) return null
    if (l.acc !== undefined && (typeof l.acc !== 'string' || !WORD.test(l.acc))) return null
    out.look = { shape: l.shape as string, tone: l.tone as string, fill: l.fill as string, ...(l.acc ? { acc: l.acc as string } : {}) }
  }
  if (r.level !== undefined) {
    if (typeof r.level !== 'number' || !Number.isInteger(r.level) || r.level < 1 || r.level > 100000) return null
    out.level = r.level
  }
  if (r.titles !== undefined) {
    if (!Array.isArray(r.titles) || r.titles.length > 2 || !r.titles.every((t) => typeof t === 'string' && WORD.test(t))) return null
    out.titles = r.titles as string[]
  }
  if (r.bots !== undefined) {
    // 每個名字最多 12 字；留空的格子照收（那一位用預設名字）
    if (!Array.isArray(r.bots) || r.bots.length > BOT_COUNT || !r.bots.every((t) => typeof t === 'string' && t.length <= 40)) return null
    out.bots = (r.bots as string[]).map((t) => [...t.replace(/[\p{C}]/gu, '').trim()].slice(0, 12).join(''))
  }
  return out
}

/** 一則 WebSocket 訊息：只收認得的意圖，欄位型別、長度都要對 */
export function parseMessage(raw: unknown): Intent | Hello | Act | null {
  if (typeof raw !== 'string' || raw.length > MAX_MESSAGE) return null
  let m: unknown
  try {
    m = JSON.parse(raw)
  } catch {
    return null
  }
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null
  const o = m as Record<string, unknown>
  switch (o.t) {
    case 'hello':
      return typeof o.pid === 'string' && /^[0-9a-f]{8,32}$/.test(o.pid) && typeof o.token === 'string' && /^[0-9a-f]{32,64}$/.test(o.token) ? { t: 'hello', pid: o.pid, token: o.token } : null
    case 'ready':
    case 'spectate':
      return typeof o.on === 'boolean' ? { t: o.t, on: o.on } : null
    case 'mode':
    case 'recommend':
      return typeof o.gameId === 'string' && o.gameId in GAME_SEATS ? { t: o.t, gameId: o.gameId } : null
    case 'leave':
    case 'back':
      return { t: o.t }
    case 'rules': {
      const r = parseRules(o.gameId, o.options)
      return r ? { t: 'rules', ...r } : null
    }
    case 'act':
      return o.a && typeof o.a === 'object' && !Array.isArray(o.a) ? { t: 'act', a: o.a } : null
    default:
      return null
  }
}

/** 比對憑證（逐字比完，不提早結束） */
export function sameToken(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

// ── 房間 ──

/** rand(n)：n 個位元組的十六進位亂數字串（伺服器用 crypto，測試可以換掉） */
export type Rand = (bytes: number) => string

function newMember(p: Profile, host: boolean, now: number, rand: Rand): Member {
  return { ...p, id: rand(4), token: rand(24), host, ready: false, spectator: false, away: now + CONNECT_MS, inGame: false, joined: now }
}

export function createRoomState(code: string, host: Profile, now: number, rand: Rand): { room: RoomState; member: Member } {
  const member = newMember(host, true, now, rand)
  return { room: { code, gameId: '', players: [member], recommends: [], phase: 'lobby', startAt: 0, seed: 0 }, member }
}

export type JoinFail = 'full' | 'started'
export function addMember(room: RoomState, p: Profile, now: number, rand: Rand): Member | JoinFail {
  if (room.phase === 'playing') return 'started'
  if (room.players.length >= ROOM_MAX) return 'full'
  let m = newMember(p, false, now, rand)
  while (room.players.some((x) => x.id === m.id)) m = newMember(p, false, now, rand)
  room.players.push(m)
  syncCountdown(room, now)
  return m
}

/** 開始的條件：選好模式、對戰人數 1～模式人數、每個人（含觀戰）都準備好、沒有人斷線 */
export function canStart(room: RoomState): boolean {
  const seats = GAME_SEATS[room.gameId]
  if (!seats) return false
  const playing = room.players.filter((p) => !p.spectator).length
  return playing >= 1 && playing <= seats && room.players.length > 0 && room.players.every((p) => p.ready && !p.away)
}

/** 每次有變動後：條件成立就開始倒數；倒數中條件不成立就停下來 */
export function syncCountdown(room: RoomState, now: number) {
  if (room.phase === 'playing') return
  const ok = canStart(room)
  if (ok && room.phase === 'lobby') {
    room.phase = 'countdown'
    room.startAt = now + COUNTDOWN_MS
  } else if (!ok && room.phase === 'countdown') {
    room.phase = 'lobby'
    room.startAt = 0
  }
}

export interface IntentResult {
  /** 有沒有改到房間（要存檔、通知大家） */
  changed: boolean
  /** 這個人離開了 */
  left?: boolean
  /** 房間關掉了 */
  closed?: CloseReason
}

/** 處理一個意圖。誰送的（pid）由伺服器從連線認出來，不信客戶端說自己是誰 */
export function applyIntent(room: RoomState, pid: string, it: Intent, now: number): IntentResult {
  const me = room.players.find((p) => p.id === pid)
  if (!me) return { changed: false }
  switch (it.t) {
    case 'ready':
      // 對局中（還有人沒回到房間）不能準備
      if (room.phase === 'playing' || me.ready === it.on) return { changed: false }
      if (it.on && !room.gameId) return { changed: false }
      me.ready = it.on
      break
    case 'spectate':
      if (me.spectator === it.on) return { changed: false }
      me.spectator = it.on
      me.ready = false
      break
    case 'mode': {
      // 只有房主能換模式
      if (!me.host || room.gameId === it.gameId || room.phase === 'playing') return { changed: false }
      const seats = GAME_SEATS[it.gameId]
      room.gameId = it.gameId
      room.recommends = room.recommends.filter((r) => r.gameId !== it.gameId)
      for (const p of room.players) {
        p.ready = false
        if (seats >= room.players.length) p.spectator = false
      }
      break
    }
    case 'recommend':
      if (room.gameId === it.gameId) return { changed: false }
      room.recommends = [...room.recommends.filter((r) => r.playerId !== pid), { playerId: pid, gameId: it.gameId }]
      break
    case 'leave':
      // 房主離開＝解散
      if (me.host) return { changed: true, left: true, closed: 'disbanded' }
      removeMember(room, pid)
      syncCountdown(room, now)
      return { changed: true, left: true, closed: room.players.length ? undefined : 'empty' }
    case 'back':
      if (!me.inGame) return { changed: false }
      me.inGame = false
      // 離開對局：他的位子改由電腦代打
      schedule(room, now)
      if (room.phase === 'playing' && !room.players.some((p) => p.inGame)) toLobby(room)
      break
    case 'rules':
      // 只有房主能定規則
      if (!me.host) return { changed: false }
      room.rules = { gameId: it.gameId, options: it.options }
      return { changed: true }
  }
  syncCountdown(room, now)
  return { changed: true }
}

function removeMember(room: RoomState, pid: string) {
  const gone = room.players.find((p) => p.id === pid)
  room.players = room.players.filter((p) => p.id !== pid)
  room.recommends = room.recommends.filter((r) => r.playerId !== pid)
  // 房主走了（斷線太久）：最早進來的人接手
  if (gone?.host && room.players.length) room.players[0].host = true
  if (room.phase === 'playing' && !room.players.some((p) => p.inGame)) toLobby(room)
}

/** 大家都回到房間：對局收掉，回到等待中 */
function toLobby(room: RoomState) {
  room.phase = 'lobby'
  room.match = undefined
}

/** 斷線：取消準備，位子留一段時間 */
export function disconnect(room: RoomState, pid: string, now: number): boolean {
  const m = room.players.find((p) => p.id === pid)
  if (!m || m.away) return false
  m.away = now + GRACE_MS
  m.ready = false
  syncCountdown(room, now)
  // 對局中斷線：輪到他時由電腦代打
  schedule(room, now)
  return true
}
/** 連上（或連回來） */
export function connect(room: RoomState, pid: string, now = 0): boolean {
  const m = room.players.find((p) => p.id === pid)
  if (!m || !m.away) return false
  m.away = 0
  // 連回來：輪到他時又換回自己出（倒數重新算）
  schedule(room, now)
  return true
}

/** 時間到要處理的事：斷線太久的人移出房間、倒數結束開局 */
export function tick(room: RoomState, now: number, seed: number): { changed: boolean; started: boolean; closed?: CloseReason; entries: LogEntry[] } {
  let changed = false
  for (const p of [...room.players]) {
    if (p.away && p.away <= now) {
      removeMember(room, p.id)
      changed = true
    }
  }
  if (!room.players.length) return { changed: true, started: false, closed: 'empty', entries: [] }
  if (changed) syncCountdown(room, now)
  let started = false
  if (room.phase === 'countdown' && room.startAt <= now) {
    if (canStart(room)) {
      room.phase = 'playing'
      room.seed = seed
      room.startAt = 0
      for (const p of room.players) {
        p.ready = false
        p.inGame = true
      }
      // 能同步的玩法：伺服器發牌、當裁判（其他玩法還是各自在自己的裝置上跟電腦打）
      if (canMatch(room.gameId)) startMatch(room, seed, now)
      started = true
    } else room.phase = 'lobby'
    changed = true
  }
  // 對局：電腦出牌、真人時間到
  const entries = started ? [] : matchTick(room, now)
  return { changed, started, entries }
}

/** 下一次要叫醒伺服器的時間（0＝不用） */
export function nextWake(room: RoomState): number {
  const times = room.players.map((p) => p.away).filter((t) => t > 0)
  if (room.phase === 'countdown') times.push(room.startAt)
  if (room.match && !room.match.over && room.match.nextAt) times.push(room.match.nextAt)
  return times.length ? Math.min(...times) : 0
}

/** 給某一位玩家看的房間（每個人的視角各自算：不含別人的憑證；之後對局的私密資料也從這裡分開給） */
export interface RoomView {
  code: string
  gameId: string
  phase: Phase
  /** 離開局還有幾毫秒（倒數中才有） */
  startIn: number
  players: { id: string; name: string; host: boolean; me: boolean; ready: boolean; spectator: boolean; away: boolean; look?: Profile['look']; level?: number; titles?: string[] }[]
  recommends: { playerId: string; gameId: string }[]
  /** 電腦補位用的名字：跟著房主 */
  botNames: string[]
  /** 只給這位玩家的資料（之後放手牌等；現在是空的） */
  private: Record<string, never>
}
export function viewFor(room: RoomState, pid: string, now: number): RoomView {
  return {
    code: room.code,
    gameId: room.gameId,
    phase: room.phase,
    startIn: room.phase === 'countdown' ? Math.max(0, room.startAt - now) : 0,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      host: p.host,
      me: p.id === pid,
      ready: p.ready,
      spectator: p.spectator,
      away: !!p.away,
      ...(p.look ? { look: p.look } : {}),
      ...(p.level ? { level: p.level } : {}),
      ...(p.titles ? { titles: p.titles } : {}),
    })),
    recommends: room.recommends.slice(),
    botNames: room.players.find((p) => p.host)?.bots ?? [],
    private: {},
  }
}
