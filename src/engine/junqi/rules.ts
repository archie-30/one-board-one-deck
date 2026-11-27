// 軍棋（陸戰棋，兩人暗棋）。純函式，不碰畫面。
// 規則（使用者選的：陸戰棋、自己佈陣、司令陣亡亮軍旗、奪旗或對方沒子可走就贏）：
//   - 棋盤 12 列 × 5 行，每人 6 列（30 個點：25 個兵站／大本營＋5 個行營）。兩邊只在第 1、3、5 行（鐵路）接起來，第 2、4 行中間是山界。
//   - 每人 25 子：司令、軍長、師長×2、旅長×2、團長×2、營長×2、連長×3、排長×3、工兵×3、地雷×3、炸彈×2、軍旗。
//   - 佈陣：25 子擺滿自己的 25 個兵站與大本營（行營開局空著）。軍旗一定在大本營；地雷只能在最後兩列；炸彈不能在第一列。
//   - 對方的子看不到是什麼；兩子相碰由裁判比大小，只說誰贏。
//   - 走法：公路一次一格（上下左右，行營還可以斜走到旁邊的四格）；鐵路上直線不限格數（中間不能有子），工兵在鐵路上還能轉彎。
//   - 行營裡的子不能被吃。進了大本營（自己的或對方的）就不能再動；地雷、軍旗不能動。
//   - 碰子：大吃小、一樣大同歸於盡；炸彈碰到任何子同歸於盡；碰地雷的子陣亡（工兵可以挖掉地雷、炸彈跟地雷同歸於盡）；碰到軍旗就奪旗。
//     大小：司令 > 軍長 > 師長 > 旅長 > 團長 > 營長 > 連長 > 排長 > 工兵。
//   - 司令陣亡：亮出那一方的軍旗在哪。
//   - 贏：奪到對方的軍旗，或輪到對方時他沒有子能走。連續 60 步沒有碰子、或整局 600 步和棋。
//   - 時間到＝這一步跳過；佈陣時間到＝用預設陣形。可以認輸。
//
// 座標：第 r 列第 c 行是 r * 5 + c。0 號（先走）在下面（第 6～11 列，第 6 列是最前面），1 號在上面（第 0～5 列）。
// 看不到的子（電腦、連線時對方的子）rank 是 -1。碰子的結果由完整局面算（resolve），
// 只有「看得到的局面」時（連線的客戶端）由伺服器把結果一起送來（info）。
import { shuffle, type RngState } from '../common/rng'
import type { Result } from '../common/types'

export type Side = 0 | 1
export const ROWS = 12
export const COLS = 5
export const CELLS = ROWS * COLS
export const PER_SIDE = 25

// 子的種類（數字越大越強，地雷、炸彈、軍旗另外算）
export const ENGINEER = 1
export const PLATOON = 2
export const COMPANY = 3
export const BATTALION = 4
export const REGIMENT = 5
export const BRIGADE = 6
export const DIVISION = 7
export const CORPS = 8
export const COMMANDER = 9
export const BOMB = 10
export const MINE = 11
export const FLAG = 12
export const UNKNOWN = -1

/** 每人 25 子（照強到弱） */
export const ARMY: readonly number[] = [
  COMMANDER, CORPS, DIVISION, DIVISION, BRIGADE, BRIGADE, REGIMENT, REGIMENT, BATTALION, BATTALION,
  COMPANY, COMPANY, COMPANY, PLATOON, PLATOON, PLATOON, ENGINEER, ENGINEER, ENGINEER, MINE, MINE, MINE, BOMB, BOMB, FLAG,
]
/** 每種子幾個 */
export const COUNT: Record<number, number> = ARMY.reduce((o, r) => ((o[r] = (o[r] ?? 0) + 1), o), {} as Record<number, number>)

/** 連續幾步沒碰子和棋 */
export const QUIET_LIMIT = 60
export const MAX_PLIES = 600

export const cell = (r: number, c: number) => r * COLS + c
export const rowOf = (i: number) => Math.floor(i / COLS)
export const colOf = (i: number) => i % COLS
/** 轉 180 度（1 號的位置＝0 號的位置轉過去） */
export const mirror = (i: number) => CELLS - 1 - i

/** 行營 */
export const CAMPS: ReadonlySet<number> = new Set([cell(2, 1), cell(2, 3), cell(3, 2), cell(4, 1), cell(4, 3), cell(7, 1), cell(7, 3), cell(8, 2), cell(9, 1), cell(9, 3)])
/** 大本營 */
export const HQS: ReadonlySet<number> = new Set([cell(0, 1), cell(0, 3), cell(11, 1), cell(11, 3)])

