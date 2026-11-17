// 連線房間的狀態與動作。
// 真的連線在 onlineWs.ts（Cloudflare 伺服器，main.ts 用 useOnlineService 接上）；這裡預設的是本機假服務（測試用）。
// 伺服器說了算：這裡的動作先在本機改一下讓畫面馬上有反應，同時把「意圖」送給伺服器，
// 伺服器回傳的房間（receiveRoom）會整個蓋過去。倒數與開局也由伺服器通知（receiveRoom 的 countdownEnd、receiveStart）。
//
// 房間規則：
// - 一間最多 4 人。房主開房；大家都可以在房間外（模式選單）逛模式。
// - 換模式：只有房主能換；其他人只能「推薦此模式」，推薦會出現在房間裡給房主看。
// - 開房時還沒選模式（「未選擇模式」），要先選一個才能開始。
// - 開始：在房間裡，大家都按「準備」就開始；人不夠的空位由電腦補上。
// - 模式人數比房間人數少（例如 4 人房玩 2 人的棋）：多出來的人要自己改成「觀戰」，對戰的人數不超過模式人數才能開始。
// - 只有按「離開房間」（房主是「解散房間」）才會離開；回主畫面、逛模式都還在房間裡。
import { computed, reactive, ref } from 'vue'
import type { Look } from '@/ui/art/look'

export interface RoomPlayer {
  /** 玩家編號（連線後由伺服器給） */
  id: string
  name: string
  /** 房主 */
  host: boolean
  /** 是不是自己 */
  me: boolean
  /** 頭像（別人的由連線傳來；自己的照個人資料） */
  look?: Look
  /** 按了準備 */
  ready: boolean
  /** 這一局觀戰 */
  spectator: boolean
  /** 個人資料（別人的由連線傳來，點頭像看得到） */
  level?: number
  titles?: string[]
  /** 斷線中（伺服器幫他留位子） */
  away?: boolean
}

export interface Recommend {
  playerId: string
  gameId: string
}

export interface Room {
  /** 4 位數房號 */
  code: string
  /** 目前的模式（空字串＝還沒選） */
  gameId: string
  players: RoomPlayer[]
  /** 大家推薦的模式（同一個人只留最新一個） */
  recommends: Recommend[]
  /** 等待中／倒數中／對局中（還有人沒回到房間） */
  phase?: 'lobby' | 'countdown' | 'playing'
  /** 倒數結束的時間（本機時鐘，0＝沒在倒數） */
  countdownEnd?: number
}

/** 開房、加入失敗的原因：格式、找不到、滿了、已開局、試太多次、連不上 */
export type JoinError = 'format' | 'notFound' | 'full' | 'started' | 'limited' | 'network'

/** 進房時給伺服器的個人資料（別人點頭像看得到） */
export interface OnlineProfile {
  name: string
  look?: Look
  level?: number
  titles?: string[]
}

/** 送給伺服器的「意圖」：只說想做什麼，結果由伺服器決定 */
export type RoomIntent = { t: 'ready'; on: boolean } | { t: 'spectate'; on: boolean } | { t: 'mode'; gameId: string } | { t: 'recommend'; gameId: string } | { t: 'back' }

/** 房間最多幾人 */
export const ROOM_MAX = 4
/** 房號：4 位數字 */
export const ROOM_CODE_LENGTH = 4
export const isRoomCode = (s: string) => new RegExp(`^\\d{${ROOM_CODE_LENGTH}}$`).test(s)

/** 連線服務。伺服器的通知用 receiveRoom／receiveStart／receiveClosed 告訴這裡。 */
export interface OnlineService {
  create(me: OnlineProfile): Promise<Room | JoinError>
  join(code: string, me: OnlineProfile): Promise<Room | JoinError>
  /** 離開房間（房主＝解散） */
  leave(): Promise<void>
  /** 送一個意圖給伺服器 */
  send(intent: RoomIntent): void
}

/** 本機假服務（測試、沒接伺服器時用）：只有自己一個人，加入房間一律找不到；倒數與開局在本機模擬 */
let localSeats = 0
let localTimer: ReturnType<typeof setTimeout> | undefined
function localSync() {
  const room = online.room
  if (!room) return
  const ok = startState(localSeats).canStart
  if (ok && !room.countdownEnd) {
    room.phase = 'countdown'
    room.countdownEnd = Date.now() + COUNTDOWN_MS
    localTimer = setTimeout(() => {
      if (online.room !== room || !startState(localSeats).canStart) return
      room.countdownEnd = 0
      room.phase = 'playing'
      beginMatch()
      receiveStart(room.gameId)
    }, COUNTDOWN_MS)
  } else if (!ok && room.countdownEnd) {
    clearTimeout(localTimer)
    room.countdownEnd = 0
    room.phase = 'lobby'
  }
}
const localService: OnlineService = {
  async create(me) {
    const code = String(Math.floor(Math.random() * 10 ** ROOM_CODE_LENGTH)).padStart(ROOM_CODE_LENGTH, '0')
    return { code, gameId: '', recommends: [], phase: 'lobby', countdownEnd: 0, players: [{ id: 'me', name: me.name, host: true, me: true, ready: false, spectator: false }] }
  },
  async join(code) {
    return isRoomCode(code) ? 'notFound' : 'format'
  },
  async leave() {
    clearTimeout(localTimer)
  },
  send(it) {
    if (it.t === 'back' && online.room) online.room.phase = 'lobby'
    localSync()
  },
}

