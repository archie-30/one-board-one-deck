// localStorage 存檔：鍵名一律為 obod.<名稱>.v1，寫入前先備份到 .bak。
// 不要更改既有鍵名；要改格式請先寫遷移程式。

const PREFIX = 'obod.'
const SUFFIX = '.v1'

export const storageKey = (name: string) => `${PREFIX}${name}${SUFFIX}`

function readRaw(key: string): unknown {
  try {
    const text = localStorage.getItem(key)
    if (text === null) return undefined
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** 用預設值補齊缺少的欄位（舊存檔不會報錯）；型別不符的欄位改用預設值 */
export function mergeDefaults<T>(defaults: T, saved: unknown): T {
  if (!isRecord(defaults)) {
    if (saved === undefined || saved === null) return defaults
    if (Array.isArray(defaults)) return (Array.isArray(saved) ? saved : defaults) as T
    return (typeof saved === typeof defaults ? saved : defaults) as T
  }
  if (!isRecord(saved)) return structuredClone(defaults)
  const out: Record<string, unknown> = { ...saved }
  for (const [k, v] of Object.entries(defaults)) out[k] = mergeDefaults(v, saved[k])
  return out as T
}

/** 讀取存檔；主檔損壞時改讀備份，都沒有就用預設值 */
export function loadSave<T>(name: string, defaults: T): T {
  const key = storageKey(name)
  let saved = readRaw(key)
  if (saved === undefined) saved = readRaw(`${key}.bak`)
  return mergeDefaults(defaults, saved)
}

export function writeSave<T>(name: string, value: T): void {
  const key = storageKey(name)
  try {
    const old = localStorage.getItem(key)
    if (old !== null && readRaw(key) !== undefined) localStorage.setItem(`${key}.bak`, old)
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 儲存空間不可用（例如無痕模式）時，遊戲仍可正常進行
  }
}
