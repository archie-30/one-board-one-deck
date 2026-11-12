// 牌桌版面：依畫面大小算出每個座位、牌堆、棄牌堆的位置，以及每張牌該在哪裡。
// 純計算，不碰 DOM。座位：0 下（你）、1 右、2 上、3 左（出牌順序也是這樣）。
import type { Card } from '@/engine/bigtwo/cards'
import type { Pose } from './cardStage'

export interface PileGroup {
  id: number
  cards: Card[]
  from: number
}

export interface TableModel {
  hands: Card[][]
  selected: Card[]
  pile: PileGroup[]
  discard: Card[]
  /** 發牌前、收牌時：牌都在桌子中間的牌堆 */
  gathered: boolean
}

export interface Seat {
  /** 小人中心 x、腳底 y、寬度 */
  kid: { x: number; y: number; w: number }
  /** 名字標籤的位置與對齊 */
  label: { x: number; y: number; align: 'left' | 'center' | 'right' }
  /** 「過」印章的位置 */
  stamp: { x: number; y: number }
}

export interface Layout {
  W: number
  H: number
  /** 手牌一張牌的寬度（px） */
  cw: number
  seats: Seat[]
  pile: { x: number; y: number }
  discard: { x: number; y: number }
}

/** 由編號算出固定的亂數（同一手牌每次都落在同一個位置） */
export function hash(n: number, k: number): number {
  const x = Math.sin(n * 127.1 + k * 311.7) * 43758.5453
  return x - Math.floor(x) - 0.5
}

export function makeLayout(W: number, H: number): Layout {
  const cw = Math.min(H * 0.2, W * 0.08)
  const kw = cw * 1.05
  return {
    W,
    H,
    cw,
    seats: [
      { kid: { x: cw * 0.85, y: H - 4, w: kw * 0.95 }, label: { x: cw * 0.85, y: H - kw * 1.5 - 8, align: 'center' }, stamp: { x: W / 2, y: H - cw * 1.95 } },
      { kid: { x: W - cw * 0.8, y: H * 0.47, w: kw }, label: { x: W - cw * 0.8, y: H * 0.47 + 4, align: 'center' }, stamp: { x: W - cw * 2.2, y: H * 0.3 } },
      { kid: { x: W / 2 - cw * 1.75, y: kw * 1.42 + 2, w: kw }, label: { x: W / 2 - cw * 2.35, y: kw * 0.55, align: 'right' }, stamp: { x: W / 2 + cw * 0.6, y: cw * 0.95 } },
      { kid: { x: cw * 0.8, y: H * 0.47, w: kw }, label: { x: cw * 0.8, y: H * 0.47 + 4, align: 'center' }, stamp: { x: cw * 2.2, y: H * 0.3 } },
    ],
    pile: { x: W / 2, y: H * 0.42 },
    discard: { x: W / 2 + cw * 2.7, y: H * 0.47 },
  }
}

const BACK = 0.48
const PILE = 0.8

/** 算出所有牌的目標姿勢 */
export function cardPoses(L: Layout, m: TableModel): Map<Card, Pose> {
  const out = new Map<Card, Pose>()
  const { W, H, cw } = L

  if (m.gathered) {
    for (let c = 0; c < 52; c++) out.set(c, { x: L.pile.x - c * 0.25, y: L.pile.y - c * 0.35, r: hash(c, 1) * 4, s: 0.62, f: 0, z: 10 + c })
    return out
  }

  // 你的手牌：微微拱起的扇形
  const mine = m.hands[0]
  const n = mine.length
  const span = W * 0.5
  const gap = n > 1 ? Math.min(cw * 0.62, (span - cw) / (n - 1)) : 0
  mine.forEach((c, i) => {
    const k = i - (n - 1) / 2
    out.set(c, {
      x: W / 2 + k * gap,
      y: H - cw * 0.74 + k * k * 0.9 - (m.selected.includes(c) ? cw * 0.32 : 0),
      r: k * 1.3,
      s: 1,
      f: 1,
      z: 300 + i,
    })
  })

  // 上方對手：橫向一排牌背
  const top = m.hands[2]
  top.forEach((c, i) => {
    const k = i - (top.length - 1) / 2
    out.set(c, { x: W / 2 + cw * 0.6 + k * cw * 0.17, y: cw * 0.62, r: k * 1.6, s: BACK, f: 0, z: 100 + i })
  })
  // 左右對手：直向一排牌背
  for (const seat of [1, 3]) {
    const side = seat === 1 ? 1 : -1
    const hand = m.hands[seat]
    hand.forEach((c, i) => {
      const k = i - (hand.length - 1) / 2
      out.set(c, { x: seat === 1 ? W - cw * 2.15 : cw * 2.15, y: H * 0.3 + k * cw * 0.13, r: side * 90 + k * 1.4 * side, s: BACK, f: 0, z: 100 + i })
    })
  }

  // 牌堆：每一手各有自己的落點與角度，一手疊在一手上
  m.pile.forEach((g, gi) => {
    const ax = L.pile.x + hash(g.id, 1) * cw * 1.3
    const ay = L.pile.y + hash(g.id, 2) * cw * 0.5
    const ar = hash(g.id, 3) * 22
    const rad = (ar * Math.PI) / 180
    const step = cw * PILE * 0.44
    g.cards.forEach((c, k) => {
      const d = (k - (g.cards.length - 1) / 2) * step
      out.set(c, {
        x: ax + Math.cos(rad) * d,
        y: ay + Math.sin(rad) * d,
        r: ar + hash(c, 4) * 6,
        s: PILE,
        f: 1,
        z: 200 + gi * 6 + k,
      })
    })
  })

  // 棄牌堆：一輪結束後被推到旁邊、蓋起來的牌
  m.discard.forEach((c, i) => {
    out.set(c, { x: L.discard.x + hash(c, 5) * cw * 0.5, y: L.discard.y + hash(c, 6) * cw * 0.3 - i * 0.3, r: hash(c, 7) * 40, s: 0.6, f: 0, z: 20 + i })
  })
  return out
}
