// 星形跳棋（彈珠跳棋）：六角星棋盤 121 格，3 個人各從一個角出發（隔一個角坐），把 10 顆棋子全部移到正對面的角。
// 規則（跟使用者確認過）：
//   - 每一步：走到旁邊的空格（六個方向），或「跳」——可以連跳好幾次，跳完停在哪裡都行（不能跳回同一步走過的格子）。
//   - 遠跳（規則設定，預設開）：同一直線上，中間那顆棋子兩邊的空格一樣多就能跳過去（對稱跳）；
//     關掉就只能跳過緊鄰的一顆、落在它後面的空格。
//   - 到齊：目的地的 10 格全部有棋子，而且至少一顆是自己的（防止別人一直佔著你的目的地不走）。
//   - 玩到分出名次：第一個人到齊後，剩下的人繼續下，直到第二個人也到齊（第三名就是最後一個）。
//     到齊、認輸的人之後輪到他就跳過。認輸的人排最後。
//   - 下太久（900 步）還沒分出來：照還差多遠排名次。
// 座位：0 號在下面、1 號左上、2 號右上，照 0 → 1 → 2 輪流（順時針）。純函式，不碰畫面。
import type { Result } from '../common/types'

export const PLAYERS = 3

/** 一格的座標（立方座標 q + r + s = 0；s 不存） */
export interface Hex {
  q: number
  r: number
}
export const sOf = (h: Hex) => -h.q - h.r

/** 121 格：兩個邊長 13 的大三角形疊起來（中間 61 格的六角形 + 六個 10 格的角） */
export const CELLS: Hex[] = (() => {
  const out: Hex[] = []
  for (let r = -8; r <= 8; r++)
    for (let q = -8; q <= 8; q++) {
      const s = -q - r
      const up = q >= -4 && r >= -4 && s >= -4
      const down = q <= 4 && r <= 4 && s <= 4
      if (up || down) out.push({ q, r })
    }
  return out
})()
const INDEX = new Map(CELLS.map((h, i) => [`${h.q},${h.r}`, i]))
export const cellAt = (q: number, r: number): number => INDEX.get(`${q},${r}`) ?? -1

/** 六個方向 */
export const DIRS: readonly [number, number][] = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
]

/** 六個角：r+ 下、s+ 左上、q+ 右上、r- 上、s- 右下、q- 左下 */
export type Corner = 'r+' | 'r-' | 'q+' | 'q-' | 's+' | 's-'
const inCorner = (h: Hex, c: Corner): boolean => {
  const v = c[0] === 'q' ? h.q : c[0] === 'r' ? h.r : sOf(h)
  return c[1] === '+' ? v > 4 : v < -4
}
export const CORNER_CELLS: Record<Corner, number[]> = Object.fromEntries(
  (['r+', 'r-', 'q+', 'q-', 's+', 's-'] as Corner[]).map((c) => [c, CELLS.map((h, i) => (inCorner(h, c) ? i : -1)).filter((i) => i >= 0)]),
) as Record<Corner, number[]>
export const opposite = (c: Corner): Corner => (c[0] + (c[1] === '+' ? '-' : '+')) as Corner
/** 各座位的出發角（隔一個角坐） */
export const HOMES: readonly Corner[] = ['r+', 's+', 'q+']
export const targetOf = (seat: number): Corner => opposite(HOMES[seat])

export const hexDistance = (a: Hex, b: Hex) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(sOf(a) - sOf(b))) / 2
/** 角的尖端（離中心最遠的那一格） */
export const APEX: Record<Corner, number> = Object.fromEntries(
  (Object.keys(CORNER_CELLS) as Corner[]).map((c) => [c, CORNER_CELLS[c].reduce((best, i) => (hexDistance(CELLS[i], { q: 0, r: 0 }) > hexDistance(CELLS[best], { q: 0, r: 0 }) ? i : best))]),
) as Record<Corner, number>

export interface StarOptions {
  /** 遠跳（對稱跳）：中間那顆兩邊的空格一樣多就能跳過去 */
  longJump: boolean
}
export const DEFAULT_STAR_OPTIONS: StarOptions = { longJump: true }

