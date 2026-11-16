// 連線房間的狀態與動作（建立、加入、離開、選遊戲）。
// 現在只有介面：還沒接真的連線，房號在本機產生、別人加入不了。
// 之後接連線時，只要把下面的 `service` 換成真的實作（例如 WebSocket／Firebase），畫面不用改。
import { reactive } from 'vue'
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
}

export interface Room {
  /** 4 位數房號 */
  code: string
  /** 選好的玩法 */
  gameId: string
  players: RoomPlayer[]
}

export type JoinError = 'format' | 'notFound' | 'full'

/** 連線服務：之後換成真的實作 */
export interface OnlineService {
  create(me: { name: string }, gameId: string): Promise<Room>
  join(code: string, me: { name: string }): Promise<Room | JoinError>
  leave(code: string): Promise<void>
  setGame(code: string, gameId: string): Promise<void>
}

/** 房號：4 位數字 */
export const ROOM_CODE_LENGTH = 4
export const isRoomCode = (s: string) => new RegExp(`^\\d{${ROOM_CODE_LENGTH}}$`).test(s)

/** 先用的假服務：只在本機產生房號；因為還沒有伺服器，加入房間一律找不到 */
const localService: OnlineService = {
  async create(me, gameId) {
    const code = String(Math.floor(Math.random() * 10 ** ROOM_CODE_LENGTH)).padStart(ROOM_CODE_LENGTH, '0')
    return { code, gameId, players: [{ id: 'me', name: me.name, host: true, me: true }] }
  },
  async join(code) {
    return isRoomCode(code) ? 'notFound' : 'format'
  },
  async leave() {},
  async setGame() {},
}

let service: OnlineService = localService
/** 接上真的連線服務 */
export function useOnlineService(s: OnlineService) {
  service = s
}

/** 目前所在的房間（沒有就是 null） */
export const online = reactive<{ room: Room | null }>({ room: null })

export async function createRoom(name: string, gameId: string): Promise<Room> {
  const room = await service.create({ name }, gameId)
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

/** 房主換玩法 */
export async function setRoomGame(gameId: string) {
  const room = online.room
  if (!room || !room.players.find((p) => p.me)?.host) return
  room.gameId = gameId
  await service.setGame(room.code, gameId)
}
