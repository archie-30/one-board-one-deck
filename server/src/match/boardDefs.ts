// 棋盤類在伺服器上怎麼跑（五子棋、圍棋、黑白棋、西洋棋、象棋、暗棋、西洋跳棋、步步為營、點格棋；星形跳棋是 3 人、不猜拳）。
// 都是兩個人：開局先猜拳（rps），贏的人先走。引擎的座位：0 = 先走的那一方（黑棋／白棋／紅方），1 = 後走。
// 除了暗棋（蓋著的棋），其他都是完全公開的，大家看到的都一樣。
import { chooseBanqiAction } from '../../../src/engine/banqi/ai'
import { applyBanqi, dealBanqi, type BanqiAction, type BanqiState } from '../../../src/engine/banqi/rules'
import { chooseCheckersMove } from '../../../src/engine/checkers/ai'
import { applyCheckers, createCheckers, type CheckersAction, type CheckersState } from '../../../src/engine/checkers/rules'
import { chooseChessMove } from '../../../src/engine/chess/ai'
import { applyChess, createChess, type ChessAction, type ChessState, type Promo } from '../../../src/engine/chess/rules'
import { asCardLevel, asLevel, banqiAt, checkersAt, chessAt, extraThink, gomokuAt, goAt, othelloAt, quoridorAt, starAt } from '../../../src/engine/common/difficulty'
import { PERSONAS } from '../../../src/engine/common/personas'
import { chooseGoMove } from '../../../src/engine/go/ai'
import { estimateDead } from '../../../src/engine/go/playout'
import { applyGo, createGo, type GoAction, type GoState } from '../../../src/engine/go/rules'
import { chooseGomokuMove } from '../../../src/engine/gomoku/ai'
import { createGomoku, placeStone, skipTurn, type GomokuState } from '../../../src/engine/gomoku/rules'
import { chooseOthelloMove } from '../../../src/engine/othello/ai'
import { applyOthello, createOthello, type OthelloAction, type OthelloState } from '../../../src/engine/othello/rules'
import { chooseDotsAction } from '../../../src/engine/dots/ai'
import { applyDots, createDots, lineCount, sizeOf, type DotsAction, type DotsState } from '../../../src/engine/dots/rules'
import { chooseQuoridorAction } from '../../../src/engine/quoridor/ai'
import { applyQuoridor, createQuoridor, W as QW, type QuoridorAction, type QuoridorState } from '../../../src/engine/quoridor/rules'
import { chooseStarMove } from '../../../src/engine/starcheckers/ai'
import { applyStar, createStar, type StarAction, type StarState } from '../../../src/engine/starcheckers/rules'
import { chooseXiangqiMove } from '../../../src/engine/xiangqi/ai'
import { applyXiangqi, createXiangqi, type XAction, type XiangqiState } from '../../../src/engine/xiangqi/rules'
import { TURN_SECONDS } from '../../../src/data/timer'
import type { MatchDef, Options } from './defs'

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const isIdx = (v: unknown, max: number) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < max
const unwrap = <S>(r: { ok: true; state: S } | { ok: false }): S | null => (r.ok ? r.state : null)
const level = (o: Options) => asLevel(o.difficulty)
const board = { seats: 2, seconds: TURN_SECONDS.board, rps: true }

