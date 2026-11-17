// 暗棋電腦：只看翻開的棋與公開資訊（被吃掉的棋、還沒翻開的有哪些），絕不偷看蓋著的棋是什麼。
//   翻棋：把「還沒出現的棋」每一種都假設一次（照數量加權）算期望值——翻出來會不會被吃、能不能吃人。
//   走棋：吃子賺多少、走完會不會被吃。
//   難度（banqiAt）：低只看一步、不太管會不會被吃、常常亂走；中看一步但會顧自己被吃；
//   高再多想一步（對方最好的回應），翻棋也會想對方怎麼回。
import { nextRandom, type RngState } from '../common/rng'
import { ALL_PIECES, applyBanqi, COLS, colOf, colorOf, kindOf, legalActions, outranks, rowOf, ROWS, SIZE, targetsFrom, type BanqiAction, type BanqiState, type Color, type Piece } from './rules'

export interface BanqiStyle {
  /** 1 = 只看自己這一步；2 = 再看對方最好的回應；3 = 再看自己接著怎麼回 */
  depth: 1 | 2 | 3
  /** 0～1：會不會顧「走完被吃」 */
  safety: number
  /** 0～1：喜歡吃子、往前壓 */
  attack: number
  /** 0～1：在差不多好的幾步裡隨機挑的程度 */
  noise: number
  /** 0～1：隨手走一步的機率 */
  blunder: number
  /** 0～1：主動靠近自己吃得掉的對方棋子（不然很容易互相閃到 50 步和棋） */
  chase?: number
  /** 翻棋之後往後算幾步（預設 1：只看對方怎麼回） */
  flipDepth?: number
}

/** 棋子的價值：帥最大但怕兵；炮能隔子打任何棋，比大小上的排名值錢 */
const VALUE: Record<string, number> = { K: 30, A: 16, B: 9, R: 7, N: 5, C: 8, P: 3 }

function valueOf(p: Piece, s: BanqiState): number {
  // 兵：對方的帥還在就很值錢（只有兵吃得到帥）
  if (kindOf(p) === 'P') {
    const enemyK = colorOf(p) === 'r' ? 'k' : 'K'
    const kingAlive = !s.captured.includes(enemyK)
    return kingAlive ? 5 : 2
  }
  return VALUE[kindOf(p)]
}

/** 還沒出現的棋：整副 − 翻開在盤上的 − 被吃掉的（蓋著的就是從這些裡面來的） */
export function hiddenPool(s: BanqiState): Piece[] {
  const left = new Map<Piece, number>()
  for (const p of ALL_PIECES) left.set(p, (left.get(p) ?? 0) + 1)
  for (let i = 0; i < SIZE; i++) if (s.up[i] && s.board[i]) left.set(s.board[i]!, left.get(s.board[i]!)! - 1)
  for (const p of s.captured) left.set(p, left.get(p)! - 1)
  const out: Piece[] = []
  for (const [p, n] of left) for (let k = 0; k < n; k++) out.push(p)
  return out
}

/** 某一方現在一步能吃到的最大價值 */
function bestGain(s: BanqiState, color: Color): number {
  let best = 0
  for (let i = 0; i < SIZE; i++) {
    const p = s.board[i]
    if (!p || !s.up[i] || colorOf(p) !== color) continue
    for (const to of targetsFrom(s, i)) {
      const t = s.board[to]
      if (t) best = Math.max(best, valueOf(t, s))
    }
  }
  return best
}

/** 圍堵：對方每顆「我吃得掉、它又吃不了我」的棋，還有幾條安全的退路（越少越好，堵死就跑不掉）。
 *  殘局要贏就得把它逼到角落，光是靠近，它會一直閃到 50 步和棋 */
