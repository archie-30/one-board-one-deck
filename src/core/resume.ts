// 「保存進度並退出」的存檔：每款遊戲最多一份，存在 obod.resume.v1。
// 存的是各遊戲自己整理好、可以 JSON 化的資料（引擎狀態＋對手是誰等），以及當時的規則設定。
import { reactive, watch } from 'vue'
import { loadSave, writeSave } from './storage'

export interface ResumeEntry {
  /** 存檔時間（毫秒） */
  savedAt: number
  /** 存檔當時的規則設定（繼續玩時沿用，不受之後改設定影響） */
  options: Record<string, string | boolean>
  /** 遊戲自己的資料 */
  data: unknown
}

const store = reactive(loadSave<Record<string, ResumeEntry>>('resume', {}))
watch(store, (v) => writeSave('resume', v), { deep: true })

/**
 * 存檔放在哪一格：同一個玩法、不同難度各自一份（選簡單不會讀到困難的存檔），沒有難度的玩法一格。
 * 存檔裡的鍵名照舊（obod.resume.v1），只是裡面的格子分得更細。
 */
export const resumeSlot = (gameId: string, level?: string | boolean) => (typeof level === 'string' && level ? `${gameId}@${level}` : gameId)

export function getResume(slot: string): ResumeEntry | null {
  if (store[slot]) return store[slot]
  // 舊存檔（還沒分難度時存的，放在玩法那一格）：存的難度一樣才搬過來用
  const at = slot.indexOf('@')
  if (at < 0) return null
  const gameId = slot.slice(0, at)
  const old = store[gameId]
  if (!old || (old.options.difficulty !== undefined && old.options.difficulty !== slot.slice(at + 1))) return null
  store[slot] = old
  delete store[gameId]
  return old
}

export function setResume(slot: string, data: unknown, options: Record<string, string | boolean>) {
  store[slot] = { savedAt: Date.now(), options: { ...options }, data: JSON.parse(JSON.stringify(data)) }
}

export function clearResume(slot: string) {
  delete store[slot]
}

/** 格式化遊戲進度：刪掉所有保存中、玩到一半的對局 */
export function clearAllResume() {
  for (const id of Object.keys(store)) delete store[id]
  flushResume()
}

/** 立刻寫進存檔（分頁要被關掉時，等不到平常的自動存檔） */
export function flushResume() {
  writeSave('resume', JSON.parse(JSON.stringify(store)))
}