/** 鐵路線（直線走；兩點相連） */
const RAIL_LINES: number[][] = [
  ...[1, 5, 6, 10].map((r) => [0, 1, 2, 3, 4].map((c) => cell(r, c))),
  ...[0, 4].map((c) => Array.from({ length: 10 }, (_, k) => cell(k + 1, c))),
  [cell(5, 2), cell(6, 2)],
]
export const RAIL: ReadonlySet<number> = new Set(RAIL_LINES.flat())
/** 鐵路上的相鄰（工兵轉彎用） */
export const RAIL_ADJ: readonly number[][] = (() => {
  const adj: number[][] = Array.from({ length: CELLS }, () => [])
  for (const line of RAIL_LINES)
    for (let k = 0; k + 1 < line.length; k++) {
      const [a, b] = [line[k], line[k + 1]]
      if (!adj[a].includes(b)) adj[a].push(b)
      if (!adj[b].includes(a)) adj[b].push(a)
    }
  return adj
})()
/** 鐵路上每個點可以往哪幾個方向一直走（每個方向是一串點，照遠近排） */
export const RAIL_RAYS: readonly number[][][] = (() => {
  const rays: number[][][] = Array.from({ length: CELLS }, () => [])
  for (const line of RAIL_LINES)
    for (let k = 0; k < line.length; k++) {
      if (k > 0) rays[line[k]].push(line.slice(0, k).reverse())
      if (k + 1 < line.length) rays[line[k]].push(line.slice(k + 1))
    }
  return rays
})()

/** 公路的相鄰（一格）：上下左右（中間第 2、4 行是山界不通），行營再加上斜的四格 */
export const ROAD_ADJ: readonly number[][] = (() => {
  const adj: number[][] = Array.from({ length: CELLS }, () => [])
  const link = (a: number, b: number) => {
    if (!adj[a].includes(b)) adj[a].push(b)
    if (!adj[b].includes(a)) adj[b].push(a)
  }
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      if (c + 1 < COLS) link(cell(r, c), cell(r, c + 1))
      if (r + 1 < ROWS && !(r === 5 && (c === 1 || c === 3))) link(cell(r, c), cell(r + 1, c))
    }
  for (const p of CAMPS) {
    const [r, c] = [rowOf(p), colOf(p)]
    for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) link(p, cell(r + dr, c + dc))
  }
  return adj
})()

