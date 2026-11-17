// 連線伺服器的網址。
// - 本機開發（npm run dev）：連本機的伺服器（server/ 資料夾裡 npm run dev，預設 http://localhost:8787）
// - 正式（GitHub Pages、Android App）：Cloudflare 上的伺服器
// - 想改的話：建一個 .env.local，寫 VITE_ONLINE_URL=https://...（例如本機前端連正式伺服器）
const fromEnv = (import.meta.env.VITE_ONLINE_URL as string | undefined) ?? ''
export const ONLINE_URL = (fromEnv || (import.meta.env.DEV ? 'http://localhost:8787' : 'https://obod-online.one-board-one-deck.workers.dev')).replace(/\/+$/, '')

/** 開房、加入最多等幾毫秒 */
export const ONLINE_TIMEOUT = 8000
/** 心跳：每幾毫秒送一次 ping（伺服器自動回 pong，不耗額度） */
export const ONLINE_PING = 25_000
/** 斷線後重連：每次等多久（毫秒）；全部試完還連不上就當作離開房間（伺服器只幫你留位子 45 秒） */
export const ONLINE_RETRY = [500, 1000, 2000, 4000, 6000, 8000, 10_000]
