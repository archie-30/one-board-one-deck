// 接龍解題：電腦自己試著玩一遍，看這副牌能不能全部收完。用來保證發出去的牌一定能玩到過關。
//   往下試（深度優先），走過的局面記起來不再走；每一步照「先收牌、再翻開蓋著的牌、再放牌堆的牌、最後才翻牌堆」的順序試。
//   一定安全的收牌（比對面顏色收到的還小 2 以內）直接收，不分岔。
//   不試「從收牌區拿回桌面」，也不把整疊沒有蓋牌的 K 搬到空位（白搬）；所以少數其實解得開的牌會被當成解不開——沒關係，那副就重洗。
//   試的局面有上限，超過就當成解不開（重洗一副），手機上也不會卡。
// 純函式，只用規則引擎，不碰畫面。
import { isRed } from '@/engine/bigtwo/cards'
import type { RngState } from '@/engine/common/rng'
import {
  applySolitaire,
  canPlace,
  dealSolitaire,
  finishPlan,
  foundationSlot,
  valueOf,
  type DrawCount,
  type SolitaireAction,
  type SolitaireState,
  type Source,
  type Target,
} from './rules'

/**
 * 最多試幾個局面：實測 8000 個時，翻 1 張約 85%、翻 3 張約 65% 的牌一下就解出來（平均 0.04～0.05 秒），
 * 解不出來的最多花約 0.2 秒就放棄、重洗一副。
 */
export const SOLVE_BUDGET = 8000

/** 局面的鑰匙：一樣的局面只試一次（分數、步數不算） */
function keyOf(s: SolitaireState): string {
  const cols = s.tableau.map((c) => `${c.down.length}:${c.up.join(',')}`).sort()
  return `${s.foundations.map((f) => f.length).join('.')}|${cols.join('/')}|${s.stock.join(',')}|${s.waste.join(',')}`
}

/** 一定安全、不用想就該收的牌：A、2，或兩種相反顏色都已經收到它前一張 */
function safeToFoundation(s: SolitaireState, card: number): boolean {
  const v = valueOf(card)
  if (v <= 2) return true
  const red = isRed(card)
  // 收牌區每一疊固定一種花色：slot 就是花色
  const otherMin = Math.min(...[0, 1, 2, 3].filter((slot) => isRedSuit(slot) !== red).map((slot) => s.foundations[slot].length))
  return v <= otherMin + 2
}
const isRedSuit = (suit: number) => suit === 1 || suit === 2

const mv = (from: Source, to: Target): SolitaireAction => ({ type: 'move', from, to })

/** 先把一定安全的牌都收上去 */
function autoPlay(s: SolitaireState): SolitaireState {
  for (let moved = true; moved; ) {
    moved = false
    const srcs: Source[] = []
    if (s.waste.length) srcs.push({ pile: 'waste' })
    s.tableau.forEach((c, col) => c.up.length && srcs.push({ pile: 'tableau', col, index: c.up.length - 1 }))
    for (const from of srcs) {
      const card = from.pile === 'waste' ? s.waste[s.waste.length - 1] : s.tableau[(from as { col: number }).col].up.slice(-1)[0]
      if (!safeToFoundation(s, card)) continue
      const r = applySolitaire(s, { type: 'move', from, to: { pile: 'foundation', slot: foundationSlot(card) } })
      if (r.ok) {
        s = r.state
        moved = true
        break
      }
    }
  }
  return s
}

/** 這個局面可以試的步（好的排前面） */
function candidates(s: SolitaireState): SolitaireAction[] {
  const found: SolitaireAction[] = []
  const reveal: SolitaireAction[] = []
  const fromWaste: SolitaireAction[] = []
  const other: SolitaireAction[] = []
  const toF = (card: number) => ({ pile: 'foundation' as const, slot: foundationSlot(card) })
  // 收牌
  if (s.waste.length) {
    const c = s.waste[s.waste.length - 1]
    if (canPlace(s, [c], toF(c))) found.push(mv({ pile: 'waste' }, toF(c)))
  }
  s.tableau.forEach((col, i) => {
    if (!col.up.length) return
    const c = col.up[col.up.length - 1]
    if (canPlace(s, [c], toF(c))) found.push(mv({ pile: 'tableau', col: i, index: col.up.length - 1 }, toF(c)))
  })
  // 桌面之間
  s.tableau.forEach((col, i) => {
    for (let k = 0; k < col.up.length; k++) {
      const cards = col.up.slice(k)
      const whole = k === 0
      // 整疊搬走、底下沒有蓋牌又要搬到空位：白搬
      for (let j = 0; j < 7; j++) {
        if (j === i || !canPlace(s, cards, { pile: 'tableau', col: j })) continue
        const target = s.tableau[j]
        const toEmpty = !target.up.length && !target.down.length
        if (whole && toEmpty && !col.down.length) continue
        const a = mv({ pile: 'tableau', col: i, index: k }, { pile: 'tableau', col: j })
        if (whole && col.down.length) reveal.push(a)
        else if (whole && !col.down.length) other.push(a) // 空出一格（讓 K 進來）
        else {
          // 只搬上半截：露出來的那張要能收，才值得
          const under = col.up[k - 1]
          if (canPlace(s, [under], toF(under))) other.push(a)
        }
        if (toEmpty) break // 搬到哪一個空位都一樣
      }
    }
  })
  // 牌堆的牌放上桌面
  if (s.waste.length) {
    const c = s.waste[s.waste.length - 1]
    for (let j = 0; j < 7; j++) {
      if (!canPlace(s, [c], { pile: 'tableau', col: j })) continue
      fromWaste.push(mv({ pile: 'waste' }, { pile: 'tableau', col: j }))
      if (!s.tableau[j].up.length) break
    }
  }
  const out = [...found, ...reveal, ...fromWaste, ...other]
  if (s.stock.length || s.waste.length) out.push({ type: 'draw' })
  return out
}

/** 這副牌（照目前局面）解不解得開；試的局面超過 budget 就當成解不開 */
export function solvable(start: SolitaireState, budget = SOLVE_BUDGET): boolean {
  const seen = new Set<string>()
  let nodes = 0
  const go = (s0: SolitaireState, depth: number): boolean => {
    const s = autoPlay(s0)
    if (s.won) return true
    // 桌面都翻開了、只靠收牌和翻牌堆就收得完
    if (!s.tableau.some((c) => c.down.length) && finishPlan(s)) return true
    const k = keyOf(s)
    if (seen.has(k)) return false
    seen.add(k)
    if (++nodes > budget || depth > 600) return false
    for (const a of candidates(s)) {
      const r = applySolitaire(s, a)
      if (r.ok && go(r.state, depth + 1)) return true
      if (nodes > budget) return false
    }
    return false
  }
  return go(start, 0)
}

/** 發一副確定解得開的牌：發一副、自己試著玩，解不開就重洗（同一個亂數種子每次發出一樣的牌） */
export function dealWinnable(rng: RngState, draw: DrawCount, budget = SOLVE_BUDGET): [SolitaireState, RngState] {
  let r = rng
  for (let tries = 0; tries < 200; tries++) {
    const [s, next] = dealSolitaire(r, draw)
    r = next
    if (solvable(s, budget)) return [s, r]
  }
  // 理論上到不了這裡（200 副都解不開）；真的發生就照原本的發
  return dealSolitaire(r, draw)
}