function trapScore(s: BanqiState, me: Color): number {
  let total = 0
  for (let j = 0; j < SIZE; j++) {
    const t = s.board[j]
    if (!t || !s.up[j] || colorOf(t) === me) continue
    // 我有沒有棋能吃它（而且它吃不回來）
    let hunted = false
    for (let i = 0; i < SIZE && !hunted; i++) {
      const p = s.board[i]
      if (p && s.up[i] && colorOf(p) === me && kindOf(p) !== 'C' && outranks(p, t) && !outranks(t, p)) hunted = true
    }
    if (!hunted) continue
    let safe = 0
    for (const n of neighbors(j)) {
      if (s.board[n]) continue
      // 走過去會不會被我旁邊的棋吃
      if (!neighbors(n).some((m) => m !== j && s.board[m] && s.up[m] && colorOf(s.board[m]!) === me && outranks(s.board[m]!, t))) safe++
    }
    total += (4 - safe) * valueOf(t, s) * 0.06
  }
  return total
}
function neighbors(i: number): number[] {
  const r = rowOf(i)
  const c = colOf(i)
  const out: number[] = []
  if (r > 0) out.push(i - COLS)
  if (r < ROWS - 1) out.push(i + COLS)
  if (c > 0) out.push(i - 1)
  if (c < COLS - 1) out.push(i + 1)
  return out
}

/** 追擊：每顆自己翻開的棋，離最近一顆「吃得掉、又不會反過來吃它」的對方棋有多遠（越近越好） */
function chaseScore(s: BanqiState, me: Color): number {
  let total = 0
  for (let i = 0; i < SIZE; i++) {
    const p = s.board[i]
    if (!p || !s.up[i] || colorOf(p) !== me || kindOf(p) === 'C') continue
    let near = 99
    for (let j = 0; j < SIZE; j++) {
      const t = s.board[j]
      if (!t || !s.up[j] || colorOf(t) === me) continue
      if (!outranks(p, t) || outranks(t, p)) continue
      near = Math.min(near, Math.abs(rowOf(i) - rowOf(j)) + Math.abs(colOf(i) - colOf(j)))
    }
    if (near < 99) total += (8 - near) * valueOf(s.board[i]!, s) * 0.02
  }
  return total
}

/** 局面分數（從 me 的角度，越大越好）：吃掉的子力差，加上「接下來輪到誰、他能吃多少」。
 *  翻開或蓋著的棋都還活著，所以只算被吃掉的；翻開的棋危不危險由「能吃多少」那一項反映 */
function evaluate(s: BanqiState, me: Color, st: BanqiStyle): number {
  if (s.status !== 'playing') {
    if (s.winner === null) return 0
    return s.colors[s.winner] === me ? 1000 : -1000
  }
  let mat = 0
  for (const p of s.captured) mat += colorOf(p) === me ? -valueOf(p, s) : valueOf(p, s)
  if (st.chase) {
    // 棋都翻開了（殘局）：追得更積極，並把對方逼到沒有退路
    const open = !s.up.some((u, i) => !u && s.board[i])
    mat += chaseScore(s, me) * st.chase * (open ? 2.5 : 1)
    if (open) mat += (trapScore(s, me) - trapScore(s, me === 'r' ? 'b' : 'r')) * st.chase
  }
  const toMove = s.colors[s.turn]
  if (!toMove) return mat
  // 接下來輪到的人可以吃多少：輪到我＝好事；輪到對方＝我可能被吃
  const g = bestGain(s, toMove)
  if (toMove === me) return mat + g * (0.4 + 0.4 * st.attack)
  return mat - g * (0.5 + 0.5 * st.safety)
}

/** 翻開 at 這格的期望分數：還沒出現的棋每一種都假設一次，照數量加權 */
function flipValue(s: BanqiState, at: number, me: Color, st: BanqiStyle, reply: boolean): number {
  const pool = hiddenPool(s)
  if (!pool.length) return -Infinity
  const kinds = new Map<Piece, number>()
  for (const p of pool) kinds.set(p, (kinds.get(p) ?? 0) + 1)
  let total = 0
  for (const [p, n] of kinds) {
    const board = s.board.slice()
    board[at] = p
    const r = applyBanqi({ ...s, board }, { type: 'flip', at })
    if (!r.ok) continue
    // 翻棋最多再看對方怎麼回（看更深太慢，翻出來的又是猜的）
    total += n * (reply ? replyValue(r.state, me, st, st.flipDepth ?? 1) : evaluate(r.state, me, st))
  }
  return total / pool.length
}

/** 輪到 s.turn 的那一方往後算 depth 步（只算走棋、吃子；翻棋太難猜，當作「局面先不動」——也就是可以選擇不走棋）。
 *  回傳從 me 的角度看的分數。用 alpha-beta 剪枝，吃子先算。 */