/** 下太久還沒分出名次就照還差多遠排 */
export const MAX_PLIES = 900

export interface StarMove {
  /** 起點、每一次落點（走一格就是兩格；連跳有好幾個落點） */
  path: number[]
}

export interface StarState {
  /** 每一格：0 空、1～3 是座位 0～2 的棋子 */
  board: number[]
  turn: number
  /** 到齊的順序（第 1 名、第 2 名…）；結束時三個人都在裡面 */
  out: number[]
  /** 認輸的人 */
  gaveUp: number[]
  over: boolean
  plies: number
  last: StarMove | null
  options: StarOptions
}

export type StarAction = { type: 'move'; path: number[] } | { type: 'timeout' } | { type: 'resign'; seat: number }
export type StarError = 'over' | 'illegal'

/** 開局；first：誰先走（單人時隨機，連線時 0 號） */
export function createStar(options: Partial<StarOptions> = {}, first = 0): StarState {
  const board = Array<number>(CELLS.length).fill(0)
  HOMES.forEach((c, seat) => CORNER_CELLS[c].forEach((i) => (board[i] = seat + 1)))
  return { board, turn: first, out: [], gaveUp: [], over: false, plies: 0, last: null, options: { ...DEFAULT_STAR_OPTIONS, ...options } }
}

const step = (i: number, d: number, k = 1) => cellAt(CELLS[i].q + DIRS[d][0] * k, CELLS[i].r + DIRS[d][1] * k)

/** 從 i 跳一次能落在哪些格（from 這一格當作空的） */
export function jumpsFrom(board: readonly number[], i: number, from: number, long: boolean): number[] {
  const out: number[] = []
  const empty = (c: number) => c >= 0 && (c === from || board[c] === 0)
  for (let d = 0; d < 6; d++) {
    if (!long) {
      const mid = step(i, d)
      const land = step(i, d, 2)
      if (mid >= 0 && mid !== from && board[mid] && land >= 0 && empty(land)) out.push(land)
      continue
    }
    // 遠跳：往這個方向找第一顆棋子（中間都是空格），再看對面一樣遠的地方能不能落
    let k = 1
    let c = step(i, d, k)
    while (c >= 0 && empty(c)) c = step(i, d, ++k)
    if (c < 0) continue
    let ok = true
    for (let j = k + 1; j < 2 * k; j++) {
      const e = step(i, d, j)
      if (!empty(e)) {
        ok = false
        break
      }
    }
    const land = step(i, d, 2 * k)
    if (ok && land >= 0 && empty(land)) out.push(land)
  }
  return out
}

/**
 * 一步一步跳的時候：彈珠從 from 出發、已經走了 path（path[0] = from），下一格能去哪。
 * 還沒動：旁邊的空格＋跳一次的落點；跳過了：只能再跳（不能回到走過的格子）；走了一格：不能再動。
 */
export function nextHops(s: StarState, path: readonly number[]): number[] {
  const from = path[0]
  const at = path[path.length - 1]
  const jumps = jumpsFrom(s.board, at, from, s.options.longJump).filter((c) => !path.includes(c))
  if (path.length === 1) {
    const steps: number[] = []
    for (let d = 0; d < 6; d++) {
      const n = step(from, d)
      if (n >= 0 && s.board[n] === 0) steps.push(n)
    }
    return [...steps, ...jumps.filter((c) => !steps.includes(c))]
  }
  // 走了一格（不是跳）：這一步只能停在那裡
  if (path.length === 2 && isStep(path[0], path[1])) return []
  return jumps
}
const isStep = (a: number, b: number) => hexDistance(CELLS[a], CELLS[b]) === 1

/** 這條路線合不合法：走一格，或一路跳（每一跳都合規則、不回到走過的格子） */
export function validPath(s: StarState, path: readonly number[]): boolean {
  if (path.length < 2 || s.board[path[0]] !== s.turn + 1) return false
  if (new Set(path).size !== path.length) return false
  if (path.length === 2 && isStep(path[0], path[1])) return s.board[path[1]] === 0
  for (let k = 1; k < path.length; k++) if (!jumpsFrom(s.board, path[k - 1], path[0], s.options.longJump).includes(path[k])) return false
  return true
}