// ── 五子棋 ──
type GomokuAct = { type: 'place'; player: number; index: number } | { type: 'timeout'; player: number }
const gomoku: MatchDef<GomokuState, GomokuAct> = {
  ...board,
  undo: true,
  deal: (_seed, o) => createGomoku({ ...(typeof o.forbidden === 'boolean' ? { forbidden: o.forbidden } : {}), ...(typeof o.overlineWins === 'boolean' ? { overlineWins: o.overlineWins } : {}) }),
  apply: (s, a) => {
    if (a.type === 'timeout') return skipTurn(s)
    return unwrap(placeStone(s, a.index))
  },
  turn: (s) => (s.winner ? -1 : s.turn - 1),
  parse: (raw, side) => (isObj(raw) && raw.type === 'place' && isIdx(raw.index, 15 * 15) ? { type: 'place', player: side, index: raw.index as number } : null),
  bot(s, id, o, rng) {
    let i: number
    ;[i, rng] = chooseGomokuMove(s, gomokuAt(PERSONAS[id].gomoku, level(o), id), rng)
    return [i >= 0 ? { type: 'place', player: s.turn - 1, index: i } : { type: 'timeout', player: s.turn - 1 }, rng]
  },
  think(_s, id, o, r) {
    const lv = level(o)
    const st = gomokuAt(PERSONAS[id].gomoku, lv, id)
    return 900 + (1 - st.noise) * 700 + extraThink(lv) + (lv === 'master' ? 500 : 0) + r * 600
  },
  timeout: (side) => ({ type: 'timeout', player: side }),
  render: (_b, _a, a) => ({ pub: a }),
  start: (s) => s,
  reveal: (s) => s,
}

// ── 圍棋 ──
type GoAct = GoAction & { player: number }
const go: MatchDef<GoState, GoAct> = {
  ...board,
  undo: true,
  deal: (_seed, o) => createGo({ size: o.size === '9' ? 9 : o.size === '13' ? 13 : 19 }),
  apply: (s, a) => unwrap(applyGo(s, a)),
  turn: (s) => (s.phase === 'over' ? -1 : s.turn - 1),
  parse(raw, side) {
    if (!isObj(raw)) return null
    if (raw.type === 'pass') return { type: 'pass', player: side }
    if (raw.type === 'play' && typeof raw.index === 'number' && isIdx(raw.index, 19 * 19)) return { type: 'play', index: raw.index, player: side }
    return null
  },
  bot(s, id, o, rng) {
    let a: GoAction
    ;[a, rng] = chooseGoMove(s, goAt(PERSONAS[id].go, level(o), id), rng)
    return [{ ...a, player: s.turn - 1 }, rng]
  },
  think: (_s, id, o, r) => 650 + goAt(PERSONAS[id].go, level(o), id).skill * 500 + extraThink(level(o)) + r * 500,
  // 時間到＝虛手
  timeout: (side) => ({ type: 'pass', player: side }),
  render: (_b, _a, a) => ({ pub: a }),
  start: (s) => s,
  // 雙方都虛手：照電腦判斷的死活直接結算
  reveal: (s, _s0, rng) => ({ state: s, dead: s.resigned ? [] : estimateDead(s, rng)[0] }),
  resign: (s, side) => unwrap(applyGo({ ...s, turn: (side + 1) as 1 | 2 }, { type: 'resign' })),
}

// ── 黑白棋 ──
type OthelloAct = OthelloAction & { player: number }
const othello: MatchDef<OthelloState, OthelloAct> = {
  ...board,
  undo: true,
  deal: () => createOthello(),
  apply: (s, a) => unwrap(applyOthello(s, a)),
  turn: (s) => (s.over ? -1 : s.turn - 1),
  parse: (raw, side) => (isObj(raw) && raw.type === 'play' && isIdx(raw.index, 64) ? { type: 'play', index: raw.index as number, player: side } : null),
  bot(s, id, o, rng) {
    let i: number
    ;[i, rng] = chooseOthelloMove(s, othelloAt(PERSONAS[id].othello, level(o), id), rng)
    return [i >= 0 ? { type: 'play', index: i, player: s.turn - 1 } : { type: 'timeout', player: s.turn - 1 }, rng]
  },
  think: (_s, id, o, r) => 800 + othelloAt(PERSONAS[id].othello, level(o), id).depth * 150 + extraThink(level(o)) + r * 500,
  timeout: (side) => ({ type: 'timeout', player: side }),
  render: (_b, _a, a) => ({ pub: a }),
  start: (s) => s,
  reveal: (s) => s,
}