/** 0 號的 25 個佈陣點（照「最前面一列先、左到右」排）；1 號的是轉過去的 */
export const HOME: readonly number[] = (() => {
  const out: number[] = []
  for (let r = 6; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (!CAMPS.has(cell(r, c))) out.push(cell(r, c))
  return out
})()
export const homeOf = (side: Side): number[] => (side === 0 ? [...HOME] : HOME.map(mirror))
/** 佈陣點是第幾列（0＝最前面那列，5＝最後一列） */
export const depthOf = (k: number) => rowOf(HOME[k]) - 6

export interface JunqiState {
  phase: 'deploy' | 'play'
  /** 每個點上是哪顆子（子的編號，0 號 0～24、1 號 25～49；-1＝空） */
  board: number[]
  /** 每顆子是什麼（-1＝看不到） */
  rank: number[]
  /** 每顆子動過沒（公開：動過的就不是地雷、軍旗） */
  moved: boolean[]
  /** 每顆子還在不在 */
  alive: boolean[]
  /** 佈好陣了沒 */
  deployed: [boolean, boolean]
  turn: Side
  status: 'playing' | 'flag' | 'stuck' | 'quiet' | 'long' | 'resigned'
  winner: Side | null
  /** 連續幾步沒碰子 */
  quiet: number
  plies: number
  /** 軍旗亮出來了沒（司令陣亡） */
  flagShown: [boolean, boolean]
  /** 碰過的子（公開：誰碰誰、結果）：電腦推測對方的子用 */
  fights: { a: number; d: number; out: Outcome }[]
  /** 上一步（畫面做動畫用） */
  last: { side: Side; from: number; to: number; out: Outcome } | null
}

/** 碰子結果（攻方的角度）：move＝走到空點；win＝吃掉；lose＝自己陣亡；tie＝同歸於盡 */
export type Outcome = 'move' | 'win' | 'lose' | 'tie'

/** 伺服器把完整局面算出來的結果送給看不到的客戶端 */
export interface MoveInfo {
  out: Outcome
  /** 亮出來的軍旗（司令陣亡）：那一點 */
  flags?: number[]
  /** 奪到的是軍旗 */
  flag?: boolean
  /** 結束了（輪到的人沒子可走、和棋）：伺服器說的 */
  end?: { status: JunqiState['status']; winner: Side | null }
}

export type JunqiAction =
  /** 佈陣：layout 是 HOME 順序每一點放什麼（連線時對方的佈陣沒有 layout） */
  | { type: 'deploy'; side: Side; layout?: number[] }
  | { type: 'move'; from: number; to: number }
  | { type: 'timeout' }
  | { type: 'resign'; side: Side }
export type JunqiError = 'over' | 'phase' | 'badLayout' | 'notYours' | 'illegal'

export const sideOfId = (id: number): Side => (id < PER_SIDE ? 0 : 1)
const other = (s: Side): Side => (s === 0 ? 1 : 0)

export function createJunqi(): JunqiState {
  return {
    phase: 'deploy',
    board: Array(CELLS).fill(-1),
    rank: Array(PER_SIDE * 2).fill(UNKNOWN),
    moved: Array(PER_SIDE * 2).fill(false),
    alive: Array(PER_SIDE * 2).fill(true),
    deployed: [false, false],
    turn: 0,
    status: 'playing',
    winner: null,
    quiet: 0,
    plies: 0,
    flagShown: [false, false],
    fights: [],
    last: null,
  }
}

/** 陣形合不合規則：25 子剛好、軍旗在大本營、地雷在最後兩列、炸彈不在第一列 */
export function layoutProblem(layout: readonly number[]): 'count' | 'flag' | 'mine' | 'bomb' | null {
  if (!Array.isArray(layout) || layout.length !== PER_SIDE) return 'count'
  const sorted = [...layout].sort((a, b) => a - b)
  const want = [...ARMY].sort((a, b) => a - b)
  if (sorted.some((r, i) => r !== want[i])) return 'count'
  for (let k = 0; k < PER_SIDE; k++) {
    const r = layout[k]
    if (r === FLAG && !HQS.has(HOME[k])) return 'flag'
    if (r === MINE && depthOf(k) < 4) return 'mine'
    if (r === BOMB && depthOf(k) === 0) return 'bomb'
  }
  return null
}

/** 預設陣形（佈陣時間到用）：軍旗在左邊大本營、旁邊三個地雷，其他照常見擺法 */
export const DEFAULT_LAYOUT: readonly number[] = [
  // 第一列
  COMPANY, BATTALION, ENGINEER, BRIGADE, COMPANY,
  // 第二列（兩個行營）
  DIVISION, PLATOON, BOMB,
  // 第三列（中間行營）
  ENGINEER, REGIMENT, BATTALION, DIVISION,
  // 第四列（兩個行營）
  COMMANDER, BOMB, CORPS,
  // 第五列
  REGIMENT, MINE, BRIGADE, ENGINEER, PLATOON,
  // 最後一列（大本營在第 2、4 個）
  MINE, FLAG, MINE, COMPANY, PLATOON,
]

/** 隨機擺一個合規則的陣形 */
export function randomLayout(rng: RngState): [number[], RngState] {
  const slots = Array.from({ length: PER_SIDE }, (_, k) => k)
  const out: number[] = Array(PER_SIDE).fill(0)
  const free = new Set(slots)
  let list: number[]
  // 軍旗：兩個大本營挑一個
  ;[list, rng] = shuffle(slots.filter((k) => HQS.has(HOME[k])), rng)
  out[list[0]] = FLAG
  free.delete(list[0])
  // 地雷：最後兩列
  ;[list, rng] = shuffle([...free].filter((k) => depthOf(k) >= 4), rng)
  for (const k of list.slice(0, 3)) {
    out[k] = MINE
    free.delete(k)
  }
  // 炸彈：不在第一列
  ;[list, rng] = shuffle([...free].filter((k) => depthOf(k) > 0), rng)
  for (const k of list.slice(0, 2)) {
    out[k] = BOMB
    free.delete(k)
  }
  // 其他隨便放
  const rest = ARMY.filter((r) => r !== FLAG && r !== MINE && r !== BOMB)
  ;[list, rng] = shuffle([...free], rng)
  list.forEach((k, i) => (out[k] = rest[i]))
  return [out, rng]
}

/** 這顆子能不能動（看不到的子當作能動） */
const canMove = (s: JunqiState, id: number, at: number) => {
  const r = s.rank[id]
  return r !== MINE && r !== FLAG && !HQS.has(at)
}

/** 這顆子從 from 能走到哪（包括碰對方的子） */
export function targetsOf(s: JunqiState, from: number): number[] {
  const id = s.board[from]
  if (id < 0 || s.phase !== 'play' || !canMove(s, id, from)) return []
  const side = sideOfId(id)
  const out = new Set<number>()
  const ok = (to: number) => {
    const t = s.board[to]
    if (t < 0) return true
    return sideOfId(t) !== side && !CAMPS.has(to)
  }
  for (const to of ROAD_ADJ[from]) if (ok(to)) out.add(to)
  if (RAIL.has(from)) {
    // 看不到的子（連線時對方的）可能是工兵：當作能轉彎（實際走法由伺服器檢查過）
    if (s.rank[id] === ENGINEER || s.rank[id] === UNKNOWN) {
      // 工兵：鐵路上可以轉彎，經過的點都要空著
      const seen = new Set([from])
      const queue = [from]
      while (queue.length) {
        const p = queue.shift()!
        for (const q of RAIL_ADJ[p]) {
          if (seen.has(q)) continue
          seen.add(q)
          if (s.board[q] < 0) {
            out.add(q)
            queue.push(q)
          } else if (ok(q)) out.add(q)
        }
      }
    } else
      for (const ray of RAIL_RAYS[from])
        for (const q of ray) {
          if (s.board[q] < 0) {
            out.add(q)
            continue
          }
          if (ok(q)) out.add(q)
          break
        }
  }
  return [...out]
}

/** side 能走的所有步 */
export function legalMoves(s: JunqiState, side: Side = s.turn): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = []
  if (s.phase !== 'play' || s.status !== 'playing') return out
  for (let p = 0; p < CELLS; p++) {
    const id = s.board[p]
    if (id < 0 || sideOfId(id) !== side) continue
    for (const to of targetsOf(s, p)) out.push({ from: p, to })
  }
  return out
}
const hasMove = (s: JunqiState, side: Side) => {
  for (let p = 0; p < CELLS; p++) {
    const id = s.board[p]
    if (id >= 0 && sideOfId(id) === side && targetsOf(s, p).length) return true
  }
  return false
}