/** 一顆棋子能走的所有步（走一格、連跳停在任一個落點） */
export function movesFrom(s: StarState, from: number): StarMove[] {
  const out: StarMove[] = []
  for (let d = 0; d < 6; d++) {
    const n = step(from, d)
    if (n >= 0 && s.board[n] === 0) out.push({ path: [from, n] })
  }
  // 連跳：走過的落點不再回去
  const seen = new Set([from])
  const queue: number[][] = [[from]]
  while (queue.length) {
    const path = queue.shift()!
    for (const land of jumpsFrom(s.board, path[path.length - 1], from, s.options.longJump)) {
      if (seen.has(land)) continue
      seen.add(land)
      const next = [...path, land]
      out.push({ path: next })
      queue.push(next)
    }
  }
  return out
}

/** 輪到的人所有能走的步 */
export function legalMoves(s: StarState): StarMove[] {
  if (s.over) return []
  const me = s.turn + 1
  const out: StarMove[] = []
  s.board.forEach((v, i) => v === me && out.push(...movesFrom(s, i)))
  return out
}

/** 這個人到齊了沒：目的地 10 格都有棋子，而且至少一顆是自己的 */
export function arrived(board: readonly number[], seat: number): boolean {
  const cells = CORNER_CELLS[targetOf(seat)]
  return cells.every((i) => board[i] !== 0) && cells.some((i) => board[i] === seat + 1)
}

/** 這個人還差多遠：每顆棋子到目的地尖端的距離加起來（到齊時是 20） */
export function remaining(board: readonly number[], seat: number): number {
  const apex = CELLS[APEX[targetOf(seat)]]
  let sum = 0
  board.forEach((v, i) => v === seat + 1 && (sum += hexDistance(CELLS[i], apex)))
  return sum
}

const active = (s: StarState, seat: number) => !s.out.includes(seat) && !s.gaveUp.includes(seat)

/** 走完一步：記下誰到齊、換到下一個還在下的人、看有沒有結束 */
function settle(s: StarState, advance = true): StarState {
  const out = s.out.slice()
  for (let seat = 0; seat < PLAYERS; seat++) if (active({ ...s, out }, seat) && arrived(s.board, seat)) out.push(seat)
  let next = { ...s, out }
  const left = [0, 1, 2].filter((p) => active(next, p))
  // 只剩一個人（或下太久）：結束，排好名次
  if (left.length <= 1 || next.plies >= MAX_PLIES) {
    const rest = left.sort((a, b) => remaining(s.board, a) - remaining(s.board, b))
    return { ...next, out: [...out, ...rest, ...next.gaveUp.slice().reverse()], over: true }
  }
  // 換到下一個還在下的人（不是輪到的人認輸時，還是輪到原本那個人）
  let turn = next.turn
  if (!advance && active(next, turn)) return next
  for (let k = 1; k <= PLAYERS; k++) {
    const p = (s.turn + k) % PLAYERS
    if (active(next, p)) {
      turn = p
      break
    }
  }
  next = { ...next, turn }
  return next
}

export function applyStar(s: StarState, a: StarAction): Result<StarState, StarError> {
  if (s.over) return { ok: false, reason: 'over' }
  if (a.type === 'resign') {
    if (!active(s, a.seat)) return { ok: false, reason: 'illegal' }
    return { ok: true, state: settle({ ...s, gaveUp: [...s.gaveUp, a.seat] }, a.seat === s.turn) }
  }
  if (a.type === 'timeout') return { ok: true, state: settle({ ...s, plies: s.plies + 1, last: null }) }
  if (a.path.length < 2 || s.board[a.path[0]] !== s.turn + 1) return { ok: false, reason: 'illegal' }
  // 任何一條合規則的路線都行（一步一步跳的人不一定走最短的那條）
  if (!validPath(s, a.path)) return { ok: false, reason: 'illegal' }
  const move: StarMove = { path: a.path.slice() }
  const board = s.board.slice()
  board[move.path[move.path.length - 1]] = board[move.path[0]]
  board[move.path[0]] = 0
  return { ok: true, state: settle({ ...s, board, plies: s.plies + 1, last: move }) }
}
