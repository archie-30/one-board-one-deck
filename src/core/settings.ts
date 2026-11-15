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
  /** 切走分頁／App、離開視窗時自動暫停並保存進度 */
  autoPause: boolean
}

interface Stats {
  gomoku: { wins: number; losses: number; draws: number }
  /** best：所有難度裡最高的；bestBy：各難度各自的最高分 */
  bigtwo: { rounds: number; wins: number; totals: number[]; best: number; bestBy: Record<string, number> }
  redpoint: { rounds: number; wins: number; best: number }
  go: { wins: number; losses: number }
  solitaire: { played: number; wins: number; best: number; fastest: number; bestBy: Record<string, number> }
  chess: { wins: number; losses: number; draws: number }
  xiangqi: { wins: number; losses: number; draws: number }
  othello: { wins: number; losses: number; draws: number }
}

export const settings = reactive(loadSave<Settings>('settings', { volume: 0.7, games: {}, lastGame: {}, reduceMotion: false, autoPause: true }))

const STATS_DEFAULT: Stats = {
  gomoku: { wins: 0, losses: 0, draws: 0 },
  bigtwo: { rounds: 0, wins: 0, totals: [0, 0, 0, 0], best: 0, bestBy: {} },
  redpoint: { rounds: 0, wins: 0, best: 0 },
  go: { wins: 0, losses: 0 },
  solitaire: { played: 0, wins: 0, best: 0, fastest: 0, bestBy: {} },
  chess: { wins: 0, losses: 0, draws: 0 },
  xiangqi: { wins: 0, losses: 0, draws: 0 },
  othello: { wins: 0, losses: 0, draws: 0 },
}

export const stats = reactive(loadSave<Stats>('stats', structuredClone(STATS_DEFAULT)))
// 舊存檔只有一個最高分：算在當時的預設難度（大老二「中」、接龍「簡單」）
if (stats.bigtwo.best > 0 && !Object.keys(stats.bigtwo.bestBy).length) stats.bigtwo.bestBy.mid = stats.bigtwo.best
// 大老二難度從「低／中／高／挑戰」改成「簡單／困難」：低、中的最高分算簡單，高、挑戰的算困難
{
  const by = stats.bigtwo.bestBy
  const old = (k: string) => by[k] ?? 0
  if (['low', 'mid', 'high', 'master'].some((k) => k in by)) {
    by.easy = Math.max(by.easy ?? 0, old('low'), old('mid'))
    by.hard = Math.max(by.hard ?? 0, old('high'), old('master'))
    for (const k of ['low', 'mid', 'high', 'master']) delete by[k]
  }
}
if (stats.solitaire.best > 0 && !Object.keys(stats.solitaire.bestBy).length) stats.solitaire.bestBy.easy = stats.solitaire.best

/** 某個難度的最高分 */
export const bestAt = (game: 'bigtwo' | 'solitaire', level: string): number => stats[game].bestBy[level] ?? 0
/** 記下一個分數：這個難度的最高分、所有難度裡的最高分都更新 */
export function recordBest(game: 'bigtwo' | 'solitaire', level: string, value: number) {
  const g = stats[game]
  g.bestBy[level] = Math.max(g.bestBy[level] ?? 0, value)
  g.best = Math.max(g.best, value)
}

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