// ── 西洋棋 ──
type ChessAct = ChessAction & { player: number }
const PROMOS: readonly string[] = ['Q', 'R', 'B', 'N']
const chess: MatchDef<ChessState, ChessAct> = {
  ...board,
  undo: true,
  deal: () => createChess(),
  apply: (s, a) => unwrap(applyChess(s, a)),
  turn: (s) => (s.status !== 'playing' ? -1 : s.turn === 'w' ? 0 : 1),
  parse(raw, side) {
    if (!isObj(raw) || raw.type !== 'move' || !isObj(raw.move)) return null
    const m = raw.move
    if (!isIdx(m.from, 64) || !isIdx(m.to, 64) || (m.promo !== undefined && !PROMOS.includes(m.promo as string))) return null
    return { type: 'move', move: { from: m.from as number, to: m.to as number, ...(m.promo ? { promo: m.promo as Promo } : {}) }, player: side }
  },
  bot(s, id, o, rng) {
    const side = s.turn === 'w' ? 0 : 1
    const [m, next] = chooseChessMove(s, chessAt(PERSONAS[id].chess, level(o), id), rng)
    return [m ? { type: 'move', move: m, player: side } : { type: 'timeout', player: side }, next]
  },
  think: (_s, id, o, r) => 450 + chessAt(PERSONAS[id].chess, level(o), id).depth * 250 + extraThink(level(o)) + r * 400,
  timeout: (side) => ({ type: 'timeout', player: side }),
  render: (_b, _a, a) => ({ pub: a }),
  start: (s) => s,
  reveal: (s) => s,
  resign: (s, side) => unwrap(applyChess(s, { type: 'resign', color: side === 0 ? 'w' : 'b' })),
}

// ── 象棋 ──
type XAct = XAction & { player: number }
const xiangqi: MatchDef<XiangqiState, XAct> = {
  ...board,
  undo: true,
  deal: () => createXiangqi(),
  apply: (s, a) => unwrap(applyXiangqi(s, a)),
  turn: (s) => (s.status !== 'playing' ? -1 : s.turn === 'r' ? 0 : 1),
  parse(raw, side) {
    if (!isObj(raw) || raw.type !== 'move' || !isObj(raw.move)) return null
    const m = raw.move
    if (!isIdx(m.from, 90) || !isIdx(m.to, 90)) return null
    return { type: 'move', move: { from: m.from as number, to: m.to as number }, player: side }
  },
  bot(s, id, o, rng) {
    const side = s.turn === 'r' ? 0 : 1
    const [m, next] = chooseXiangqiMove(s, chessAt(PERSONAS[id].chess, level(o), id), rng)
    return [m ? { type: 'move', move: m, player: side } : { type: 'timeout', player: side }, next]
  },
  think: (_s, id, o, r) => 450 + chessAt(PERSONAS[id].chess, level(o), id).depth * 250 + extraThink(level(o)) + r * 400,
  timeout: (side) => ({ type: 'timeout', player: side }),
  render: (_b, _a, a) => ({ pub: a }),
  start: (s) => s,
  reveal: (s) => s,
  resign: (s, side) => unwrap(applyXiangqi(s, { type: 'resign', side: side === 0 ? 'r' : 'b' })),
}

