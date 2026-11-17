// 暗棋（半盤象棋）：4 × 8 的格子上，紅黑雙方各 16 顆象棋棋子全部蓋著、打亂擺好。
// 規則（台灣常見玩法，有爭議的地方已經跟使用者確認，可以在規則設定調整的寫在 BanqiOptions）：
//   - 每一步：翻開一顆蓋著的棋，或走／吃一顆自己翻開的棋。
//   - 第一個翻棋的人，翻出什麼顏色就是哪一方。
//   - 大小：帥(將) > 仕(士) > 相(象) > 俥(車) > 傌(馬) > 炮(包) > 兵(卒)；大可以吃小、一樣大可以互吃。
//     例外：兵可以吃帥，帥不能吃兵。
//   - 每顆棋只能上下左右走一格（規則設定可讓車直走多格）。
//   - 炮：走一格；吃子要隔一顆棋（翻開或蓋著都算）直線跳過去吃，被吃的不管大小都行。
//   - 一步只能吃一顆（規則設定可開「連吃」：同一顆棋吃完還能再吃就可以繼續）。
//   - 對方的棋被吃光，或輪到他時沒棋可翻也沒棋可走，就輸了。連續 50 步都沒有人吃子就和棋。
// 純函式，不碰畫面；隨機一律用可指定 seed 的亂數。
import { shuffle, seedRng } from '../common/rng'
import type { Result } from '../common/types'

export const COLS = 8
export const ROWS = 4
export const SIZE = COLS * ROWS

/** 紅方大寫（帥仕相俥傌炮兵＝K A B R N C P），黑方小寫 */
export type Piece = string
export type Color = 'r' | 'b'
/** 0 = 先動的一方，1 = 後動的一方（顏色要等第一顆翻開才知道） */
export type Seat = 0 | 1

export interface BanqiOptions {
  /** 車可以直線走多格（中間不能有棋），也可以這樣衝過去吃 */
  rookSlide: boolean
  /** 連吃：同一顆棋吃完如果還能再吃，同一步可以繼續吃 */
  chain: boolean
}
export const DEFAULT_BANQI_OPTIONS: BanqiOptions = { rookSlide: false, chain: false }

/** 連續幾步沒有人吃子就和棋 */
export const DRAW_QUIET = 50

export type BanqiStatus = 'playing' | 'wiped' | 'stuck' | 'quiet' | 'resigned'

export interface BanqiState {
  /** 每一格的棋子（null = 空格）。蓋著的棋這裡也有，只有畫面和規則看，電腦不能看 */
  board: (Piece | null)[]
  /** 這一格的棋翻開了沒 */
  up: boolean[]
  turn: Seat
  /** 每一方的顏色；第一顆翻開之前都是 null */
  colors: [Color | null, Color | null]
  /** 連續幾步沒人吃子 */
  quiet: number
  status: BanqiStatus
  winner: Seat | null
  lastMove: { from: number; to: number; flip: boolean } | null
  /** 再上一步（也就是現在輪到的這一方自己上一步）：電腦用來避免來回晃 */
  before?: { from: number; to: number; flip: boolean } | null
  /** 被吃掉的棋（照被吃的順序） */
  captured: Piece[]
  plies: number
  options: BanqiOptions
  /** 連吃進行中：這顆棋還要決定繼續吃或結束（沒有就是 -1） */
  chainAt: number
}

export type BanqiAction =
  | { type: 'flip'; at: number }
  | { type: 'move'; from: number; to: number }
  /** 連吃時不再繼續吃，換對方 */
  | { type: 'end' }
  | { type: 'resign'; seat: Seat }
  /** 時間到被跳過：這一步不動，換對方 */
  | { type: 'timeout' }

export type BanqiError = 'over' | 'notHidden' | 'notYours' | 'cantMove' | 'mustContinue' | 'noChain'

export const PIECES_PER_SIDE = ['K', 'A', 'A', 'B', 'B', 'R', 'R', 'N', 'N', 'C', 'C', 'P', 'P', 'P', 'P', 'P'] as const

/** 大小：帥 7 > 仕 6 > 相 5 > 俥 4 > 傌 3 > 炮 2 > 兵 1 */
export const RANK: Record<string, number> = { K: 7, A: 6, B: 5, R: 4, N: 3, C: 2, P: 1 }

