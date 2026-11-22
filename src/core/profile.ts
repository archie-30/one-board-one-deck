// 玩家個人資料：名字、經驗值／等級、稱號、頭像。存檔 obod.profile.v1。
// 每局結束（settings.ts 的 recordResult）呼叫 gainXp：依輸贏、表現、難度給經驗，一局有上限；
// 接著檢查有沒有新解鎖的稱號、頭像零件，有的話放進 unlockQueue，由 App 層的 UnlockDialog 跳出來。
import { reactive, watch } from 'vue'
import {
  ALL_GAMES, NEW_GAMES,
  AVATAR_ACCS,
  AVATAR_FILLS,
  AVATAR_SHAPES,
  AVATAR_TONES,
  TITLE_SLOTS,
  TITLES,
  TOP_LEVEL,
  XP_GAME_CAP,
  XP_LEVEL_BONUS,
  XP_PER_LEVEL,
  XP_RULE,
  type TitleRule,
} from '@/data/profile'
import type { Look } from '@/ui/art/look'
import { loadSave, writeSave } from './storage'
import { cleanName, isBlocked } from './names'

interface GameCount {
  played: number
  wins: number
  /** 在最難的難度贏的場數 */
  top: number
}
interface Profile {
  name: string
  xp: number
  /** 裝備中的稱號（最多 2 個） */
  equipped: string[]
  look: Look
  /** 已解鎖的稱號 */
  titles: string[]
  /** 每個玩法累計（不像近百場只記 100 場） */
  games: Record<string, GameCount>
  played: number
  /** 累計輸幾場（稱號「屢敗屢戰」） */
  lost: number
}

const FREE = TITLES.filter((t) => t.rule.kind === 'free').map((t) => t.id)
const DEFAULT: Profile = { name: '', xp: 0, equipped: [FREE[0]], look: { shape: 'circle', tone: 'ink', fill: 'solid', acc: 'none' }, titles: FREE.slice(), games: {}, played: 0, lost: 0 }
const KNOWN = new Set(TITLES.map((t) => t.id))

export const profile = reactive(loadSave<Profile>('profile', structuredClone(DEFAULT)))
watch(profile, (v) => writeSave('profile', v), { deep: true })

/** 等級：每 300 經驗升一級，從 1 級開始，沒有上限 */
export const levelOf = (xp: number) => Math.floor(xp / XP_PER_LEVEL) + 1
/** 這一級已經累積多少、還要多少 */
export const levelProgress = (xp: number) => ({ into: xp % XP_PER_LEVEL, need: XP_PER_LEVEL })

/** 某個長相（零件沒解鎖的話退回預設，避免舊存檔或格式化後用到還沒解鎖的） */
export function safeLook(look: Look): Look {
  const lv = levelOf(profile.xp)
  const ok = <T>(list: { value: T; level: number }[], v: T, d: T) => (list.some((p) => p.value === v && p.level <= lv) ? v : d)
  return {
    shape: ok(AVATAR_SHAPES, look.shape, 'circle'),
    tone: ok(AVATAR_TONES, look.tone, 'ink'),
    fill: ok(AVATAR_FILLS, look.fill, 'solid'),
    acc: ok(AVATAR_ACCS, look.acc ?? 'none', 'none'),
  }
}
/** 玩家現在的頭像 */
export const myLook = (): Look => safeLook(profile.look)

/** 整理名字：有不雅字眼就不採用（留空＝顯示「玩家」） */
export function tidyName(raw: string): string {
  const name = cleanName(raw)
  return name && !isBlocked(name) ? name : ''
}

/** 個人頁按「儲存」：名字、裝備的稱號、頭像一起存 */
export function saveProfile(draft: { name: string; equipped: string[]; look: Look }) {
  profile.name = tidyName(draft.name)
  profile.equipped = draft.equipped.filter((id) => profile.titles.includes(id)).slice(0, TITLE_SLOTS)
  profile.look = safeLook(draft.look)
}

