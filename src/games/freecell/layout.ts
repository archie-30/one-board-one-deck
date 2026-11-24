// 新接龍牌桌版面：純計算，不碰 DOM。
//   左邊：選單按鈕下面是 4 個暫存格（2×2）
//   中間：8 疊桌面
//   右邊：收牌區 2×2，下面放步數、時間與按鈕
import type { Card } from '@/engine/bigtwo/cards'
import type { FreeCellState } from '@/engine/freecell/rules'
import type { Pose } from '../bigtwo/cardStage'
import { CARD_RATIO, type Point } from '../solitaire/layout'

export interface FreeCellLayout {
  W: number
  H: number
  cw: number
  ch: number
  gap: number
  cells: Point[]
  foundations: Point[]
  cols: Point[]
  hud: { x: number; y: number; w: number }
}

export type Spot = { pile: 'cell'; slot: number } | { pile: 'foundation'; slot: number } | { pile: 'tableau'; col: number }

/** topM：最上面一排牌離上緣多遠（觸控裝置多留，見 solitaire/topEdge.ts） */
export function freeCellLayout(W: number, H: number, cellTop = 66, topM = 14): FreeCellLayout {
  const m = 14
  // 寬度：左右各 2 張（2.1 張寬）＋ 8 疊
  let cw = (W - 2 * m) / (4.96 + 8 * 1.12)
  // 高度：左邊 2 排暫存格在選單按鈕下面；右邊 2 排收牌區＋約 150px 的資訊區
  const maxCw = Math.min((H - cellTop - m) / 2.1, (H - m - topM - 150) / 2.1) / CARD_RATIO
  cw = Math.min(cw, maxCw)
  const gap = cw * 1.12
  const ch = cw * CARD_RATIO
  const total = 4.96 * cw + 8 * gap
  const x0 = m + Math.max(0, (W - 2 * m - total) / 2) + cw / 2
  const top = topM + ch / 2
  const cy = cellTop + ch / 2
  const cells = [
    { x: x0, y: cy },
    { x: x0 + cw * 1.1, y: cy },
    { x: x0, y: cy + ch * 1.08 },
    { x: x0 + cw * 1.1, y: cy + ch * 1.08 },
  ]
  const c0 = x0 + cw * 1.1 + cw * 0.35 + gap
  const cols = Array.from({ length: 8 }, (_, i) => ({ x: c0 + i * gap, y: top }))
  const f0 = cols[7].x + gap * 0.5 + cw * 0.85
  const f1 = f0 + cw * 1.1
  const foundations = [
    { x: f0, y: top },
    { x: f1, y: top },
    { x: f0, y: top + ch * 1.08 },
    { x: f1, y: top + ch * 1.08 },
  ]
  const hudY = top + ch * 1.08 + ch / 2 + 12
  return { W, H, cw, ch, gap, cells, foundations, cols, hud: { x: f0 - cw / 2, y: hudY, w: f1 - f0 + cw } }
}

const jitter = (n: number, k: number) => {
  const x = Math.sin(n * 91.7 + k * 47.3) * 43758.5453
  return x - Math.floor(x) - 0.5
}

export function columnStep(L: FreeCellLayout, n: number): number {
  const du = L.ch * 0.28
  const avail = L.H - 10 - L.ch / 2 - L.cols[0].y
  const need = Math.max(0, n - 1) * du
  return need > avail ? (du * avail) / need : du
}

export function freeCellPoses(L: FreeCellLayout, s: FreeCellState, salt: number): { poses: Map<Card, Pose>; where: Map<Card, string> } {
  const poses = new Map<Card, Pose>()
  const where = new Map<Card, string>()
  s.cells.forEach((c, slot) => {
    if (c === null) return
    const p = L.cells[slot]
    poses.set(c, { x: p.x + jitter(c + salt, 1) * 2, y: p.y, r: jitter(c + salt, 2) * 4, s: 1, f: 1, z: 100 })
    where.set(c, `c${slot}`)
  })
  s.foundations.forEach((f, slot) =>
    f.forEach((c, i) => {
      const p = L.foundations[slot]
      poses.set(c, { x: p.x + jitter(c + salt, 4) * 2.5, y: p.y - i * 0.2, r: jitter(c + salt, 5) * 5, s: 1, f: 1, z: 200 + i })
      where.set(c, `f${slot}`)
    }),
  )
  s.tableau.forEach((col, ci) => {
    const p = L.cols[ci]
    const du = columnStep(L, col.length)
    col.forEach((c, i) => {
      poses.set(c, { x: p.x + jitter(c + salt, 8) * 2.5, y: p.y + i * du, r: jitter(c + salt, 9) * 3, s: 1, f: 1, z: 300 + i })
      where.set(c, `t${ci}`)
    })
  })
  return { poses, where }
}

/** 放開手指時指到哪裡 */
export function dropSpot(L: FreeCellLayout, s: FreeCellState, x: number, y: number): Spot | null {
  const near = (p: Point) => Math.abs(x - p.x) < L.cw * 0.6 && Math.abs(y - p.y) < L.ch * 0.6
  for (let slot = 0; slot < 4; slot++) if (near(L.cells[slot])) return { pile: 'cell', slot }
  for (let slot = 0; slot < 4; slot++) if (near(L.foundations[slot])) return { pile: 'foundation', slot }
  for (let col = 0; col < 8; col++) {
    const p = L.cols[col]
    const n = s.tableau[col].length
    const bottom = p.y + Math.max(0, n - 1) * columnStep(L, n) + L.ch * 0.7
    if (Math.abs(x - p.x) < L.gap / 2 && y > p.y - L.ch * 0.6 && y < bottom) return { pile: 'tableau', col }
  }
  return null
}
