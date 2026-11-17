// 五子棋 AI：評分式。輸入狀態，輸出要下的格子，不碰 UI。
import type { Difficulty } from '../common/types'
import { nextInt, nextRandom, type RngState } from '../common/rng'
import { PRESET_STYLES, type GomokuStyle } from '../common/personas'
import { bookMoves } from './book'
import { searchBest } from './search'
import { findVcf } from './vcf'
import { DIRECTIONS, forbiddenKind, toXY, type GomokuState, type Player, type Stone } from './rules'

const SCORE = {
  five: 1_000_000,
  openFour: 100_000,
  four: 10_000,
  openThree: 8_000,
  jumpThree: 3_000,
  three: 500,
  openTwo: 400,
  two: 50,
  one: 10,
}

function cell(board: readonly Stone[], size: number, x: number, y: number): Stone | -1 {
  if (x < 0 || y < 0 || x >= size || y >= size) return -1
  return board[y * size + x]
}

/** 假設 player 下在 (x,y)，這個方向的連線價值 */
function lineScore(
  board: readonly Stone[],
  size: number,
  x: number,
  y: number,
  dx: number,
  dy: number,
  player: Player,
  useJump: boolean,
): number {
  let count = 1
  let open = 0
  let jump = 0
  for (const sign of [1, -1]) {
    let cx = x + dx * sign
    let cy = y + dy * sign
    while (cell(board, size, cx, cy) === player) {
      count++
      cx += dx * sign
      cy += dy * sign
    }
    if (cell(board, size, cx, cy) === 0) {
      open++
      // 隔一格之後還有自己的棋（跳三、跳四）
      let jx = cx + dx * sign
      let jy = cy + dy * sign
      let k = 0
      while (cell(board, size, jx, jy) === player) {
        k++
        jx += dx * sign
        jy += dy * sign
      }
      jump = Math.max(jump, k)
    }
  }
  if (count >= 5) return SCORE.five
  if (count === 4) return open === 2 ? SCORE.openFour : open === 1 ? SCORE.four : 0
  if (useJump && jump > 0) {
    if (count + jump >= 4) return SCORE.four
    if (count + jump === 3 && open === 2) return SCORE.jumpThree
  }
  if (count === 3) return open === 2 ? SCORE.openThree : open === 1 ? SCORE.three : 0
  if (count === 2) return open === 2 ? SCORE.openTwo : open === 1 ? SCORE.two : 0
  return open === 2 ? SCORE.one : 1
}

function pointScore(board: readonly Stone[], size: number, index: number, player: Player, useJump: boolean): number {
  const [x, y] = toXY(index, size)
  let total = 0
  for (const [dx, dy] of DIRECTIONS) total += lineScore(board, size, x, y, dx, dy, player, useJump)
  return total
}

/** 候選格：距離任一棋子 2 格內的空格 */
function candidates(state: GomokuState): number[] {
  const { board, size } = state
  const seen = new Set<number>()
  for (let i = 0; i < board.length; i++) {
    if (board[i] === 0) continue
    const [x, y] = toXY(i, size)
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (cell(board, size, x + dx, y + dy) === 0) seen.add((y + dy) * size + (x + dx))
      }
    }
  }
  return [...seen]
}

export interface ScoredMove {
  index: number
  score: number
}

export type GomokuAiStyle = Difficulty | GomokuStyle
const styleOf = (style: GomokuAiStyle): GomokuStyle => (typeof style === 'string' ? PRESET_STYLES[style].gomoku : style)

/** 所有候選格的分數（由高到低），教學與測試也會用到 */
export function scoreMoves(state: GomokuState, style: GomokuAiStyle): ScoredMove[] {
  const st = styleOf(style)
  const { board, size, turn } = state
  const opponent: Player = turn === 1 ? 2 : 1
  const center = (size - 1) / 2
  const out: ScoredMove[] = []
  for (const index of candidates(state)) {
    if (state.options.forbidden && turn === 1 && forbiddenKind(board, size, index)) continue
    const attack = pointScore(board, size, index, turn, st.sharp) * st.attack
    const rawBlock = pointScore(board, size, index, opponent, st.sharp)
    // 「下一手就輸」的棋，除了漏看的人以外一定會擋
    const block = rawBlock >= SCORE.five ? rawBlock * 0.9 : rawBlock * st.defense
    const [x, y] = toXY(index, size)
    const centerBonus = st.center * Math.max(0, 7 - Math.abs(x - center) - Math.abs(y - center)) * 3
    out.push({ index, score: attack + block + centerBonus })
  }
  return out.sort((a, b) => b.score - a.score || a.index - b.index)
}