/** 這個稱號解鎖了沒（照目前的戰績算） */
function earned(rule: TitleRule): boolean {
  const g = (id: string) => profile.games[id] ?? { played: 0, wins: 0, top: 0 }
  switch (rule.kind) {
    case 'free':
      return true
    case 'level':
      return levelOf(profile.xp) >= rule.n
    case 'wins':
      return g(rule.game).wins >= rule.n
    case 'top':
      return g(rule.game).top >= rule.n
    case 'played':
      return profile.played >= rule.n
    case 'lost':
      return profile.lost >= rule.n
    case 'allWins':
      return ALL_GAMES.every((id) => g(id).wins >= 1)
    case 'gamePlayed':
      return g(rule.game).played >= rule.n
    case 'allNew':
      return NEW_GAMES.every((id) => g(id).wins >= 1)
  }
}

export type Part = 'shape' | 'tone' | 'fill' | 'acc'
export type Unlock = { kind: 'level'; level: number } | { kind: 'title'; id: string } | { kind: 'avatar'; part: Part; value: string }
/** 一局結束後要告訴玩家的事：拿到幾點經驗、解鎖了什麼 */
export const unlockQueue = reactive<{ gained: number; items: Unlock[] }[]>([])
/** 最近一局拿到的經驗（App 層的小提示用） */
export const lastGain = reactive({ xp: 0, key: 0 })

/**
 * 一局結束：給經驗、更新累計、檢查解鎖。
 * perf：這一局的表現 0～1——贏的時候是贏多少、輸的時候是差多少（1＝差一點點就贏），算不出來就給 0.5。
 */
export function gainXp(gameId: string, level: string, result: 'w' | 'l' | 'd', perf = 0.5) {
  const p = Math.max(0, Math.min(1, Number.isFinite(perf) ? perf : 0.5))
  const rule = result === 'w' ? XP_RULE.win : result === 'd' ? XP_RULE.draw : XP_RULE.loss
  const bonus = XP_LEVEL_BONUS[level] ?? 0
  const xp = Math.min(XP_GAME_CAP, Math.round(rule.base + rule.perf * p + (result === 'w' ? bonus : bonus / 2)))

  const before = levelOf(profile.xp)
  profile.xp += xp
  profile.played++
  if (result === 'l') profile.lost++
  const g = (profile.games[gameId] ??= { played: 0, wins: 0, top: 0 })
  g.played++
  if (result === 'w') {
    g.wins++
    if (TOP_LEVEL[gameId] === level) g.top++
  }

  const items: Unlock[] = []
  const after = levelOf(profile.xp)
  if (after > before) {
    items.push({ kind: 'level', level: after })
    for (const [part, list] of [['shape', AVATAR_SHAPES], ['tone', AVATAR_TONES], ['fill', AVATAR_FILLS], ['acc', AVATAR_ACCS]] as const)
      for (const a of list as { value: string; level: number }[]) if (a.level > before && a.level <= after) items.push({ kind: 'avatar', part, value: a.value })
  }
  for (const t of TITLES)
    if (!profile.titles.includes(t.id) && earned(t.rule)) {
      profile.titles.push(t.id)
      items.push({ kind: 'title', id: t.id })
    }
  lastGain.xp = xp
  lastGain.key++
  if (items.length) unlockQueue.push({ gained: xp, items })
  return xp
}

/** 稱號解鎖了沒（個人頁用） */
export const hasTitle = (id: string) => profile.titles.includes(id)

/** 格式化遊戲進度：經驗、稱號、累計歸零（名字留著） */
export function resetProfile() {
  const name = profile.name
  Object.assign(profile, structuredClone(DEFAULT), { name })
  unlockQueue.splice(0)
}

// 舊版（v0.16.0）只有一個稱號欄位 title、稱號編號也不一樣：不認得的拿掉，照目前戰績重新算一次（不跳彈窗）
function migrate() {
  const old = profile as Profile & { title?: string }
  delete old.title
  profile.titles = profile.titles.filter((id) => KNOWN.has(id))
  for (const t of TITLES) if (!profile.titles.includes(t.id) && earned(t.rule)) profile.titles.push(t.id)
  profile.equipped = profile.equipped.filter((id) => profile.titles.includes(id)).slice(0, TITLE_SLOTS)
  profile.look.acc ??= 'none'
}
migrate()
