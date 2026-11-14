// 設定與戰績（會自動存檔）
import { reactive, watch } from 'vue'
import type { Difficulty } from '@/engine/common/types'
import { loadSave, writeSave } from './storage'

export interface GamePrefs {
  difficulty: Difficulty
  options: Record<string, string | boolean>
}

interface Settings {
  /** 0～1 */
  volume: number
  games: Record<string, GamePrefs>
  /** 每個分類上次選的遊戲 */
  lastGame: Record<string, string>
  /** 減少動畫（系統沒開「減少動態」時也可以在遊戲裡自己關） */
  reduceMotion: boolean
}

interface Stats {
  gomoku: { wins: number; losses: number; draws: number }
  bigtwo: { rounds: number; wins: number; totals: number[]; best: number }
  redpoint: { rounds: number; wins: number; best: number }
  go: { wins: number; losses: number }
  solitaire: { played: number; wins: number; best: number; fastest: number }
}

export const settings = reactive(loadSave<Settings>('settings', { volume: 0.7, games: {}, lastGame: {}, reduceMotion: false }))

const STATS_DEFAULT: Stats = {
  gomoku: { wins: 0, losses: 0, draws: 0 },
  bigtwo: { rounds: 0, wins: 0, totals: [0, 0, 0, 0], best: 0 },
  redpoint: { rounds: 0, wins: 0, best: 0 },
  go: { wins: 0, losses: 0 },
  solitaire: { played: 0, wins: 0, best: 0, fastest: 0 },
}

export const stats = reactive(loadSave<Stats>('stats', structuredClone(STATS_DEFAULT)))

/** 清除所有戰績（設定頁用） */
export function resetStats() {
  Object.assign(stats, structuredClone(STATS_DEFAULT))
}

watch(settings, (v) => writeSave('settings', v), { deep: true })
watch(stats, (v) => writeSave('stats', v), { deep: true })

/** 取得某個遊戲的偏好設定，沒有就建立 */
export function gamePrefs(gameId: string): GamePrefs {
  if (!settings.games[gameId]) settings.games[gameId] = { difficulty: 'normal', options: {} }
  const prefs = settings.games[gameId]
  if (prefs.difficulty !== 'easy' && prefs.difficulty !== 'normal') prefs.difficulty = 'normal'
  if (typeof prefs.options !== 'object' || prefs.options === null) prefs.options = {}
  return prefs
}
