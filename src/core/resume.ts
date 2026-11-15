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

export const getResume = (gameId: string): ResumeEntry | null => store[gameId] ?? null

export function setResume(gameId: string, data: unknown, options: Record<string, string | boolean>) {
  store[gameId] = { savedAt: Date.now(), options: { ...options }, data: JSON.parse(JSON.stringify(data)) }
}

export function clearResume(gameId: string) {
  delete store[gameId]
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
