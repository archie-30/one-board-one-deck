// 電腦對手的名字：玩家可以自己取（主畫面「幫電腦取名字」）。存檔 obod.names.v1。
// 規則：30 位對手，名字可以重複；「恢復預設」回到固定的預設名字；留空就用那一位的預設名字；有不雅字眼的直接換成名字庫的名字（不提示）；長度有上限。
// 舊存檔只有 20 個名字（以前只有 20 位）：後面補上新對手的預設名字。
import { reactive, watch } from 'vue'
import { BLOCKED_WORDS, NAME_MAX_WIDTH, NAME_POOL } from '@/data/namePool'
import { OPPONENTS } from '@/data/names'
import { online } from './online'
import { loadSave, writeSave } from './storage'

const COUNT = OPPONENTS.length
const DEFAULTS = OPPONENTS.map((o) => o.name)

const saved = loadSave<{ names: string[] }>('names', { names: [] })
export const opponentNames = reactive<{ names: string[] }>({ names: upgrade(saved.names) })
watch(opponentNames, (v) => writeSave('names', { names: v.names }), { deep: true })

/** 讀回的名字：格式不對就用預設；比現在的對手少（舊版 20 位）就補上預設名字 */
function upgrade(list: unknown): string[] {
  if (!Array.isArray(list) || !list.length || !list.every((n) => typeof n === 'string' && n.length > 0)) return DEFAULTS.slice()
  return DEFAULTS.map((d, i) => (list[i] as string | undefined) ?? d).slice(0, COUNT)
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

/** 從名字庫隨便抽一個 */
const draw = () => NAME_POOL[Math.floor(Math.random() * NAME_POOL.length)]

/** 改第 i 位的名字（可以跟別人重複）：留空就用他的預設名字；有不雅字眼就換成名字庫的名字 */
export function setOpponentName(i: number, raw: string) {
  const name = cleanName(raw)
  opponentNames.names[i] = !name ? DEFAULTS[i] : isBlocked(name) ? draw() : name
}

/** 恢復預設：回到固定的預設名字 */
export function resetOpponentNames() {
  opponentNames.names = DEFAULTS.slice()
}

/** 第 id 位電腦的名字。連線房間裡用房主取的名字（大家看到的電腦名字一樣）；房主那一格留空或不雅就用預設名字 */
export function opponentName(id: number): string {
  const host = online.room?.botNames
  if (host) {
    const n = cleanName(host[id] ?? '')
    return n && !isBlocked(n) ? n : DEFAULTS[id]
  }
  return opponentNames.names[id] ?? DEFAULTS[id]
}
