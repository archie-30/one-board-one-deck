// 金字塔接龍牌桌版面：純計算，不碰 DOM。
//   左邊一欄：選單按鈕下面是牌堆、翻牌堆、拿走的牌
//   中間：7 排金字塔（下一排壓住上一排的下半截）
//   右邊：分數、時間、步數與按鈕
import type { Card } from '@/engine/bigtwo/cards'
import { colOf, indexOf, PYRAMID, rowOf, ROWS, type PyramidState, type Spot } from '@/engine/pyramid/rules'
import type { Pose } from '../bigtwo/cardStage'
import { CARD_RATIO, type Point } from '../solitaire/layout'

export interface PyramidLayout {
  W: number
  H: number
  cw: number
  ch: number
  stock: Point
  waste: Point
  gone: Point
  /** 金字塔 28 格的中心 */
  cells: Point[]
  hud: { x: number; y: number; w: number }
}

/** 金字塔左右兩張的間距、上下兩排的間距（卡片寬高的幾倍） */
const GX = 1.1
const DY = 0.5

/** stockTop：牌堆上緣（左上角選單按鈕下面）；hudW：右邊資訊區的寬度；topM：金字塔頂離上緣多遠 */
export function pyramidLayout(W: number, H: number, stockTop = 66, hudW = 136, topM = 14): PyramidLayout {
  const m = 14
  // 寬度：左欄 1 張＋空隙＋金字塔 7 張＋空隙＋資訊區
  let cw = (W - 2 * m - hudW) / (1 + 0.7 + (ROWS - 1) * GX + 1 + 0.5)
  // 高度：金字塔 1 張＋6 個半張；左欄放得下牌堆、翻牌堆、拿走的牌三格
  const maxCh = Math.min((H - topM - m) / (1 + (ROWS - 1) * DY), (H - stockTop - m) / 3.36)
  cw = Math.min(cw, maxCh / CARD_RATIO)
  const ch = cw * CARD_RATIO
  const x0 = m + cw / 2
  const stock = { x: x0, y: stockTop + ch / 2 }
  const waste = { x: x0, y: stock.y + ch * 1.18 }
  const gone = { x: x0, y: waste.y + ch * 1.18 }
  // 金字塔放在左欄和資訊區中間
  const left = x0 + cw / 2 + cw * 0.7
  const right = W - m - hudW - cw * 0.5
  const cx = (left + right) / 2
  // 上下置中（但不超過上緣）
  const pyrH = ch * (1 + (ROWS - 1) * DY)
  const top = Math.max(topM, (H - pyrH) / 2) + ch / 2
  const cells = Array.from({ length: PYRAMID }, (_, i) => {
    const r = rowOf(i)
    return { x: cx + (colOf(i) - r / 2) * cw * GX, y: top + r * ch * DY }
  })
  const hx = W - m - hudW
  return { W, H, cw, ch, stock, waste, gone, cells, hud: { x: hx, y: m, w: hudW } }
}

const jitter = (n: number, k: number) => {
  const x = Math.sin(n * 91.7 + k * 47.3) * 43758.5453
  return x - Math.floor(x) - 0.5
}

/** 每張牌放在哪、在哪一區（where：p 金字塔、s 牌堆、w 翻牌堆、g 拿走） */
export function pyramidPoses(L: PyramidLayout, s: PyramidState, salt: number): { poses: Map<Card, Pose>; where: Map<Card, string> } {
  const poses = new Map<Card, Pose>()
  const where = new Map<Card, string>()
  s.stock.forEach((c, i) => {
    poses.set(c, { x: L.stock.x + i * 0.1, y: L.stock.y - i * 0.22, r: jitter(c + salt, 1) * 2, s: 1, f: 0, z: 10 + i })
    where.set(c, 's')
  })
  s.waste.forEach((c, i) => {
    poses.set(c, { x: L.waste.x + i * 0.1, y: L.waste.y - i * 0.22, r: jitter(c + salt, 2) * 3, s: 1, f: 1, z: 60 + i })
    where.set(c, 'w')
  })
  s.gone.forEach((c, i) => {
    poses.set(c, { x: L.gone.x + jitter(c + salt, 3) * 3, y: L.gone.y - i * 0.12, r: jitter(c + salt, 4) * 7, s: 1, f: 1, z: 120 + i })
    where.set(c, 'g')
  })
  s.pyramid.forEach((c, i) => {
    if (c === null) return
    const p = L.cells[i]
    poses.set(c, { x: p.x + jitter(c + salt, 5) * 1.5, y: p.y + jitter(c + salt, 6) * 1.5, r: jitter(c + salt, 7) * 2, s: 1, f: 1, z: 300 + i })
    where.set(c, `p${i}`)
  })
  return { poses, where }
}

/** 這張牌在哪個位置（金字塔第幾格／翻牌堆最上面）；不是能用的位置就回傳 null */
export function spotOf(s: PyramidState, c: Card): Spot | null {
  const i = s.pyramid.indexOf(c)
  if (i >= 0) return { pile: 'pyramid', i }
  if (s.waste.length && s.waste[s.waste.length - 1] === c) return { pile: 'waste' }
  return null
}

/** 放開手指時指到哪張牌（金字塔裡露出來的、或翻牌堆最上面）：疊在上面的優先 */
export function dropSpot(L: PyramidLayout, s: PyramidState, x: number, y: number, usable: (p: Spot) => boolean): Spot | null {
  const inside = (p: Point) => Math.abs(x - p.x) < L.cw * 0.55 && Math.abs(y - p.y) < L.ch * 0.55
  for (let r = ROWS - 1; r >= 0; r--) {
    for (let c = 0; c <= r; c++) {
      const i = indexOf(r, c)
      const spot: Spot = { pile: 'pyramid', i }
      if (s.pyramid[i] !== null && usable(spot) && inside(L.cells[i])) return spot
    }
  }
  if (s.waste.length && inside(L.waste)) return { pile: 'waste' }
  return null
}