// ── 暗棋（蓋著的棋只有伺服器知道是什麼，翻開時才告訴大家）──
type BanqiAct = Exclude<BanqiAction, { type: 'resign' }> & { player: number }
const banqi: MatchDef<BanqiState, BanqiAct> = {
  ...board,
  undo: true,
  // 連吃是同一個人連著好幾步：悔棋要整串一起退
  undoRun: true,
  deal: (seed, o) => dealBanqi(seed, { rookSlide: o.rookSlide === true, chain: o.chain === true, darkEat: o.darkEat === true }),
  apply: (s, a) => unwrap(applyBanqi(s, a)),
  turn: (s) => (s.status !== 'playing' ? -1 : s.turn),
  parse(raw, side) {
    if (!isObj(raw)) return null
    if (raw.type === 'flip' && isIdx(raw.at, 32)) return { type: 'flip', at: raw.at as number, player: side }
    if (raw.type === 'move' && isIdx(raw.from, 32) && isIdx(raw.to, 32)) return { type: 'move', from: raw.from as number, to: raw.to as number, player: side }
    if (raw.type === 'end') return { type: 'end', player: side }
    return null
  },
  bot(s, id, o, rng) {
    const [a, next] = chooseBanqiAction(s, banqiAt(PERSONAS[id].chess, asCardLevel(o.difficulty)), rng)
    return [a && a.type !== 'resign' ? { ...a, player: s.turn } : { type: 'timeout', player: s.turn }, next]
  },
  think(s, _id, o, r) {
    const lv = asCardLevel(o.difficulty)
    return (s.chainAt >= 0 ? 900 : 1300) + (lv === 'high' ? 600 : lv === 'mid' ? 300 : 0) + r * 700
  },
  timeout: (side) => ({ type: 'timeout', player: side }),
  // 翻棋、暗吃（走到蓋著的棋上）：翻出來的是哪顆，大家都看得到
  render: (before, after, a) => ({
    pub: a.type === 'flip' ? { ...a, piece: after.board[a.at] } : a.type === 'move' && before.board[a.to] && !before.up[a.to] ? { ...a, piece: before.board[a.to] } : a,
  }),
  // 開局：蓋著的棋只給「有棋」（?），不給是哪顆
  start: (s) => ({ ...s, board: s.board.map((p, i) => (p && !s.up[i] ? '?' : p)) }),
  reveal: (s) => s,
  resign: (s, side) => unwrap(applyBanqi(s, { type: 'resign', seat: side as 0 | 1 })),
}

// ── 西洋跳棋 ──
/** 一條路線：2～13 個格子編號（連吃最多跳 12 次） */
const isPath = (v: unknown, max: number): v is number[] => Array.isArray(v) && v.length >= 2 && v.length <= 13 && v.every((x) => isIdx(x, max))
type CheckersAct = (Extract<CheckersAction, { type: 'move' }> | { type: 'timeout' }) & { player: number }
const checkers: MatchDef<CheckersState, CheckersAct> = {
  ...board,
  seconds: TURN_SECONDS.checkers,
  undo: true,
  deal: (_seed, o) => createCheckers({ forceCapture: o.forceCapture !== false }),
  apply: (s, a) => unwrap(applyCheckers(s, a.type === 'move' ? { type: 'move', path: a.path } : { type: 'timeout' })),
  turn: (s) => (s.status !== 'playing' ? -1 : s.turn),
  parse(raw, side) {
    if (!isObj(raw) || raw.type !== 'move' || !isPath(raw.path, 64)) return null
    return { type: 'move', path: raw.path, player: side }
  },
  bot(s, id, o, rng) {
    const [m, next] = chooseCheckersMove(s, checkersAt(PERSONAS[id].chess, level(o)), rng)
    return [m ? { type: 'move', path: m.path, player: s.turn } : { type: 'timeout', player: s.turn }, next]
  },
  think: (_s, id, o, r) => 500 + Math.min(checkersAt(PERSONAS[id].chess, level(o)).depth, 6) * 140 + extraThink(level(o)) + r * 400,
  timeout: (side) => ({ type: 'timeout', player: side }),
  render: (_b, _a, a) => ({ pub: a }),
  start: (s) => s,
  reveal: (s) => s,
  resign: (s, side) => unwrap(applyCheckers(s, { type: 'resign', side: side as 0 | 1 })),
}

// ── 星形跳棋（3 人；不猜拳，0 號先走）──
type StarAct = (Extract<StarAction, { type: 'move' }> | { type: 'timeout' }) & { player: number }
const starcheckers: MatchDef<StarState, StarAct> = {
  seats: 3,
  // 悔棋：另外兩個在場的真人都同意才悔（電腦直接同意）
  undo: true,
  seconds: TURN_SECONDS.checkers,
  deal: (_seed, o) => createStar({ longJump: o.longJump !== false }),
  apply: (s, a) => unwrap(applyStar(s, a.type === 'move' ? { type: 'move', path: a.path } : { type: 'timeout' })),
  turn: (s) => (s.over ? -1 : s.turn),
  parse(raw, side) {
    if (!isObj(raw) || raw.type !== 'move' || !isPath(raw.path, 121)) return null
    return { type: 'move', path: raw.path, player: side }
  },
  bot(s, id, o, rng) {
    const [m, next] = chooseStarMove(s, starAt(PERSONAS[id].chess, level(o)), rng)
    return [m ? { type: 'move', path: m.path, player: s.turn } : { type: 'timeout', player: s.turn }, next]
  },
  think: (_s, _id, o, r) => 700 + extraThink(level(o)) * 0.6 + r * 500,
  timeout: (side) => ({ type: 'timeout', player: side }),
  render: (_b, _a, a) => ({ pub: a }),
  start: (s) => s,
  reveal: (s) => s,
  resign: (s, side) => unwrap(applyStar(s, { type: 'resign', seat: side })),
}