/** 開局前倒數幾毫秒（跟伺服器一樣） */
export const COUNTDOWN_MS = 3000

let service: OnlineService = localService
/** 接上真的連線服務 */
export function useOnlineService(s: OnlineService) {
  service = s
}

/** 開局倒數（3、2、1；0＝沒在倒數）。由 App 層的 RoomCountdown 負責倒數與開局 */
export const roomCountdown = ref(0)

/** 目前所在的房間（沒有就是 null）；closed＝上一次被請出房間的原因（房主解散、斷線太久） */
export const online = reactive<{ room: Room | null; closed: string }>({ room: null, closed: '' })
/** 伺服器通知開局：每次開局 n 加一（RoomCountdown 看到就播過場、進入對局） */
export const matchStart = ref({ n: 0, gameId: '' })

/** 伺服器傳來的最新房間（整個蓋過本機的） */
export function receiveRoom(room: Room) {
  online.room = room
}
/** 伺服器說：開局！ */
export function receiveStart(gameId: string) {
  matchStart.value = { n: matchStart.value.n + 1, gameId }
}
/** 伺服器說：你已經不在房間裡了（房主解散、斷線太久、自己離開） */
export function receiveClosed(reason: string) {
  online.room = null
  online.closed = reason
  roomCountdown.value = 0
}

const me = () => online.room?.players.find((p) => p.me) ?? null
const send = (it: RoomIntent) => void service.send(it)

/** 自己能不能換模式（房主，或房主打開了「大家都能換」） */
export const canChangeMode = computed(() => !!online.room && !!me()?.host)
export const isHost = computed(() => !!me()?.host)

const asProfile = (me: OnlineProfile | string): OnlineProfile => (typeof me === 'string' ? { name: me } : me)

/** 開房：一開始不幫房主選模式（「未選擇模式」） */
export async function createRoom(me: OnlineProfile | string): Promise<Room | JoinError> {
  const r = await service.create(asProfile(me))
  if (typeof r !== 'string') ((online.room = r), (online.closed = ''))
  return r
}

export async function joinRoom(code: string, me: OnlineProfile | string): Promise<Room | JoinError> {
  if (!isRoomCode(code)) return 'format'
  const r = await service.join(code, asProfile(me))
  if (typeof r !== 'string') ((online.room = r), (online.closed = ''))
  return r
}

export async function leaveRoom() {
  const room = online.room
  online.room = null
  online.closed = ''
  roomCountdown.value = 0
  if (room) await service.leave()
}

/** 換模式：大家的「準備」都取消；新模式坐得下所有人的話，觀戰的人自動回來對戰 */
export function changeMode(gameId: string, seats: number) {
  const room = online.room
  if (!room || !canChangeMode.value || room.gameId === gameId) return
  room.gameId = gameId
  room.recommends = room.recommends.filter((r) => r.gameId !== gameId)
  for (const p of room.players) {
    p.ready = false
    if (seats >= room.players.length) p.spectator = false
  }
  localSeats = seats
  send({ t: 'mode', gameId })
}

/** 推薦模式（不能換模式的人用） */
export function recommendMode(gameId: string) {
  const room = online.room
  const m = me()
  if (!room || !m) return
  room.recommends = [...room.recommends.filter((r) => r.playerId !== m.id), { playerId: m.id, gameId }]
  send({ t: 'recommend', gameId })
}

export function setReady(on: boolean) {
  const m = me()
  if (!m) return
  m.ready = on
  send({ t: 'ready', on })
}

/** 開局：大家的準備清掉（打完回到房間要重新準備）。連線時由伺服器清，這裡只給本機假服務用 */
function beginMatch() {
  const room = online.room
  if (!room) return
  for (const p of room.players) p.ready = false
}

/** 打完回到房間：告訴伺服器（大家都回來了，房間才回到等待中） */
export function backToRoom() {
  if (online.room?.phase === 'playing') send({ t: 'back' })
}

/** 改成觀戰／回來對戰（改了就要重新準備） */
export function setSpectator(on: boolean) {
  const m = me()
  if (!m) return
  m.spectator = on
  m.ready = false
  send({ t: 'spectate', on })
}

/** 開始的條件：選好模式、對戰的人數不超過模式人數（空位電腦補）、房間裡每個人（含觀戰）都準備好了 */
export function startState(seats: number) {
  const room = online.room
  const ps = room?.players ?? []
  const playing = ps.filter((p) => !p.spectator).length
  const chosen = !!room?.gameId
  return {
    chosen,
    playing,
    /** 還要幾個人改成觀戰 */
    tooMany: chosen ? Math.max(0, playing - seats) : 0,
    /** 空位由電腦補上幾位 */
    ai: chosen ? Math.max(0, seats - playing) : 0,
    readyCount: ps.filter((p) => p.ready).length,
    total: ps.length,
    canStart: chosen && playing >= 1 && playing <= seats && ps.length > 0 && ps.every((p) => p.ready && !p.away),
  }
}
