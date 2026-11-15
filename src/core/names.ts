// 電腦對手的名字：玩家可以自己取（主畫面「幫電腦取名字」）。存檔 obod.names.v1。
// 規則：20 個名字不能重複；「恢復預設」回到固定的 20 個預設名字；留空就用那一位的預設名字（被別人用掉了才從名字庫抽）；有不雅字眼的直接換成名字庫的名字（不提示）；長度有上限。
import { reactive, watch } from 'vue'
import { BLOCKED_WORDS, NAME_MAX_WIDTH, NAME_POOL } from '@/data/namePool'
import { OPPONENTS } from '@/data/names'
import { loadSave, writeSave } from './storage'

const COUNT = OPPONENTS.length
const DEFAULTS = OPPONENTS.map((o) => o.name)

const saved = loadSave<{ names: string[] }>('names', { names: [] })
export const opponentNames = reactive<{ names: string[] }>({ names: valid(saved.names) ? saved.names.slice() : DEFAULTS.slice() })
watch(opponentNames, (v) => writeSave('names', { names: v.names }), { deep: true })

function valid(list: unknown): list is string[] {
  return Array.isArray(list) && list.length === COUNT && list.every((n) => typeof n === 'string' && n.length > 0) && new Set(list).size === COUNT
}

const charWidth = (ch: string) => (/[\u0000-ÿ]/.test(ch) ? 1 : 2)
export const nameWidth = (s: string) => [...s].reduce((w, ch) => w + charWidth(ch), 0)

/** 整理輸入：去掉前後空白、控制字元與表情符號，連續空白變一個，超過長度就截斷 */
export function cleanName(raw: string): string {
  const s = raw
    .replace(/[\p{Cc}\p{Cf}\p{Extended_Pictographic}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
  let out = ''
  let w = 0
  for (const ch of s) {
    w += charWidth(ch)
    if (w > NAME_MAX_WIDTH) break
    out += ch
  }
  return out.trim()
}

/** 有沒有不雅字眼（忽略大小寫、空白與符號，避免用空格或符號拆開躲過） */
export function isBlocked(name: string): boolean {
  const flat = name.toLowerCase().replace(/[\s\p{P}\p{S}_]/gu, '')
  return BLOCKED_WORDS.some((w) => flat.includes(w))
}

/** 從名字庫抽一個沒被用掉的名字 */
function draw(taken: Set<string>): string {
  const free = NAME_POOL.filter((n) => !taken.has(n))
  if (free.length) return free[Math.floor(Math.random() * free.length)]
  for (let k = 1; ; k++) if (!taken.has(`電腦${k}`)) return `電腦${k}`
}

export type SetNameResult = 'ok' | 'duplicate'

/** 改第 i 位的名字：留空或有不雅字眼就自動取名；跟別人重複就不改並回報 */
export function setOpponentName(i: number, raw: string): SetNameResult {
  const others = new Set(opponentNames.names.filter((_, k) => k !== i))
  let name = cleanName(raw)
  if (name && others.has(name)) return 'duplicate'
  if (!name || isBlocked(name)) name = others.has(DEFAULTS[i]) ? draw(others) : DEFAULTS[i]
  opponentNames.names[i] = name
  return 'ok'
}

/** 恢復預設：回到固定的 20 個預設名字 */
export function resetOpponentNames() {
  opponentNames.names = DEFAULTS.slice()
}

export const opponentName = (id: number): string => opponentNames.names[id] ?? DEFAULTS[id]
