// 網站更新後，還開著的舊頁面會去拿舊版的遊戲檔；新版部署後那些檔案已經不存在，
// 遊戲就打不開、畫面一片空白（只有網頁版會這樣，App 版的檔案都在手機裡）。
// 偵測到「遊戲檔載入失敗」就重新整理一次載入最新版，並記住要回到哪個玩法的模式選單。
// 15 秒內最多重新整理一次，萬一真的是網路斷了也不會一直重整。

const RELOADED_AT = 'obod.reloadedAt'
const REOPEN = 'obod.reopen'

/** 這個錯誤是不是「程式檔載入失敗」（各家瀏覽器的訊息不一樣） */
export function isStaleChunk(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '')
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/i.test(msg)
}

/** 重新整理一次載入最新版；reopen＝重新整理後要回到哪個分類的模式選單。回傳 false 表示剛剛才重整過，這次不重整 */
export function reloadForUpdate(reopen?: { category: string; gameId: string }): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOADED_AT) ?? 0)
    if (Date.now() - last < 15000) return false
    sessionStorage.setItem(RELOADED_AT, String(Date.now()))
    if (reopen) sessionStorage.setItem(REOPEN, JSON.stringify(reopen))
  } catch {
    // 無痕模式等存不了：照樣重整
  }
  location.reload()
  return true
}

/** 開機時拿出「重整前要回去的地方」（拿了就刪掉） */
export function takeReopen(): { category: string; gameId: string } | null {
  try {
    const raw = sessionStorage.getItem(REOPEN)
    sessionStorage.removeItem(REOPEN)
    const v = raw ? (JSON.parse(raw) as { category?: unknown; gameId?: unknown }) : null
    return v && typeof v.category === 'string' && typeof v.gameId === 'string' ? { category: v.category, gameId: v.gameId } : null
  } catch {
    return null
  }
}
