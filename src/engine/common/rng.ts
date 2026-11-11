// 可指定 seed 的亂數（mulberry32）。純函式：輸入狀態，輸出 [數值, 新狀態]。
// 引擎內所有隨機都必須走這裡，才能測試與重播。

export type RngState = number

export function seedRng(seed: number): RngState {
  return seed >>> 0
}

/** 回傳 [0,1) 的小數與下一個狀態 */
export function nextRandom(state: RngState): [number, RngState] {
  const next = (state + 0x6d2b79f5) >>> 0
  let t = next
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296
  return [value, next]
}

/** 回傳 [0,n) 的整數與下一個狀態 */
export function nextInt(state: RngState, n: number): [number, RngState] {
  const [v, s] = nextRandom(state)
  return [Math.floor(v * n), s]
}

/** Fisher–Yates 洗牌，不改動原陣列 */
export function shuffle<T>(items: readonly T[], state: RngState): [T[], RngState] {
  const out = items.slice()
  let s = state
  for (let i = out.length - 1; i > 0; i--) {
    let j: number
    ;[j, s] = nextInt(s, i + 1)
    const tmp = out[i]
    out[i] = out[j]
    out[j] = tmp
  }
  return [out, s]
}