export const colorOf = (p: Piece): Color => (p === p.toUpperCase() ? 'r' : 'b')
export const kindOf = (p: Piece): string => p.toUpperCase()
export const rowOf = (i: number) => Math.floor(i / COLS)
export const colOf = (i: number) => i % COLS
const other = (s: Seat): Seat => (s === 0 ? 1 : 0)

/** 整副 32 顆棋（紅 16、黑 16） */
export const ALL_PIECES: Piece[] = [...PIECES_PER_SIDE, ...PIECES_PER_SIDE.map((p) => p.toLowerCase())]

/** 開局：32 顆棋打亂，全部蓋著擺滿（同一個 seed 擺法一樣） */
export function dealBanqi(seed: number, options: Partial<BanqiOptions> = {}): BanqiState {
  const [board] = shuffle(ALL_PIECES, seedRng(seed))
  return createBanqi(board, options)
}

/** 指定擺法開局（測試、教學用）；up 沒給就全部蓋著 */
export function createBanqi(board: (Piece | null)[], options: Partial<BanqiOptions> = {}, up?: boolean[]): BanqiState {
  return {
    board: board.slice(),
    up: up ? up.slice() : board.map(() => false),
    turn: 0,
    colors: [null, null],
    quiet: 0,
    status: 'playing',
    winner: null,
    lastMove: null,
    captured: [],
    plies: 0,
    options: { ...DEFAULT_BANQI_OPTIONS, ...options },
    chainAt: -1,
  }
}

/** 這個顏色是誰的 */
export const seatOfColor = (s: BanqiState, c: Color): Seat | null => (s.colors[0] === c ? 0 : s.colors[1] === c ? 1 : null)

/** 攻擊者能不能吃掉目標（只看大小，不看位置）；炮另外處理 */
export function outranks(attacker: Piece, target: Piece): boolean {
  const a = kindOf(attacker)
  const t = kindOf(target)
  if (a === 'P' && t === 'K') return true
  if (a === 'K' && t === 'P') return false
  return RANK[a] >= RANK[t]
}

const DIRS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const

const at = (r: number, c: number) => (r >= 0 && r < ROWS && c >= 0 && c < COLS ? r * COLS + c : -1)

/** 從 from 出發，這顆翻開的棋可以走到／吃到哪些格（不檢查輪到誰） */
export function targetsFrom(s: BanqiState, from: number): number[] {
  const p = s.board[from]
  if (!p || !s.up[from]) return []
  const me = colorOf(p)
  const out: number[] = []
  const r0 = rowOf(from)
  const c0 = colOf(from)
  const canEat = (to: number) => {
    const t = s.board[to]
    return !!t && s.up[to] && colorOf(t) !== me
  }
  const kind = kindOf(p)
  for (const [dr, dc] of DIRS) {
    if (kind === 'C') {
      // 炮：走一格到空格；吃子要隔一顆棋跳過去
      const one = at(r0 + dr, c0 + dc)
      if (one >= 0 && !s.board[one]) out.push(one)
      let screen = false
      for (let k = 1; ; k++) {
        const i = at(r0 + dr * k, c0 + dc * k)
        if (i < 0) break
        if (!s.board[i]) continue
        if (!screen) {
          screen = true
          continue
        }
        if (canEat(i)) out.push(i)
        break
      }
      continue
    }
    const steps = kind === 'R' && s.options.rookSlide ? 8 : 1
    for (let k = 1; k <= steps; k++) {
      const i = at(r0 + dr * k, c0 + dc * k)
      if (i < 0) break
      if (!s.board[i]) {
        out.push(i)
        continue
      }
      if (canEat(i) && outranks(p, s.board[i]!)) out.push(i)
      break
    }
  }
  return out
}

/** 這一格是吃子嗎（目標有對方翻開的棋） */
export const isCapture = (s: BanqiState, to: number) => !!s.board[to]

/** 連吃時：這顆棋還能吃的格子 */
const chainTargets = (s: BanqiState, from: number) => targetsFrom(s, from).filter((to) => isCapture(s, to))

