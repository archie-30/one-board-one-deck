import type { Directory } from './directory'
import type { Room } from './room'

export interface Env {
  ROOM: DurableObjectNamespace<Room>
  DIRECTORY: DurableObjectNamespace<Directory>
  /** 允許連線的網頁來源（逗號分隔），例如 https://archie-30.github.io */
  ALLOWED_ORIGINS: string
  /** "1"＝也允許本機開發（http://localhost:任何埠） */
  ALLOW_LOCAL?: string
}
