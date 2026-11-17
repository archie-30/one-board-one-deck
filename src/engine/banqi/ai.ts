// 暗棋電腦：只看翻開的棋與公開資訊（被吃掉的棋、還沒翻開的有哪些），絕不偷看蓋著的棋是什麼。
//   翻棋：把「還沒出現的棋」每一種都假設一次（照數量加權）算期望值——翻出來會不會被吃、能不能吃人。
//   走棋：吃子賺多少、走完會不會被吃。
//   難度（banqiAt）：低只看一步、不太管會不會被吃、常常亂走；中看一步但會顧自己被吃；
//   高再多想一步（對方最好的回應），翻棋也會想對方怎麼回。
import { nextRandom, type RngState } from '../common/rng'
import { ALL_PIECES, applyBanqi, colOf, colorOf, kindOf, legalActions, outranks, rowOf, SIZE, targetsFrom, type BanqiAction, type BanqiState, type Color, type Piece } from './rules'

export interface BanqiStyle {
  /** 1 = 只看自己這一步；2 = 再看對方最好的回應 */
  depth: 1 | 2
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
  if (st.chase) mat += chaseScore(s, me) * st.chase
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
    total += n * (reply ? replyValue(r.state, me, st) : evaluate(r.state, me, st))
  }
  return total / pool.length
}

/** 對方最好的回應之後的分數（對方翻棋就當作局面不變：他也不知道會翻出什麼） */
function replyValue(s: BanqiState, me: Color, st: BanqiStyle): number {
  if (s.status !== 'playing') return evaluate(s, me, st)
  let worst = evaluate(s, me, st)
  for (const a of legalActions(s)) {
    if (a.type !== 'move') continue
    const r = applyBanqi(s, a)
    if (!r.ok) continue
    // 對方連吃：讓他把最好的那口吃完
    let next = r.state
    while (next.chainAt >= 0) {
      const more = legalActions(next).filter((x) => x.type === 'move')
      if (!more.length) break
      const r2 = applyBanqi(next, more[0])
      if (!r2.ok) break
      next = r2.state
    }
    if (next.chainAt >= 0) next = (applyBanqi(next, { type: 'end' }) as { ok: true; state: BanqiState }).state
    worst = Math.min(worst, evaluate(next, me, st))
  }
  return worst
}

/** 一個動作的分數 */
function actionValue(s: BanqiState, a: BanqiAction, me: Color, st: BanqiStyle): number {
  const reply = st.depth >= 2
  if (a.type === 'flip') return flipValue(s, a.at, me, st, reply)
  const r = applyBanqi(s, a)
  if (!r.ok) return -Infinity
  // 還在連吃：當作接著能吃（之後再決定）
  if (r.state.chainAt >= 0) return evaluate({ ...r.state, chainAt: -1 }, me, st) + 1
  return reply ? replyValue(r.state, me, st) : evaluate(r.state, me, st)
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
  for (const a of acts) {
    let v = a.type === 'end' ? evaluate({ ...s, chainAt: -1, turn: s.turn === 0 ? 1 : 0 }, me, st) : actionValue(s, a, me, st)
    ;[r, rng] = nextRandom(rng)
    v += (r - 0.5) * st.noise * 12
    if (v > bestV) ((bestV = v), (best = a))
  }
  return [best, rng]
}