// ── 步步為營 ──
type QuoridorAct = Exclude<QuoridorAction, { type: 'resign' }> & { player: number }
const quoridor: MatchDef<QuoridorState, QuoridorAct> = {
  ...board,
  undo: true,
  deal: () => createQuoridor(),
  apply: (s, a) => unwrap(applyQuoridor(s, a)),
  turn: (s) => (s.status !== 'playing' ? -1 : s.turn),
  parse(raw, side) {
    if (!isObj(raw)) return null
    if (raw.type === 'move' && isIdx(raw.to, 81)) return { type: 'move', to: raw.to as number, player: side }
    if (raw.type === 'wall' && isIdx(raw.at, QW * QW) && (raw.o === 'h' || raw.o === 'v')) return { type: 'wall', at: raw.at as number, o: raw.o, player: side }
    return null
  },
  bot(s, id, o, rng) {
    const [a, next] = chooseQuoridorAction(s, quoridorAt(PERSONAS[id].chess, level(o)), rng)
    return [a && a.type !== 'resign' ? { ...a, player: s.turn } : { type: 'timeout', player: s.turn }, next]
  },
  think: (_s, id, o, r) => 700 + quoridorAt(PERSONAS[id].chess, level(o)).depth * 150 + extraThink(level(o)) + r * 500,
  timeout: (side) => ({ type: 'timeout', player: side }),
  render: (_b, _a, a) => ({ pub: a }),
  start: (s) => s,
  reveal: (s) => s,
  resign: (s, side) => unwrap(applyQuoridor(s, { type: 'resign', side: side as 0 | 1 })),
}

// ── 點格棋（難度＝棋盤大小：低 4、中 5、高 6 格；圍到格子同一個人再畫一條）──
type DotsAct = Exclude<DotsAction, { type: 'resign' }> & { player: number }
const dots: MatchDef<DotsState, DotsAct> = {
  ...board,
  undo: true,
  deal: (_seed, o) => createDots(sizeOf(asCardLevel(o.difficulty))),
  apply: (s, a) => unwrap(applyDots(s, a.type === 'line' ? { type: 'line', line: a.line } : { type: 'timeout' })),
  turn: (s) => (s.status !== 'playing' ? -1 : s.turn),
  parse: (raw, side) => (isObj(raw) && raw.type === 'line' && isIdx(raw.line, lineCount(6)) ? { type: 'line', line: raw.line as number, player: side } : null),
  bot(s, _id, o, rng) {
    const [a, next] = chooseDotsAction(s, asCardLevel(o.difficulty), rng)
    return [a.type === 'line' ? { type: 'line', line: a.line, player: s.turn } : { type: 'timeout', player: s.turn }, next]
  },
  // 連吃時（剛圍到格子、同一個人再畫）快一點
  think: (s, _id, o, r) => (s.last?.boxes.length && s.last.side === s.turn ? 380 + r * 220 : 700 + (asCardLevel(o.difficulty) === 'high' ? 300 : 0) + r * 500),
  timeout: (side) => ({ type: 'timeout', player: side }),
  render: (_b, _a, a) => ({ pub: a }),
  start: (s) => s,
  reveal: (s) => s,
  resign: (s, side) => unwrap(applyDots(s, { type: 'resign', side: side as 0 | 1 })),
}

export const BOARD_DEFS: Record<string, MatchDef<any, any>> = { gomoku, go, othello, chess, xiangqi, banqi, checkers, starcheckers, quoridor, dots }
