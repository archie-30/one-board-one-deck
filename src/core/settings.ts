// 設定與戰績（會自動存檔）
import { reactive, watch } from 'vue'
import type { Difficulty } from '@/engine/common/types'
import { gainXp, resetProfile } from './profile'
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
  /** 開遊戲後第一次點畫面就自動全螢幕（瀏覽器規定要先點一下才能全螢幕） */
  fullscreen: boolean
  /** 鏡頭防遮擋：畫面避開手機的瀏海、挖孔鏡頭（往內縮一點） */
  avoidCutout: boolean
  /** 模式選單：點中間那張卡片也能開始遊戲（關掉就只能按「開始遊戲」） */
  cardStarts: boolean
  /** 保持螢幕恆亮：開著遊戲時不讓手機自動變暗、鎖螢幕 */
  keepAwake: boolean
}

interface Stats {
  gomoku: { wins: number; losses: number; draws: number }
  /** best：所有難度裡最高的；bestBy：各難度各自的最高分 */
  bigtwo: { rounds: number; wins: number; totals: number[]; best: number; bestBy: Record<string, number> }
  crazybigtwo: { rounds: number; wins: number; totals: number[]; best: number; bestBy: Record<string, number> }
  redpoint: { rounds: number; wins: number; best: number }
  go: { wins: number; losses: number }
  solitaire: { played: number; wins: number; best: number; fastest: number; bestBy: Record<string, number> }
  chess: { wins: number; losses: number; draws: number }
  xiangqi: { wins: number; losses: number; draws: number }
  othello: { wins: number; losses: number; draws: number }
  sevens: { rounds: number; wins: number }
  banqi: { wins: number; losses: number; draws: number }
  checkers: { wins: number; losses: number; draws: number }
  /** 星形跳棋：玩了幾局、拿第一幾次 */
  starcheckers: { games: number; firsts: number }
  quoridor: { wins: number; losses: number; draws: number }
  /** 近百場戰況：「遊戲:難度」→ 最近最多 100 場的結果，一個字一場（w 贏、l 輸、d 和） */
  recent: Record<string, string>
  /** 牌類難度改成低／中／高的搬家記號（0＝還沒搬，舊存檔或新玩家都會跑一次） */
  cardLevels: number
}

export const settings = reactive(loadSave<Settings>('settings', { volume: 0.7, games: {}, lastGame: {}, reduceMotion: false, autoPause: true, fullscreen: true, avoidCutout: true, cardStarts: true, keepAwake: true }))

const STATS_DEFAULT: Stats = {
  gomoku: { wins: 0, losses: 0, draws: 0 },
  bigtwo: { rounds: 0, wins: 0, totals: [0, 0, 0, 0], best: 0, bestBy: {} },
  crazybigtwo: { rounds: 0, wins: 0, totals: [0, 0, 0, 0], best: 0, bestBy: {} },
  redpoint: { rounds: 0, wins: 0, best: 0 },
  go: { wins: 0, losses: 0 },
  solitaire: { played: 0, wins: 0, best: 0, fastest: 0, bestBy: {} },
  chess: { wins: 0, losses: 0, draws: 0 },
  xiangqi: { wins: 0, losses: 0, draws: 0 },
  othello: { wins: 0, losses: 0, draws: 0 },
  sevens: { rounds: 0, wins: 0 },
  banqi: { wins: 0, losses: 0, draws: 0 },
  checkers: { wins: 0, losses: 0, draws: 0 },
  starcheckers: { games: 0, firsts: 0 },
  quoridor: { wins: 0, losses: 0, draws: 0 },
  recent: {},
  cardLevels: 0,
}

/** 近百場戰況最多記幾場（搬家時用；跟下面的 RECENT_MAX 一樣） */
const RECENT_MAX_SAVE = 100
export const stats = reactive(loadSave<Stats>('stats', structuredClone(STATS_DEFAULT)))
// 舊存檔只有一個最高分：算在當時的預設難度（大老二「中」、接龍「簡單」）
if (stats.bigtwo.best > 0 && !Object.keys(stats.bigtwo.bestBy).length) stats.bigtwo.bestBy.mid = stats.bigtwo.best
// 牌類（大老二、瘋狂大老二、排七）難度改成低／中／高：簡單 → 中、困難 → 高。
// 大老二更早是低／中／高／挑戰四段，當時的低、中算簡單（→ 中），高、挑戰算困難（→ 高）。只搬一次（cardLevels 記號）。
if (stats.cardLevels < 3) {
  const move = (by: Record<string, number>, legacyFour: boolean) => {
    const v = (k: string) => by[k] ?? 0
    const mid = Math.max(v('easy'), legacyFour ? Math.max(v('low'), v('mid')) : 0)
    const high = Math.max(v('hard'), legacyFour ? Math.max(v('high'), v('master')) : 0)
    for (const k of Object.keys(by)) delete by[k]
    if (mid) by.mid = mid
    if (high) by.high = high
  }
  move(stats.bigtwo.bestBy, true)
  move(stats.crazybigtwo.bestBy, false)
  for (const id of ['bigtwo', 'crazybigtwo', 'sevens']) {
    for (const [from, to] of [['easy', 'mid'], ['hard', 'high']]) {
      const k = `${id}:${from}`
      if (stats.recent[k] !== undefined) {
        stats.recent[`${id}:${to}`] = ((stats.recent[`${id}:${to}`] ?? '') + stats.recent[k]).slice(-RECENT_MAX_SAVE)
        delete stats.recent[k]
      }
    }
    const o = settings.games[id]?.options
    if (o?.difficulty === 'easy') o.difficulty = 'mid'
    else if (o?.difficulty === 'hard') o.difficulty = 'high'
  }
  stats.cardLevels = 3
}
if (stats.solitaire.best > 0 && !Object.keys(stats.solitaire.bestBy).length) stats.solitaire.bestBy.easy = stats.solitaire.best

/** 某個難度的最高分 */
export const bestAt = (game: 'bigtwo' | 'crazybigtwo' | 'solitaire', level: string): number => stats[game].bestBy[level] ?? 0
/** 記下一個分數：這個難度的最高分、所有難度裡的最高分都更新 */
export function recordBest(game: 'bigtwo' | 'crazybigtwo' | 'solitaire', level: string, value: number) {
  const g = stats[game]
  g.bestBy[level] = Math.max(g.bestBy[level] ?? 0, value)
  g.best = Math.max(g.best, value)
}

/** 近百場戰況要記幾場 */
export const RECENT_MAX = 100
/**
 * 記一場結果（每個玩法、每個難度各自記；沒有難度的玩法用 'all'），同時給經驗值（個人資料）。
 * perf：這一局的表現 0～1（贏多少／輸的話差多少，1＝差一點就贏），算不出來就不給（當 0.5）。
 */
export function recordResult(gameId: string, level: string, result: 'w' | 'l' | 'd', perf?: number) {
  const key = `${gameId}:${level}`
  stats.recent[key] = ((stats.recent[key] ?? '') + result).slice(-RECENT_MAX)
  gainXp(gameId, level, result, perf)
}
/** 某個玩法某個難度最近幾場的勝負和 */
export function recentAt(gameId: string, level: string): { n: number; w: number; l: number; d: number } {
  const s = stats.recent[`${gameId}:${level}`] ?? ''
  const count = (ch: string) => s.split(ch).length - 1
  return { n: s.length, w: count('w'), l: count('l'), d: count('d') }
}

/** 清除所有戰績（設定頁用） */
export function resetStats() {
  Object.assign(stats, structuredClone(STATS_DEFAULT))
  resetProfile()
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