/** 輪到的人所有能做的動作（翻棋、走、吃；連吃中只能繼續吃或結束） */
export function legalActions(s: BanqiState): BanqiAction[] {
  if (s.status !== 'playing') return []
  if (s.chainAt >= 0) return [...chainTargets(s, s.chainAt).map((to) => ({ type: 'move' as const, from: s.chainAt, to })), { type: 'end' as const }]
  const out: BanqiAction[] = []
  const color = s.colors[s.turn]
  for (let i = 0; i < SIZE; i++) {
    const p = s.board[i]
    if (!p) continue
    if (!s.up[i]) out.push({ type: 'flip', at: i })
    else if (color && colorOf(p) === color) for (const to of targetsFrom(s, i)) out.push({ type: 'move', from: i, to })
  }
  return out
}

/** 某一方還剩幾顆棋（翻開＋蓋著） */
export const piecesLeft = (s: BanqiState, c: Color) => s.board.filter((p) => p && colorOf(p) === c).length

/** 換人之後檢查輸贏：對方的棋被吃光、或沒得動，就輸了；50 步沒吃子和棋 */
function settle(s: BanqiState): BanqiState {
  const nextColor = s.colors[s.turn]
  if (nextColor && piecesLeft(s, nextColor) === 0) return { ...s, status: 'wiped', winner: other(s.turn) }
  if (s.colors[0] && legalActions(s).length === 0) return { ...s, status: 'stuck', winner: other(s.turn) }
  if (s.quiet >= DRAW_QUIET) return { ...s, status: 'quiet', winner: null }
  return s
}

export function applyBanqi(s: BanqiState, a: BanqiAction): Result<BanqiState, BanqiError> {
  if (s.status !== 'playing') return { ok: false, reason: 'over' }
  if (a.type === 'resign') return { ok: true, state: { ...s, status: 'resigned', winner: other(a.seat), chainAt: -1 } }
  if (a.type === 'timeout' || a.type === 'end') {
    if (a.type === 'end' && s.chainAt < 0) return { ok: false, reason: 'noChain' }
    return { ok: true, state: settle({ ...s, turn: other(s.turn), chainAt: -1, quiet: a.type === 'timeout' ? s.quiet + 1 : s.quiet, plies: a.type === 'timeout' ? s.plies + 1 : s.plies }) }
  }
  if (a.type === 'flip') {
    if (s.chainAt >= 0) return { ok: false, reason: 'mustContinue' }
    if (!s.board[a.at] || s.up[a.at]) return { ok: false, reason: 'notHidden' }
    const up = s.up.slice()
    up[a.at] = true
    const colors: [Color | null, Color | null] = s.colors[0] ? s.colors : s.turn === 0 ? [colorOf(s.board[a.at]!), colorOf(s.board[a.at]!) === 'r' ? 'b' : 'r'] : [colorOf(s.board[a.at]!) === 'r' ? 'b' : 'r', colorOf(s.board[a.at]!)]
    return { ok: true, state: settle({ ...s, up, colors, turn: other(s.turn), quiet: s.quiet + 1, plies: s.plies + 1, lastMove: { from: a.at, to: a.at, flip: true }, before: s.lastMove }) }
  }
  // 走或吃
  const p = s.board[a.from]
  const color = s.colors[s.turn]
  if (s.chainAt >= 0 && a.from !== s.chainAt) return { ok: false, reason: 'mustContinue' }
  if (!p || !s.up[a.from] || !color || colorOf(p) !== color) return { ok: false, reason: 'notYours' }
  const allowed = s.chainAt >= 0 ? chainTargets(s, a.from) : targetsFrom(s, a.from)
  if (!allowed.includes(a.to)) return { ok: false, reason: 'cantMove' }
  const took = s.board[a.to]
  const board = s.board.slice()
  const up = s.up.slice()
  board[a.to] = p
  up[a.to] = true
  board[a.from] = null
  up[a.from] = false
  const next: BanqiState = {
    ...s,
    board,
    up,
    captured: took ? [...s.captured, took] : s.captured,
    quiet: took ? 0 : s.quiet + 1,
    plies: s.chainAt >= 0 ? s.plies : s.plies + 1,
    lastMove: { from: a.from, to: a.to, flip: false },
    before: s.lastMove,
    chainAt: -1,
  }
  // 連吃：吃完還能再吃就等這個人決定（對方被吃光就直接結束）
  if (took && s.options.chain) {
    const enemy = color === 'r' ? 'b' : 'r'
    if (piecesLeft(next, enemy) > 0 && chainTargets(next, a.to).length) return { ok: true, state: { ...next, chainAt: a.to } }
  }
  return { ok: true, state: settle({ ...next, turn: other(s.turn) }) }
}
