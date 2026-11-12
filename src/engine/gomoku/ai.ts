// 五子棋 AI：評分式。輸入狀態，輸出要下的格子，不碰 UI。
import type { Difficulty } from '../common/types'
import { nextInt, nextRandom, type RngState } from '../common/rng'
import { PRESET_STYLES, type GomokuStyle } from '../common/personas'
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

/** 選一手棋。回傳 [格子編號, 新的亂數狀態]；沒有可下的格子時回傳 -1 */
export function chooseGomokuMove(state: GomokuState, style: GomokuAiStyle, rng: RngState): [number, RngState] {
  const st = styleOf(style)
  if (state.winner !== 0) return [-1, rng]
  if (state.moves.length === 0) {
    const mid = Math.floor(state.size / 2)
    return [mid * state.size + mid, rng]
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
  // 在分數接近的前幾名裡挑：noise 越大，挑選範圍越寬
  const floor = best.score * (1 - 0.06 - st.noise * 0.6)
  const pool = scored.filter((m) => m.score >= floor).slice(0, 1 + Math.round(st.noise * 5))
  let i: number
  ;[i, rng] = nextInt(rng, pool.length)
  return [pool[i].index, rng]
}
