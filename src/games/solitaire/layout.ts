// 接龍牌桌版面：依畫面大小算出牌堆、收牌區、7 疊桌面的位置，以及每張牌的姿勢。純計算，不碰 DOM。
//   左邊一欄：牌堆（上）、翻出來的牌（下）
//   中間：7 疊桌面
//   右邊：收牌區 2×2，下面放分數與按鈕
import type { Card } from '@/engine/bigtwo/cards'
import type { SolitaireState } from '@/engine/solitaire/rules'
import type { Pose } from '../bigtwo/cardStage'

export interface Point {
  x: number
  y: number
}

export interface SolLayout {
  W: number
  H: number
  /** 牌寬、牌高（px） */
  cw: number
  ch: number
  gap: number
  stock: Point
  waste: Point
  foundations: Point[]
  cols: Point[]
  /** 右下資訊區的左上角與寬度 */
  hud: { x: number; y: number; w: number }
}

export const CARD_RATIO = 108 / 78

export function solLayout(W: number, H: number, safeLeft = 0, safeRight = 0): SolLayout {
  const m = 14
  const left = m + safeLeft
  const right = W - m - safeRight
  // 總寬 ≈ 10.44 個欄距；牌高也要讓右邊放得下兩排收牌區＋資訊
  let gap = (right - left) / 10.44
  let cw = gap / 1.14
  // 右邊一欄要放得下兩排收牌區＋約 150px 的資訊區
  // 左邊一欄：選單按鈕下面放牌堆與翻出來的牌（翻 3 張時往下錯開），也要放得下
  const STOCK_TOP = 74
  const maxCw = Math.min((H - m - 150) / 2.08, (H - STOCK_TOP - 12) / 2.54) / CARD_RATIO
  if (cw > maxCw) {
    cw = maxCw
    gap = cw * 1.14
  }
  const ch = cw * CARD_RATIO
  const total = 8.6 * gap + 2.1 * cw
  const x0 = left + Math.max(0, (right - left - total) / 2) + cw / 2
  const top = m + ch / 2
  const stock = { x: x0, y: STOCK_TOP + ch / 2 }
  const waste = { x: x0, y: stock.y + ch * 1.14 }
  const c0 = x0 + gap * 1.3
  const cols = Array.from({ length: 7 }, (_, i) => ({ x: c0 + i * gap, y: top }))
  const f0 = cols[6].x + gap * 1.3
  const f1 = f0 + cw * 1.1
  const foundations = [
    { x: f0, y: top },
    { x: f1, y: top },
    { x: f0, y: top + ch * 1.08 },
    { x: f1, y: top + ch * 1.08 },
  ]
  const hudY = top + ch * 1.08 + ch / 2 + 12
  return { W, H, cw, ch, gap, stock, waste, foundations, cols, hud: { x: f0 - cw / 2, y: hudY, w: f1 - f0 + cw } }
}

/** 由編號算出固定的小亂數（-0.5～0.5） */
const jitter = (n: number, k: number) => {
  const x = Math.sin(n * 91.7 + k * 47.3) * 43758.5453
  return x - Math.floor(x) - 0.5
}

/** 每一疊桌面的牌往下錯開多少（太長時自動壓縮） */
export function columnSteps(L: SolLayout, down: number, up: number): { dd: number; du: number } {
  let dd = L.ch * 0.13
  let du = L.ch * 0.29
  const avail = L.H - 10 - L.ch / 2 - L.cols[0].y
  const need = down * dd + Math.max(0, up - 1) * du
  if (need > avail) {
    const k = avail / need
    dd *= k
    du *= k
  }
  return { dd, du }
}

export type Spot = { pile: 'stock' } | { pile: 'waste' } | { pile: 'foundation'; slot: number } | { pile: 'tableau'; col: number }

/** 算出所有牌的姿勢，以及每張牌在哪一區（拿來判斷哪些牌換了位置） */
export function solPoses(L: SolLayout, s: SolitaireState, salt: number): { poses: Map<Card, Pose>; where: Map<Card, string> } {
  const poses = new Map<Card, Pose>()
  const where = new Map<Card, string>()
  // 牌堆：蓋著疊在一起，越上面越往左上偏一點點
  s.stock.forEach((c, i) => {
    poses.set(c, { x: L.stock.x - i * 0.25, y: L.stock.y - i * 0.3, r: jitter(c + salt, 1) * 2, s: 1, f: 0, z: 10 + i })
    where.set(c, 'stock')
  })
  // 翻出來的牌：最上面幾張往下錯開（翻 3 張時看得到 3 張）
  const show = s.draw === 3 ? 3 : 1
  const n = s.waste.length
  s.waste.forEach((c, i) => {
    const k = Math.max(0, i - (n - show))
    poses.set(c, { x: L.waste.x + jitter(c + salt, 2) * 3, y: L.waste.y + k * L.ch * 0.2, r: jitter(c + salt, 3) * 5, s: 1, f: 1, z: 100 + i })
    where.set(c, 'waste')
  })
  // 收牌區：整齊疊起來，每張有一點點角度
  s.foundations.forEach((f, slot) =>
    f.forEach((c, i) => {
      const p = L.foundations[slot]
      poses.set(c, { x: p.x + jitter(c + salt, 4) * 2.5, y: p.y - i * 0.2, r: jitter(c + salt, 5) * 5, s: 1, f: 1, z: 200 + i })
      where.set(c, `f${slot}`)
    }),
  )
  // 桌面
  s.tableau.forEach((col, ci) => {
    const p = L.cols[ci]
    const { dd, du } = columnSteps(L, col.down.length, col.up.length)
    col.down.forEach((c, i) => {
      poses.set(c, { x: p.x + jitter(c + salt, 6) * 2, y: p.y + i * dd, r: jitter(c + salt, 7) * 3, s: 1, f: 0, z: 300 + i })
      where.set(c, `t${ci}`)
    })
    col.up.forEach((c, i) => {
      poses.set(c, { x: p.x + jitter(c + salt, 8) * 2.5, y: p.y + col.down.length * dd + i * du, r: jitter(c + salt, 9) * 3, s: 1, f: 1, z: 330 + i })
      where.set(c, `t${ci}`)
    })
  })
  return { poses, where }
}

/** 放開手指時，指到的是哪一個可以放牌的地方 */
export function dropSpot(L: SolLayout, s: SolitaireState, x: number, y: number): Spot | null {
  for (let slot = 0; slot < 4; slot++) {
    const p = L.foundations[slot]
    if (Math.abs(x - p.x) < L.cw * 0.6 && Math.abs(y - p.y) < L.ch * 0.6) return { pile: 'foundation', slot }
  }
  for (let col = 0; col < 7; col++) {
    const p = L.cols[col]
    const c = s.tableau[col]
    const { dd, du } = columnSteps(L, c.down.length, c.up.length)
    const bottom = p.y + c.down.length * dd + Math.max(0, c.up.length - 1) * du + L.ch * 0.7
    if (Math.abs(x - p.x) < L.gap / 2 && y > p.y - L.ch * 0.6 && y < bottom) return { pile: 'tableau', col }
  }
  return null
}