// 對手回應只看「對手自己能連多兇」（不算擋我的分數，不然我越有威脅反而扣越多）
const PLAIN: GomokuStyle = { attack: 1, defense: 0, sharp: true, noise: 0, center: 0, blind: 0 }
/** 對手會怎麼回：攻守都看（像一般的好手） */
const REPLY: GomokuStyle = { attack: 1, defense: 1, sharp: true, noise: 0, center: 0, blind: 0 }
/**
 * deep（挑戰）：再多看一步——假設對手照好手的下法回一手，看自己接下來最兇能下到哪裡，
 * 選「自己好、對手的威脅小、自己還有後續」的那一手
 */
function lookAhead(state: GomokuState, top: ScoredMove[], deep = false): number {
  const opp: Player = state.turn === 1 ? 2 : 1
  let pick = top[0]
  let bestV = -Infinity
  for (const m of top) {
    const board = state.board.slice()
    board[m.index] = state.turn
    const after = { ...state, board, turn: opp }
    const reply = scoreMoves(after, PLAIN)[0]
    let v = m.score - (reply ? reply.score * 0.5 : 0)
    if (deep) {
      const real = scoreMoves(after, REPLY)[0]
      if (real) {
        const b2 = board.slice()
        b2[real.index] = opp
        const follow = scoreMoves({ ...state, board: b2, turn: state.turn }, PLAIN)[0]
        if (follow) v += follow.score * 0.35
      }
    }
    if (v > bestV) {
      bestV = v
      pick = m
    }
  }
  return pick.index
}

/** 往後算時每一步看前幾名、最多想幾個局面（手機上一步約一秒內） */
const SEARCH_WIDTH = 6
const SEARCH_NODES = 4000

/** 這一格能不能下（黑棋禁手開啟時要避開禁手） */
const canPlay = (s: GomokuState, i: number) => s.board[i] === 0 && !(s.options.forbidden && s.turn === 1 && forbiddenKind(s.board, s.size, i))

/** 選一手棋。回傳 [格子編號, 新的亂數狀態]；沒有可下的格子時回傳 -1 */
export function chooseGomokuMove(state: GomokuState, style: GomokuAiStyle, rng: RngState): [number, RngState] {
  const st = styleOf(style)
  if (state.winner !== 0) return [-1, rng]
  if (state.moves.length === 0) {
    const mid = Math.floor(state.size / 2)
    return [mid * state.size + mid, rng]
  }
  // 挑戰：開局照棋譜（花月、浦月）
  if (st.book) {
    const book = bookMoves(state).filter((i) => canPlay(state, i))
    if (book.length) {
      let k: number
      ;[k, rng] = nextInt(rng, book.length)
      return [book[k], rng]
    }
  }
  let scored = scoreMoves(state, st)
  if (scored.length === 0) return [state.board.findIndex((v) => v === 0), rng]

  // 自己能贏：一定下
  const win = scored.find((m) => pointScore(state.board, state.size, m.index, state.turn, true) >= SCORE.five)
  if (win) return [win.index, rng]

  // 漏看：偶爾沒注意到對手的四
  let r: number
  ;[r, rng] = nextRandom(rng)
  if (r < st.blind) {
    const opp: Player = state.turn === 1 ? 2 : 1
    const rest = scored.filter((m) => pointScore(state.board, state.size, m.index, opp, true) < SCORE.five)
    if (rest.length) scored = rest
  }

  const best = scored[0]
  if (best.score >= SCORE.openFour * 0.9 && st.blind === 0) return [best.index, rng]
  // 挑戰：自己有連續衝四取勝就照著下；對手有的話，從前幾名裡挑一手能破壞它的
  if (st.vcf) {
    const win = findVcf(state)
    if (win >= 0 && canPlay(state, win)) return [win, rng]
    const opp: Player = state.turn === 1 ? 2 : 1
    if (findVcf(state, opp) >= 0) {
      for (const m of scored.slice(0, 6)) {
        const board = state.board.slice()
        board[m.index] = state.turn
        if (findVcf({ ...state, board, turn: opp }, opp) < 0) return [m.index, rng]
      }
    }
  }
  // 挑戰：往後算幾手，每個局面都看整盤的形勢（只在前幾名裡挑，個性照樣影響排序）
  if (st.depth && st.depth > 1) {
    const cands = scored.slice(0, SEARCH_WIDTH).map((m) => m.index)
    return [searchBest(state, cands, { depth: st.depth, width: SEARCH_WIDTH, nodes: SEARCH_NODES, order: (s) => scoreMoves(s, REPLY).map((m) => m.index) }), rng]
  }
  // 先試下前幾名，看對手最好的回應有多兇，選「自己好、對手回得最不痛」的那一手
  if (st.look && st.look > 0) return [lookAhead(state, scored.slice(0, st.look), st.look >= 10), rng]
  // 在分數接近的前幾名裡挑：noise 越大，挑選範圍越寬
  const floor = best.score * (1 - 0.06 - st.noise * 0.6)
  const pool = scored.filter((m) => m.score >= floor).slice(0, 1 + Math.round(st.noise * 5))
  let i: number
  ;[i, rng] = nextInt(rng, pool.length)
  return [pool[i].index, rng]
}
