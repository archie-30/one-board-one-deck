// 撿紅點牌桌版面：座位沿用大老二的位置；中間是桌上的牌，左邊是牌堆，每個人旁邊有自己收回來的牌。
// 純計算，不碰 DOM。
import type { Card } from '@/engine/bigtwo/cards'
import type { Pose } from '../bigtwo/cardStage'
import { hash, type Layout } from '../bigtwo/tableLayout'

export interface RpModel {
  hands: Card[][]
  table: Card[]
  pile: Card[]
  captured: Card[][]
  selected: Card | null
  /** 發牌前、收牌時：牌都在桌子中間 */
  gathered: boolean
  /** 每局不同的亂數，讓牌放下的位置與角度每局都不一樣 */
  salt?: number
}

export interface RpSpots {
  box: { x: number; y: number; w: number; h: number }
  pile: { x: number; y: number }
  reveal: { x: number; y: number }
  captured: { x: number; y: number; dir: 1 | -1 }[]
}

export function rpSpots(L: Layout): RpSpots {
  const { W, H, cw } = L
  const cx = W / 2 + cw * 0.45
  const cy = H * 0.43
  const box = { x: cx - cw * 3.5, y: cy - cw * 1.45, w: cw * 7, h: cw * 2.9 }
  // 牌堆放在桌面框的左邊，桌上的牌排在右邊剩下的空間
  const pile = { x: box.x + cw * 0.75, y: cy + cw * 0.05 }
  return {
    box,
    pile,
    reveal: { x: pile.x + cw * 0.95, y: pile.y - cw * 0.35 },
    captured: [
      { x: cw * 2.45, y: H - cw * 0.7, dir: 1 },
      { x: W - cw * 1.6, y: H * 0.72, dir: -1 },
      { x: W / 2 + cw * 2.6, y: cw * 0.6, dir: 1 },
      { x: cw * 1.6, y: H * 0.72, dir: 1 },
    ],
  }
}

const BACK = 0.48
const SMALL = 0.5

/** 疊在 target 上面的姿勢（吃牌時先飛過去壓在上面） */
export function onTop(base: Pose): Pose {
  const j = Math.random()
  return { ...base, x: base.x + 4 + j * 8, y: base.y - 6 - j * 6, r: base.r + (j - 0.5) * 30, f: 1, z: 640 }
}

export function rpPoses(L: Layout, m: RpModel): Map<Card, Pose> {
  const out = new Map<Card, Pose>()
  const { W, H, cw } = L
  const S = rpSpots(L)

  if (m.gathered) {
    for (let c = 0; c < 52; c++) out.set(c, { x: W / 2 - c * 0.25, y: H * 0.43 - c * 0.35, r: hash(c, 1) * 4, s: 0.62, f: 0, z: 10 + c })
    return out
  }

  // 你的手牌
  const mine = m.hands[0]
  const n = mine.length
  const gap = cw * 0.92
  mine.forEach((c, i) => {
    const k = i - (n - 1) / 2
    out.set(c, { x: W / 2 + cw * 0.4 + k * gap, y: H - cw * 0.74 + k * k * 1.2 - (m.selected === c ? cw * 0.34 : 0), r: k * 2.2, s: 1, f: 1, z: 300 + i })
  })
  // 對手的手牌（牌背）
  const top = m.hands[2]
  top.forEach((c, i) => {
    const k = i - (top.length - 1) / 2
    out.set(c, { x: W / 2 + cw * 0.6 + k * cw * 0.2, y: cw * 0.62, r: k * 2, s: BACK, f: 0, z: 100 + i })
  })
  for (const seat of [1, 3]) {
    const side = seat === 1 ? 1 : -1
    const hand = m.hands[seat]
    hand.forEach((c, i) => {
      const k = i - (hand.length - 1) / 2
      out.set(c, { x: seat === 1 ? W - cw * 2.15 : cw * 2.15, y: H * 0.3 + k * cw * 0.16, r: side * 90 + k * 1.6 * side, s: BACK, f: 0, z: 100 + i })
    })
  }

  // 桌上的牌：排成一到兩排
  const t = m.table.length
  const cols = t <= 6 ? Math.max(t, 1) : Math.ceil(t / 2)
  const rows = Math.ceil(t / cols)
  const sc = cols > 7 ? 0.7 : 0.82
  const cx = S.box.x + cw * 1.5 + (S.box.w - cw * 1.5) / 2
  const cy = S.box.y + S.box.h / 2
  m.table.forEach((c, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const k = c * 7 + (m.salt ?? 0)
    out.set(c, {
      x: cx + (col - (cols - 1) / 2) * cw * sc * 1.12 + hash(k, 2) * cw * 0.14,
      y: cy + (row - (rows - 1) / 2) * cw * sc * 1.5 + hash(k, 3) * cw * 0.14,
      r: hash(k, 4) * 18,
      s: sc,
      f: 1,
      z: 200 + i,
    })
  })

  // 牌堆
  m.pile.forEach((c, i) => {
    const k = m.pile.length - 1 - i
    out.set(c, { x: S.pile.x - k * 0.35, y: S.pile.y - k * 0.45, r: -3 + hash(c, 5) * 1.5, s: 0.82, f: 0, z: 40 + k })
  })

  // 收回來的牌：攤成一排，正面朝上
  m.captured.forEach((cards, p) => {
    const spot = S.captured[p]
    cards.forEach((c, k) => {
      const h = c * 7 + (m.salt ?? 0)
      out.set(c, { x: spot.x + spot.dir * k * cw * 0.16, y: spot.y + hash(h, 6) * cw * 0.08, r: hash(h, 7) * 14, s: SMALL, f: 1, z: 60 + k })
    })
  })
  return out
}
