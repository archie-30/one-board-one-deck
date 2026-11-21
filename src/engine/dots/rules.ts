// 點格棋（Dots and Boxes，雙人）。純函式，不碰畫面。
// 規則（正式規則）：
//   - 棋盤 n × n 格（(n+1) × (n+1) 個點）；難度決定大小：低 4、中 5、高 6。
//   - 兩人輪流在相鄰兩點之間畫一條線（橫或直）。
//   - 畫下的線剛好圍住一格（四邊都畫了）就拿到那一格，而且要再畫一條；一次圍住兩格就拿兩格，一樣再畫一條。
//   - 沒圍到格子就換對方。
//   - 線全部畫完就結束，格子多的人贏；一樣多和局（4 × 4、6 × 6 會發生）。
//   - 時間到＝這一手跳過、換對方。可以認輸。
// 線的編號：先是橫線（第 r 排點、從第 c 個點往右，r = 0～n、c = 0～n-1，編號 r × n + c），
//   再來是直線（第 r 排點往下、第 c 個點，r = 0～n-1、c = 0～n，編號 H + r × (n+1) + c，H = (n+1) × n）。
// 格子編號：第 r 列第 c 行＝r × n + c。
import type { Result } from '../common/types'

export type Side = 0 | 1
export const SIZES = { low: 4, mid: 5, high: 6 } as const
export const sizeOf = (level: unknown): number => SIZES[(level as keyof typeof SIZES) in SIZES ? (level as keyof typeof SIZES) : 'mid']

export interface DotsState {
  n: number
  /** 每一條線：0＝還沒畫，1＝0 號畫的，2＝1 號畫的 */
  lines: number[]
  /** 每一格：-1＝還沒圍住，0／1＝誰的 */
  boxes: number[]
  score: [number, number]
  turn: Side
  status: 'playing' | 'done' | 'resigned'
  /** 贏家；和局是 null */
  winner: Side | null
  plies: number
  /** 上一步（畫面做動畫用）：誰畫了哪條線、圍到哪幾格；時間到跳過時 line 是 -1 */
  last: { side: Side; line: number; boxes: number[] } | null
}

export type DotsAction = { type: 'line'; line: number } | { type: 'timeout' } | { type: 'resign'; side: Side }
export type DotsError = 'over' | 'illegal' | 'taken'

export const hCount = (n: number) => (n + 1) * n
export const lineCount = (n: number) => 2 * n * (n + 1)
export const isH = (n: number, line: number) => line < hCount(n)
const other = (s: Side): Side => (s === 0 ? 1 : 0)

export function createDots(n: number): DotsState {
  return { n, lines: Array(lineCount(n)).fill(0), boxes: Array(n * n).fill(-1), score: [0, 0], turn: 0, status: 'playing', winner: null, plies: 0, last: null }
}

/** 一格的四條邊：上、下、左、右 */
export function edgesOf(n: number, box: number): [number, number, number, number] {
  const r = Math.floor(box / n)
  const c = box % n
  const H = hCount(n)
  return [r * n + c, (r + 1) * n + c, H + r * (n + 1) + c, H + r * (n + 1) + c + 1]
}

/** 這條線旁邊的格子（一或兩格） */
export function boxesOf(n: number, line: number): number[] {
  const out: number[] = []
  if (isH(n, line)) {
    const r = Math.floor(line / n)
    const c = line % n
    if (r > 0) out.push((r - 1) * n + c)
    if (r < n) out.push(r * n + c)
  } else {
    const k = line - hCount(n)
    const r = Math.floor(k / (n + 1))
    const c = k % (n + 1)
    if (c > 0) out.push(r * n + c - 1)
    if (c < n) out.push(r * n + c)
  }
  return out
}

/** 線的兩個端點（點的編號＝列 × (n+1) + 行），畫面用 */
export function endsOf(n: number, line: number): [number, number] {
  if (isH(n, line)) {
    const r = Math.floor(line / n)
    const c = line % n
    return [r * (n + 1) + c, r * (n + 1) + c + 1]
  }
  const k = line - hCount(n)
  const r = Math.floor(k / (n + 1))
  const c = k % (n + 1)
  return [r * (n + 1) + c, (r + 1) * (n + 1) + c]
}

/** 這一格已經畫了幾條邊 */
export const sidesDrawn = (s: Pick<DotsState, 'n' | 'lines'>, box: number) => edgesOf(s.n, box).filter((e) => s.lines[e]).length

/** 還沒畫的線 */
export const openLines = (s: Pick<DotsState, 'lines'>): number[] => s.lines.flatMap((v, i) => (v ? [] : [i]))

function finish(s: DotsState): DotsState {
  if (s.lines.some((v) => !v)) return s
  const [a, b] = s.score
  return { ...s, status: 'done', winner: a === b ? null : a > b ? 0 : 1 }
}

export function applyDots(state: DotsState, action: DotsAction): Result<DotsState, DotsError> {
  if (state.status !== 'playing') return { ok: false, reason: 'over' }
  if (action.type === 'resign') return { ok: true, state: { ...state, status: 'resigned', winner: other(action.side), last: null } }
  if (action.type === 'timeout') return { ok: true, state: { ...state, turn: other(state.turn), plies: state.plies + 1, last: { side: state.turn, line: -1, boxes: [] } } }
  const line = action.line
  if (!Number.isInteger(line) || line < 0 || line >= state.lines.length) return { ok: false, reason: 'illegal' }
  if (state.lines[line]) return { ok: false, reason: 'taken' }
  const side = state.turn
  const lines = state.lines.slice()
  lines[line] = side + 1
  const boxes = state.boxes.slice()
  const got: number[] = []
  for (const b of boxesOf(state.n, line)) {
    if (boxes[b] < 0 && edgesOf(state.n, b).every((e) => lines[e])) {
      boxes[b] = side
      got.push(b)
    }
  }
  const score: [number, number] = [...state.score]
  score[side] += got.length
  const s: DotsState = { ...state, lines, boxes, score, turn: got.length ? side : other(side), plies: state.plies + 1, last: { side, line, boxes: got } }
  return { ok: true, state: finish(s) }
}

/** 畫了會不會圍住格子 */
export const captures = (s: Pick<DotsState, 'n' | 'lines'>, line: number) => boxesOf(s.n, line).some((b) => sidesDrawn(s, b) === 3)
/** 安全的線：畫了不會讓任何一格變成三邊（不送格子給對方） */
export const isSafe = (s: Pick<DotsState, 'n' | 'lines'>, line: number) => boxesOf(s.n, line).every((b) => sidesDrawn(s, b) < 2)
