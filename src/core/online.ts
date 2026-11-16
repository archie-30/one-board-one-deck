// 連線房間的狀態與動作。
// 現在只有介面：還沒接真的連線，房號在本機產生、別人加入不了。
// 之後接連線時，只要把下面的 `service` 換成真的實作（例如 WebSocket／Firebase），畫面不用改。
//
// 房間規則：
// - 一間最多 4 人。房主開房；大家都可以在房間外（模式選單）逛模式。
// - 換模式：只有房主能換；其他人只能「推薦此模式」，推薦會出現在房間裡給房主看。
// - 開房時還沒選模式（「未選擇模式」），要先選一個才能開始。
// - 開始：在房間裡，大家都按「準備」就開始；人不夠的空位由電腦補上。
// - 模式人數比房間人數少（例如 4 人房玩 2 人的棋）：多出來的人要自己改成「觀戰」，對戰的人數不超過模式人數才能開始。
// - 只有按「離開房間」（房主是「解散房間」）才會離開；回主畫面、逛模式都還在房間裡。
import { computed, reactive } from 'vue'
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
}

export type JoinError = 'format' | 'notFound' | 'full'

/** 房間最多幾人 */
export const ROOM_MAX = 4
/** 房號：4 位數字 */
export const ROOM_CODE_LENGTH = 4
export const isRoomCode = (s: string) => new RegExp(`^\\d{${ROOM_CODE_LENGTH}}$`).test(s)

/** 連線服務：之後換成真的實作。每個動作都把變動送出去；別人的變動由服務改 online.room。 */
export interface OnlineService {
  create(me: { name: string }): Promise<Room>
  join(code: string, me: { name: string }): Promise<Room | JoinError>
  leave(code: string): Promise<void>
  /** 自己的狀態（準備、觀戰）或房間設定（模式、權限、推薦）有變 */
  update(room: Room): Promise<void>
}

/** 先用的假服務：只在本機產生房號；因為還沒有伺服器，加入房間一律找不到 */
const localService: OnlineService = {
  async create(me) {
    const code = String(Math.floor(Math.random() * 10 ** ROOM_CODE_LENGTH)).padStart(ROOM_CODE_LENGTH, '0')
    return { code, gameId: '', recommends: [], players: [{ id: 'me', name: me.name, host: true, me: true, ready: false, spectator: false }] }
  },
  async join(code) {
    return isRoomCode(code) ? 'notFound' : 'format'
  },
  async leave() {},
  async update() {},
}

let service: OnlineService = localService
/** 接上真的連線服務 */
export function useOnlineService(s: OnlineService) {
  service = s
}

/** 目前所在的房間（沒有就是 null） */
export const online = reactive<{ room: Room | null }>({ room: null })

const me = () => online.room?.players.find((p) => p.me) ?? null
const push = () => online.room && void service.update(online.room)

/** 自己能不能換模式（房主，或房主打開了「大家都能換」） */
export const canChangeMode = computed(() => !!online.room && !!me()?.host)
export const isHost = computed(() => !!me()?.host)

/** 開房：一開始不幫房主選模式（「未選擇模式」） */
export async function createRoom(name: string): Promise<Room> {
  const room = await service.create({ name })
  online.room = room
  return room
}

export async function joinRoom(code: string, name: string): Promise<Room | JoinError> {
  if (!isRoomCode(code)) return 'format'
  const r = await service.join(code, { name })
  if (typeof r !== 'string') online.room = r
  return r
}

export async function leaveRoom() {
  const room = online.room
  online.room = null
  if (room) await service.leave(room.code)
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
  push()
}

/** 推薦模式（不能換模式的人用） */
export function recommendMode(gameId: string) {
  const room = online.room
  const m = me()
  if (!room || !m) return
  room.recommends = [...room.recommends.filter((r) => r.playerId !== m.id), { playerId: m.id, gameId }]
  push()
}

export function setReady(on: boolean) {
  const m = me()
  if (!m) return
  m.ready = on
  push()
}

/** 改成觀戰／回來對戰（改了就要重新準備） */
export function setSpectator(on: boolean) {
  const m = me()
  if (!m) return
  m.spectator = on
  m.ready = false
  push()
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
    canStart: chosen && playing >= 1 && playing <= seats && ps.length > 0 && ps.every((p) => p.ready),
  }
}