function search(s: BanqiState, depth: number, me: Color, st: BanqiStyle, alpha: number, beta: number): number {
  const stand = evaluate(s, me, st)
  if (depth <= 0 || s.status !== 'playing') return stand
  const side = s.colors[s.turn]
  if (!side) return stand
  const mine = side === me
  // 「不走棋（去翻別的）」當作底線：局面不變
  let best = stand
  if (mine) alpha = Math.max(alpha, best)
  else beta = Math.min(beta, best)
  if (alpha >= beta) return best
  const moves = legalActions(s).filter((a) => a.type !== 'flip')
  // 吃子先算：剪枝比較快
  moves.sort((a, b) => (b.type === 'move' && s.board[b.to] ? 1 : 0) - (a.type === 'move' && s.board[a.to] ? 1 : 0))
  for (const a of moves) {
    const r = applyBanqi(s, a)
    if (!r.ok) continue
    // 連吃：同一方再走一次，不算一步深度
    const v = search(r.state, r.state.chainAt >= 0 ? depth : depth - 1, me, st, alpha, beta)
    if (mine) {
      if (v > best) best = v
      alpha = Math.max(alpha, v)
    } else {
      if (v < best) best = v
      beta = Math.min(beta, v)
    }
    if (alpha >= beta) break
  }
  return best
}

/** 對方最好的回應之後的分數（往後算 depth - 1 步） */
function replyValue(s: BanqiState, me: Color, st: BanqiStyle, depth = st.depth - 1): number {
  return search(s, depth, me, st, -Infinity, Infinity)
}

/** 一個動作的分數 */
function actionValue(s: BanqiState, a: BanqiAction, me: Color, st: BanqiStyle): number {
  const reply = st.depth >= 2
  if (a.type === 'flip') return flipValue(s, a.at, me, st, reply)
  const r = applyBanqi(s, a)
  if (!r.ok) return -Infinity
  // 還在連吃：當作接著能吃（之後再決定）
  // 連吃中：自己接著再選（還在同一步）
  if (r.state.chainAt >= 0) return search(r.state, st.depth, me, st, -Infinity, Infinity)
  return reply ? replyValue(r.state, me, st) : evaluate(r.state, me, st)
}

/** 這一格是不是我上一步剛離開的地方（來回晃） */
function myLast(s: BanqiState, from: number, to: number): boolean {
  const b = s.before
  return !!b && !b.flip && b.to === from && b.from === to
}

/** 選一個動作。回傳 [動作, 新的亂數狀態]；沒有動作可做是 null */
export function chooseBanqiAction(s: BanqiState, st: BanqiStyle, rng: RngState): [BanqiAction | null, RngState] {
  const acts = legalActions(s)
  if (!acts.length) return [null, rng]
  let r: number
  ;[r, rng] = nextRandom(rng)
  // 第一步（還不知道顏色）：隨便翻一顆
  const me = s.colors[s.turn]
  if (!me) {
    ;[r, rng] = nextRandom(rng)
    return [acts[Math.floor(r * acts.length)], rng]
  }
  // 手滑：隨手翻一顆或走一步
  if (r < st.blunder) {
    ;[r, rng] = nextRandom(rng)
    return [acts[Math.floor(r * acts.length)], rng]
  }
  let best = acts[0]
  let bestV = -Infinity
  // 很久沒人吃子：與其來回晃，不如去翻棋找機會（越久越想翻）；來回走回剛剛那格扣一點
  const urge = Math.max(0, s.quiet - 4) * 0.07
  for (const a of acts) {
    let v = a.type === 'end' ? evaluate({ ...s, chainAt: -1, turn: s.turn === 0 ? 1 : 0 }, me, st) : actionValue(s, a, me, st)
    if (a.type === 'flip') v += urge
    else if (a.type === 'move' && !s.board[a.to]) v -= 0.3 + (myLast(s, a.from, a.to) ? 0.6 : 0)
    ;[r, rng] = nextRandom(rng)
    v += (r - 0.5) * st.noise * 12
    if (v > bestV) ((bestV = v), (best = a))
  }
  return [best, rng]
}