/** 碰子（兩邊都知道是什麼）：攻方的結果 */
export function fight(a: number, d: number): Outcome {
  if (d === FLAG) return 'win'
  if (a === BOMB || d === BOMB) return 'tie'
  if (d === MINE) return a === ENGINEER ? 'win' : 'lose'
  return a > d ? 'win' : a < d ? 'lose' : 'tie'
}

/** 完整局面算這一步的結果（給伺服器送給客戶端；也是自己套用的依據） */
export function infoOf(s: JunqiState, from: number, to: number): MoveInfo {
  const a = s.board[from]
  const d = s.board[to]
  if (d < 0) return { out: 'move' }
  const out = fight(s.rank[a], s.rank[d])
  const flags: number[] = []
  const dead = out === 'win' ? [d] : out === 'lose' ? [a] : [a, d]
  for (const id of dead)
    if (s.rank[id] === COMMANDER && !s.flagShown[sideOfId(id)]) {
      const side = sideOfId(id)
      const f = s.board.findIndex((x) => x >= 0 && sideOfId(x) === side && s.rank[x] === FLAG)
      if (f >= 0) flags.push(f)
    }
  return { out, ...(flags.length ? { flags } : {}), ...(s.rank[d] === FLAG ? { flag: true } : {}) }
}

/**
 * 套用一步。看得到全部的局面（單人、伺服器）不用給 info；
 * 看不到對方的子的局面（連線的客戶端）要給伺服器送來的 info。
 */
