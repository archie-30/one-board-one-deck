// 圍棋 AI：依「打法」為每個合法點打分，挑分數最高的；沒有值得下的地方就虛手。
// 看的東西：提子、救自己被打吃的棋、避免自己送吃、打吃對方、氣的多寡、
// 勢力範圍（太深入自己的地盤是浪費、太深入對方的地盤太危險）、布局時偏好三四線。
import { nextInt, nextRandom, type RngState } from '../common/rng'
import { PRESET_STYLES, type GoStyle } from '../common/personas'
import type { Difficulty } from '../common/types'
import { goBookMoves } from './book'
import { mcPick } from './mc'
import { groupAt, neighbors, other, scoreGo, toXY, tryPlay, type Color, type GoAction, type GoState, type Point } from './rules'

export type GoAiStyle = Difficulty | GoStyle
const styleOf = (s: GoAiStyle): GoStyle => (typeof s === 'string' ? PRESET_STYLES[s].go : s)

/** 勢力：每顆棋子往外影響 4 格，越近越強。正數 = 黑的地盤 */
export function influence(board: readonly Point[], size: number): Float32Array {
  const inf = new Float32Array(board.length)
  const R = 4
  for (let i = 0; i < board.length; i++) {
    if (board[i] === 0) continue
    const sign = board[i] === 1 ? 1 : -1
    const [x, y] = toXY(i, size)
    for (let dy = -R; dy <= R; dy++) {
      const yy = y + dy
      if (yy < 0 || yy >= size) continue
      for (let dx = -R; dx <= R; dx++) {
        const xx = x + dx
        const d = Math.abs(dx) + Math.abs(dy)
        if (xx < 0 || xx >= size || d > R) continue
        inf[yy * size + xx] += sign / (1 + d)
      }
    }
  }
  return inf
}

/** 這點是不是 color 自己的眼（四周都是自己的棋或棋盤邊） */
function isOwnEye(board: readonly Point[], size: number, i: number, color: Color): boolean {
  return neighbors(i, size).every((n) => board[n] === color)
}

function lineValue(i: number, size: number, center: number): number {
  const [x, y] = toXY(i, size)
  const line = Math.min(x, y, size - 1 - x, size - 1 - y)
  if (size <= 9) return [-12, -3, 5, 3, 2][Math.min(line, 4)] + center * (line >= 3 ? 3 : 0)
  return [-12, -6, 5, 6, 2][Math.min(line, 4)] + center * (line >= 4 ? 4 : 0)
}

export interface ScoredGoMove {
  index: number
  score: number
}

export function scoreGoMoves(state: GoState, style: GoAiStyle): ScoredGoMove[] {
  const s = styleOf(style)
  const { board, size } = state
  const me = state.turn
  const opp = other(me)
  const sign = me === 1 ? 1 : -1
  const inf = influence(board, size)
  const stones = board.filter((v) => v !== 0).length
  const opening = stones < size * size * 0.12
  const out: ScoredGoMove[] = []

  for (let i = 0; i < board.length; i++) {
    if (board[i] !== 0 || isOwnEye(board, size, i, me)) continue
    const r = tryPlay(state, i)
    if (!r.ok) continue
    const after = r.state.board
    const own = groupAt(after, size, i)
    let v = 0

    // 提子
    v += r.state.captured.length * 12 * (0.5 + s.skill)
    for (const n of neighbors(i, size)) {
      if (board[n] === me) {
        // 救自己被打吃的棋
        const before = groupAt(board, size, n)
        if (before.liberties.length === 1 && own.liberties.length >= 2) v += before.stones.length * 10 * (0.4 + s.defense + s.skill * 0.5)
      } else if (after[n] === opp) {
        // 打吃對方
        const g = groupAt(after, size, n)
        if (g.liberties.length === 1) v += g.stones.length * 4 * (0.5 + s.attack) + 2
        else if (g.liberties.length === 2) v += s.attack * 1.5
      }
    }
    // 自己送吃
    if (own.liberties.length === 1 && r.state.captured.length === 0) v -= own.stones.length * 14 * (0.3 + s.skill) + 6
    v += Math.min(own.liberties.length, 4)

    // 勢力：正數 = 我的地盤
    const f = inf[i] * sign
    if (f > 1.6) v -= (f - 1.6) * 3
    else if (f < -1.6) v -= (-f - 1.6) * 2.2
    else v += 4 - Math.abs(f) * 1.5

    if (opening) v += lineValue(i, size, s.center)
    if (neighbors(i, size).some((n) => board[n] === opp)) v += s.attack * 2.5

    out.push({ index: i, score: v })
  }
  return out.sort((a, b) => b.score - a.score || a.index - b.index)
}

/** 選一手：落子或虛手。回傳 [動作, 新的亂數狀態] */
export function chooseGoMove(state: GoState, style: GoAiStyle, rng: RngState): [GoAction, RngState] {
  const s = styleOf(style)
  if (state.phase === 'over') return [{ type: 'pass' }, rng]
  const scored = scoreGoMoves(state, s)
  // 下太久了就收手（避免在雙方都不肯虛手時無限下去）
  if (!scored.length || state.moves > state.size * state.size * 1.4) return [{ type: 'pass' }, rng]

  // 挑戰：開局照棋譜（佔空角、掛角）
  if (s.book && state.passes === 0) {
    const book = goBookMoves(state).filter((i) => tryPlay(state, i).ok)
    if (book.length) {
      let k: number
      ;[k, rng] = nextInt(rng, book.length)
      return [{ type: 'play', index: book[k] }, rng]
    }
  }

  let r: number
  ;[r, rng] = nextRandom(rng)
  const best = scored[0]
  const floor = best.score - 2 - s.noise * 10
  const pool = scored.filter((m) => m.score >= floor).slice(0, 1 + Math.round(s.noise * 5))
  let pick = pool[Math.floor(r * pool.length)]
  // 挑戰：前幾名各試下到底很多次，看整盤誰的地多，挑最有利的
  if (s.mc) {
    const width = state.size <= 9 ? 12 : state.size <= 13 ? 10 : 8
    const n = Math.max(4, Math.round(s.mc * (state.size <= 9 ? 4 : state.size <= 13 ? 1.7 : 1)))
    const m = mcPick(state, scored.slice(0, width), n, rng, s.mcPrior ?? 0.5)
    ;[, rng] = nextRandom(rng)
    if (m) {
      pick = scored.find((x) => x.index === m.index) ?? pick
    }
  }

  // 什麼時候虛手（像真人一樣「差不多了」就收手，不要一直下到填滿）：
  //   棋盤越滿，越覺得剩下的都是小地方，門檻越高
  const filled = state.board.filter((v) => v !== 0).length / state.board.length
  //   會算的人收得比較晚（肯把收官的小地方下完），不會算的人比較早就收手
  const bar = (filled < 0.3 ? 1.5 : filled < 0.45 ? 4 : filled < 0.55 ? 7 : 10) * (1.25 - s.skill * 0.75)
  if (pick.score < bar) return [{ type: 'pass' }, rng]
  //   對方剛虛手：還有大棋就繼續下；只剩小地方、或已經落後很多（翻不了盤），就跟著虛手結算
  if (state.passes === 1) {
    const sc = scoreGo(state)
    const mine = state.turn === 1 ? sc.black - sc.white : sc.white - sc.black
    if (pick.score < 8 || (mine > 0 && pick.score < 12) || mine < -state.size * 2) return [{ type: 'pass' }, rng]
  }
  return [{ type: 'play', index: pick.index }, rng]
}
