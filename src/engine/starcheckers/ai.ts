// 星形跳棋電腦：照「每顆棋子離目的地尖端多遠」打分（越近越好），落後太多的棋子另外扣分（不要丟下一顆在家裡）。
//   低：只看這一步，常常亂挑、偶爾隨手走
//   中：只看這一步、挑最好的
//   高：多想一步——這一步走完，自己下一步最好能走到哪（不管對手），兩步加起來挑
//   挑戰：同高，但想得更廣（前幾名都試），收尾時更會把最後幾顆塞進去
// 有往前的步可走時，只在往前的步裡挑（不會原地踏步、往回走）；低難度的「隨手走」也是隨便挑一步往前的。
// 只看棋盤上公開的東西（星形跳棋本來就全部公開）。純函式，不碰畫面。
import { nextRandom, type RngState } from '../common/rng'
import { APEX, CELLS, CORNER_CELLS, HOMES, applyStar, hexDistance, legalMoves, remaining, targetOf, type StarMove, type StarState } from './rules'

export interface StarStyle {
  /** 0：只看這一步；1：再想自己下一步 */
  look: number
  /** 再想一步時，前幾名都試 */
  width: number
  /** 0～1：差不多好的步裡隨便挑的程度 */
  noise: number
  /** 0～1：隨手走一步的機率 */
  blunder: number
}

/** seat 的局面分數：越大越好 */
export function starScore(board: readonly number[], seat: number): number {
  const target = targetOf(seat)
  const apex = CELLS[APEX[target]]
  const inTarget = new Set(CORNER_CELLS[target])
  const home = new Set(CORNER_CELLS[HOMES[seat]])
  let sum = 0
  let worst = 0
  let atHome = 0
  board.forEach((v, i) => {
    if (v !== seat + 1) return
    const d = hexDistance(CELLS[i], apex)
    sum += d
    if (d > worst) worst = d
    if (home.has(i)) atHome++
    // 已經進目的地的：再加一點，不要再跑出去
    if (inTarget.has(i)) sum -= 0.6
  })
  // 落後太多的棋子扣分（大家一起往前，最後才不會剩一顆要走很久）；家裡留太多也扣
  return -sum - Math.max(0, worst - 9) * 1.4 - atHome * 0.4
}

const after = (s: StarState, m: StarMove) => {
  const r = applyStar(s, { type: 'move', path: m.path })
  return r.ok ? r.state : s
}

/** 選一步。回傳 [這一步, 新的亂數狀態]；沒有步可走回傳 null */
export function chooseStarMove(s: StarState, st: StarStyle, rng: RngState): [StarMove | null, RngState] {
  const moves = legalMoves(s)
  if (!moves.length) return [null, rng]
  const me = s.turn
  // 每一步往前多少（還差多遠少了多少）：有往前的步可走時，絕不走原地踏步或往回走的步
  const before = remaining(s.board, me)
  const prog = new Map(moves.map((m) => [m, before - remaining(after(s, m).board, me)]))
  const bestProg = Math.max(...prog.values())
  const sensible = (m: StarMove) => bestProg <= 0 || prog.get(m)! > 0
  let r: number
  ;[r, rng] = nextRandom(rng)
  if (r < st.blunder) {
    // 手滑：隨便挑一步，但還是往前走的
    const ok = moves.filter(sensible)
    ;[r, rng] = nextRandom(rng)
    return [ok[Math.floor(r * ok.length)], rng]
  }
  let scored = moves.filter(sensible).map((m) => ({ m, v: starScore(after(s, m).board, me) }))
  scored.sort((a, b) => b.v - a.v)
  if (st.look > 0) {
    // 多想一步：走完之後，假設輪到自己再走一步（不管對手），兩步加起來最好的
    scored = scored.slice(0, st.width).map(({ m, v }) => {
      const a = after(s, m)
      const again = { ...a, turn: me, over: false }
      let best = v
      for (const m2 of legalMoves(again)) {
        const v2 = starScore(after(again, m2).board, me)
        if (v2 > best) best = v2
      }
      // 這一步本身的好處算重一點（下一步可能被別人擋掉）
      return { m, v: v * 0.6 + best * 0.4 }
    })
    scored.sort((a, b) => b.v - a.v)
  }
  const floor = scored[0].v - st.noise * 3
  const pool = scored.filter((x) => x.v >= floor)
  ;[r, rng] = nextRandom(rng)
  return [pool[Math.floor(r * pool.length)].m, rng]
}