export function applyJunqi(state: JunqiState, action: JunqiAction, info?: MoveInfo): Result<JunqiState, JunqiError> {
  if (state.status !== 'playing') return { ok: false, reason: 'over' }
  if (action.type === 'resign') return { ok: true, state: { ...state, status: 'resigned', winner: other(action.side), last: null } }
  const s: JunqiState = {
    ...state,
    board: state.board.slice(),
    rank: state.rank.slice(),
    moved: state.moved.slice(),
    alive: state.alive.slice(),
    deployed: [state.deployed[0], state.deployed[1]],
    flagShown: [state.flagShown[0], state.flagShown[1]],
  }
  const side = s.turn
  if (s.phase === 'deploy') {
    if (action.type === 'move') return { ok: false, reason: 'phase' }
    const layout = action.type === 'deploy' ? action.layout : [...DEFAULT_LAYOUT]
    if (action.type === 'deploy' && action.side !== side) return { ok: false, reason: 'notYours' }
    if (layout && layoutProblem(layout)) return { ok: false, reason: 'badLayout' }
    const home = homeOf(side)
    for (let k = 0; k < PER_SIDE; k++) {
      const id = side * PER_SIDE + k
      s.board[home[k]] = id
      s.rank[id] = layout ? layout[k] : UNKNOWN
    }
    s.deployed[side] = true
    s.turn = other(side)
    if (s.deployed[0] && s.deployed[1]) {
      s.phase = 'play'
      s.turn = 0
    }
    s.last = null
    return { ok: true, state: s }
  }
  if (action.type === 'deploy') return { ok: false, reason: 'phase' }
  if (action.type === 'timeout') {
    s.turn = other(side)
    s.plies++
    s.quiet++
    s.last = null
    return { ok: true, state: finish(s, info) }
  }
  const { from, to } = action
  const ok = (p: unknown): p is number => typeof p === 'number' && Number.isInteger(p) && p >= 0 && p < CELLS
  if (!ok(from) || !ok(to)) return { ok: false, reason: 'illegal' }
  const a = s.board[from]
  if (a < 0 || sideOfId(a) !== side) return { ok: false, reason: 'notYours' }
  if (!targetsOf(s, from).includes(to)) return { ok: false, reason: 'illegal' }
  const d = s.board[to]
  // 兩邊都看得到才自己算；不然照伺服器說的
  const known = d < 0 || (s.rank[a] !== UNKNOWN && s.rank[d] !== UNKNOWN)
  const res = known ? infoOf(s, from, to) : info
  if (!res) return { ok: false, reason: 'illegal' }
  s.moved[a] = true
  s.board[from] = -1
  if (res.out === 'move' || res.out === 'win') s.board[to] = a
  if (res.out === 'win') s.alive[d] = false
  if (res.out === 'lose') s.alive[a] = false
  if (res.out === 'tie') {
    s.alive[a] = false
    s.alive[d] = false
    s.board[to] = -1
  }
  if (d >= 0) s.fights = [...s.fights, { a, d, out: res.out }]
  // 司令陣亡：亮軍旗
  for (const f of res.flags ?? []) {
    const id = s.board[f]
    if (id < 0) continue
    s.rank[id] = FLAG
    s.flagShown[sideOfId(id)] = true
  }
  s.quiet = d >= 0 ? 0 : s.quiet + 1
  s.plies++
  s.turn = other(side)
  s.last = { side, from, to, out: res.out }
  if (res.flag || (d >= 0 && s.rank[d] === FLAG && res.out === 'win')) {
    if (d >= 0) s.rank[d] = FLAG
    return { ok: true, state: { ...s, status: 'flag', winner: side } }
  }
  return { ok: true, state: finish(s, res) }
}

/** 輪到的人沒子可走就輸；太久沒碰子、下太久和棋 */
function finish(s: JunqiState, info?: MoveInfo): JunqiState {
  if (info?.end) return { ...s, status: info.end.status, winner: info.end.winner }
  // 看不到全部的局面沒辦法判斷對方能不能動：只信伺服器說的（info.end）
  const hidden = s.rank.some((r, id) => r === UNKNOWN && s.alive[id])
  if (!hidden && !hasMove(s, s.turn)) return { ...s, status: 'stuck', winner: other(s.turn) }
  if (s.quiet >= QUIET_LIMIT) return { ...s, status: 'quiet', winner: null }
  if (s.plies >= MAX_PLIES) return { ...s, status: 'long', winner: null }
  return s
}

/** side 看得到的局面：對方的子看不到是什麼（亮出來的軍旗除外） */
export function viewFor(s: JunqiState, side: Side): JunqiState {
  return { ...s, rank: s.rank.map((r, id) => (sideOfId(id) === side || (r === FLAG && s.flagShown[sideOfId(id)]) ? r : UNKNOWN)) }
}

/** 伺服器送給客戶端的這一步結果：完整局面套用後結束了的話，附上結果 */
export function publicInfo(before: JunqiState, after: JunqiState, from: number, to: number): MoveInfo {
  const info = infoOf(before, from, to)
  return after.status !== 'playing' && after.status !== 'flag' ? { ...info, end: { status: after.status, winner: after.winner } } : info
}
