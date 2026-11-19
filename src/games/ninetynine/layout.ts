// 九九的牌桌版面：座位、手牌沿用大老二的排法（tableLayout.ts）。
// 中間的桌框裡由左到右：牌堆（蓋著）、出過的牌（翻開，一張壓一張）、大大的總數。
// 有人爆了：他的牌先在自己面前攤開一下，再收到出過的牌底下。純計算，不碰 DOM。
import { cardPoses, hash, makeLayout, type Layout } from '@/games/bigtwo/tableLayout'
import type { Pose } from '@/games/bigtwo/cardStage'
import type { Card, NinetyNineState } from '@/engine/ninetynine/rules'

export interface NinetyNineLayout extends Layout {
  /** 桌面框 */
  box: { x: number; y: number; w: number; h: number }
  /** 牌堆、出過的牌、總數的中心 */
  deckAt: { x: number; y: number }
  playedAt: { x: number; y: number }
  totalAt: { x: number; y: number }
  /** 桌上的牌縮放倍率 */
  tableScale: number
  /** 爆掉的人攤牌的位置 */
  bustAt: { x: number; y: number }[]
}

export function ninetyNineLayout(W: number, H: number): NinetyNineLayout {
  const L = makeLayout(W, H)
  const { cw } = L
  const ch = (cw * 108) / 78
  const top = cw * 1.2
  const bottom = H - cw * 1.62
  const w = Math.min(W * 0.56, W - cw * 6.2)
  const box = { x: W / 2 - w / 2, y: top, w, h: bottom - top }
  // 框底下留一條給狀態文字
  const cy = box.y + (box.h - cw * 0.55) / 2
  const tableScale = Math.min(1, ((box.h - cw * 0.9) * 0.8) / ch)
  const deckAt = { x: box.x + box.w * 0.17, y: cy }
  return {
    ...L,
    // 發牌前牌都疊在牌堆的位置
    pile: deckAt,
    box,
    deckAt,
    playedAt: { x: box.x + box.w * 0.43, y: cy },
    totalAt: { x: box.x + box.w * 0.76, y: cy },
    tableScale,
    bustAt: [
      { x: W / 2, y: H - cw * 2.2 },
      { x: W - cw * 3.4, y: H * 0.4 },
      { x: W / 2, y: cw * 2.2 },
      { x: cw * 3.4, y: H * 0.4 },
    ],
  }
}

/** 每一張牌該在哪裡。bust：正在攤牌的人和他的牌（攤完才收到出過的牌底下） */
export function ninetyNinePoses(L: NinetyNineLayout, s: NinetyNineState, selected: Card | null, gathered: boolean, bust: { player: number; cards: Card[] } | null): Map<Card, Pose> {
  const { cw, tableScale: ts } = L
  // 發牌前、收牌時：所有牌整齊疊在牌堆的位置；等一下要發出去的牌在最上面（照發牌順序，第一張在最頂），
  // 發牌時一張張從頂上飛出去，牌堆本身不會亂動
  if (gathered) {
    const out = new Map<Card, Pose>()
    const dealOrder: Card[] = []
    for (let k = 0; k < Math.max(0, ...s.hands.map((h) => h.length)); k++) s.hands.forEach((h) => h[k] !== undefined && dealOrder.push(h[k]))
    const stack = [...s.played, ...s.deck.slice().reverse(), ...dealOrder.slice().reverse()]
    stack.forEach((c, i) => out.set(c, { x: L.deckAt.x - i * 0.12, y: L.deckAt.y - i * 0.16, r: hash(c, 1) * 3, s: ts * 0.86, f: 0, z: 20 + i }))
    return out
  }
  const out = cardPoses(L, { hands: s.hands, selected: selected === null ? [] : [selected], pile: [], discard: [], gathered })
  // 牌堆：蓋著疊起來，deck[0]（下一張要抽的）在最上面
  const n = s.deck.length
  s.deck.forEach((c, i) => {
    const k = n - 1 - i
    out.set(c, { x: L.deckAt.x - k * 0.12, y: L.deckAt.y - k * 0.16, r: hash(c, 1) * 3, s: ts * 0.86, f: 0, z: 20 + k })
  })
  // 出過的牌：最上面幾張散開一點看得出疊了好幾張，越下面越整齊
  const m = s.played.length
  s.played.forEach((c, i) => {
    const depth = m - 1 - i
    const spread = depth < 6 ? 1 : 0.35
    out.set(c, {
      x: L.playedAt.x + hash(c, 2) * cw * 0.5 * spread,
      y: L.playedAt.y + hash(c, 3) * cw * 0.3 * spread,
      r: hash(c, 4) * 34 * spread,
      s: ts,
      f: 1,
      z: 200 + i,
    })
  })
  // 爆掉的人：牌在他面前攤開
  if (bust) {
    const at = L.bustAt[bust.player]
    const k = bust.cards.length
    bust.cards.forEach((c, i) => {
      const d = i - (k - 1) / 2
      out.set(c, { x: at.x + d * cw * 0.62 * ts, y: at.y + Math.abs(d) * 2, r: d * 5, s: ts * 0.9, f: 1, z: 800 + i })
    })
  }
  return out
}
