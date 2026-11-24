// 蜘蛛接龍牌桌版面：純計算，不碰 DOM。
//   左邊一欄：選單按鈕下面是牌堆（每次發牌的 10 張一組，錯開一點看得出還能發幾次），再下面是收走的整串
//   中間：10 疊桌面
//   右邊：分數、時間、步數與按鈕
import type { Card } from '@/engine/bigtwo/cards'
import type { SpiderState } from '@/engine/spider/rules'
import type { Pose } from '../bigtwo/cardStage'
import { CARD_RATIO, type Point } from '../solitaire/layout'

export interface SpiderLayout {
  W: number
  H: number
  cw: number
  ch: number
  gap: number
  stock: Point
  /** 收走的第 k 串放在哪 */
  done: Point[]
  cols: Point[]
  hud: { x: number; y: number; w: number }
}

/** stockTop：牌堆上緣（左上角選單按鈕下面）；hudW：右邊資訊區的寬度 */
/** topM：最上面一排牌離上緣多遠（觸控裝置多留，見 solitaire/topEdge.ts） */
export function spiderLayout(W: number, H: number, stockTop = 66, hudW = 136, topM = 14): SpiderLayout {
  const m = 14
  // 寬度：左欄 1 張＋10 疊＋資訊區
  let cw = (W - 2 * m - hudW) / 13.0
  // 高度：左欄要放得下牌堆＋8 串收走的牌
  const maxCw = (H - stockTop - m) / 2.75 / CARD_RATIO
  cw = Math.min(cw, maxCw)
  const gap = cw * 1.12
  const ch = cw * CARD_RATIO
  const total = cw + gap * 0.45 + gap * 10 + gap * 0.3 + hudW
  const x0 = m + Math.max(0, (W - 2 * m - total) / 2) + cw / 2
  const top = topM + ch / 2
  const stock = { x: x0, y: stockTop + ch / 2 }
  const done = Array.from({ length: 8 }, (_, k) => ({ x: x0, y: stock.y + ch * 1.18 + k * ch * 0.08 }))
  const c0 = x0 + gap * 1.45
  const cols = Array.from({ length: 10 }, (_, i) => ({ x: c0 + i * gap, y: top }))
  const hx = cols[9].x + cw / 2 + gap * 0.3
  return { W, H, cw, ch, gap, stock, done, cols, hud: { x: hx, y: m, w: hudW } }
}

const jitter = (n: number, k: number) => {
  const x = Math.sin(n * 91.7 + k * 47.3) * 43758.5453
  return x - Math.floor(x) - 0.5
}

/** 每一疊往下錯開多少（太長時自動壓縮） */
export function columnSteps(L: SpiderLayout, down: number, up: number): { dd: number; du: number } {
  let dd = L.ch * 0.1
  let du = L.ch * 0.27
  const avail = L.H - 10 - L.ch / 2 - L.cols[0].y
  const need = down * dd + Math.max(0, up - 1) * du
  if (need > avail) {
    const k = avail / need
    dd *= k
    du *= k
  }
  return { dd, du }
}

export function spiderPoses(L: SpiderLayout, s: SpiderState, salt: number): { poses: Map<Card, Pose>; where: Map<Card, string> } {
  const poses = new Map<Card, Pose>()
  const where = new Map<Card, string>()
  // 牌堆：10 張一組，最底下那組對齊牌堆的格子，越上面的組往右錯開一點（不會超出畫面左邊被切掉）；下一次要發的那組在最上面
  s.stock.forEach((c, i) => {
    const g = Math.floor(i / 10)
    const k = i % 10
    poses.set(c, { x: L.stock.x + g * L.cw * 0.07 + k * 0.12, y: L.stock.y - k * 0.2, r: jitter(c + salt, 1) * 2, s: 1, f: 0, z: 10 + i })
    where.set(c, 'stock')
  })
  // 收走的整串：K 在最上面，每串錯開一點
  s.done.forEach((run, k) => {
    const p = L.done[k]
    run.forEach((c, i) => {
      poses.set(c, { x: p.x + jitter(c + salt, 4) * 2, y: p.y - (12 - i) * 0.12, r: jitter(k + salt, 5) * 4, s: 1, f: 1, z: 100 + k * 20 + (12 - i) })
      where.set(c, `d${k}`)
    })
  })
  s.tableau.forEach((col, ci) => {
    const p = L.cols[ci]
    const { dd, du } = columnSteps(L, col.down.length, col.up.length)
    col.down.forEach((c, i) => {
      poses.set(c, { x: p.x + jitter(c + salt, 6) * 2, y: p.y + i * dd, r: jitter(c + salt, 7) * 3, s: 1, f: 0, z: 300 + i })
      where.set(c, `t${ci}`)
    })
    col.up.forEach((c, i) => {
      poses.set(c, { x: p.x + jitter(c + salt, 8) * 2.5, y: p.y + col.down.length * dd + i * du, r: jitter(c + salt, 9) * 3, s: 1, f: 1, z: 360 + i })
      where.set(c, `t${ci}`)
    })
  })
  return { poses, where }
}

/** 放開手指時指到哪一疊 */
export function dropCol(L: SpiderLayout, s: SpiderState, x: number, y: number): number | null {
  for (let col = 0; col < 10; col++) {
    const p = L.cols[col]
    const c = s.tableau[col]
    const { dd, du } = columnSteps(L, c.down.length, c.up.length)
    const bottom = p.y + c.down.length * dd + Math.max(0, c.up.length - 1) * du + L.ch * 0.7
    if (Math.abs(x - p.x) < L.gap / 2 && y > p.y - L.ch * 0.6 && y < bottom) return col
  }
  return null
}
