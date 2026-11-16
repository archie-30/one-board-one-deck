// 排七的牌桌版面：座位、手牌沿用大老二的排法（tableLayout.ts），
// 中間的桌面是四排（黑桃、紅心、方塊、梅花），每排 A 到 K 由左到右，7 在正中間；
// 每個人蓋起來的牌疊在自己旁邊。純計算，不碰 DOM。
import { cardPoses, makeLayout, type Layout } from '@/games/bigtwo/tableLayout'
import type { Pose } from '@/games/bigtwo/cardStage'
import { rankOf, suitOf, type Card, type SevensState } from '@/engine/sevens/rules'

export interface SevensLayout extends Layout {
  /** 桌面框 */
  box: { x: number; y: number; w: number; h: number }
  /** 桌上的牌縮放倍率 */
  tableScale: number
  /** 每一排的高度（框底下留給狀態文字） */
  rowH: number
  /** 每個人蓋牌堆的位置 */
  coverAt: { x: number; y: number }[]
}

/** 由上往下：黑桃、紅心、方塊、梅花 */
export const ROW_ORDER = [3, 2, 1, 0]

export function sevensLayout(W: number, H: number): SevensLayout {
  const L = makeLayout(W, H)
  const { cw } = L
  const ch = (cw * 108) / 78
  const top = cw * 1.2
  const bottom = H - cw * 1.62
  const w = Math.min(W * 0.56, W - cw * 6.2)
  const box = { x: W / 2 - w / 2, y: top, w, h: bottom - top }
  // 桌框最下面留一條給狀態文字（輪到誰、提示），牌排在上面
  const rowH = (box.h - cw * 0.6) / 4
  const tableScale = Math.min((rowH * 0.9) / ch, (box.w / 9.2) / cw)
  return {
    ...L,
    box,
    tableScale,
    rowH,
    coverAt: [
      { x: cw * 2.25, y: H - cw * 0.85 },
      { x: W - cw * 2.15, y: H * 0.66 },
      { x: W / 2 - cw * 2.9, y: cw * 0.62 },
      { x: cw * 2.15, y: H * 0.66 },
    ],
  }
}

/** 每一張牌該在哪裡 */
export function sevensPoses(L: SevensLayout, s: SevensState, selected: Card | null, gathered: boolean): Map<Card, Pose> {
  const out = cardPoses(L, { hands: s.hands, selected: selected === null ? [] : [selected], pile: [], discard: [], gathered })
  if (gathered) return out
  const { box, tableScale, cw } = L
  const step = Math.min((box.w - cw * tableScale) / 12, cw * tableScale * 0.78)
  ROW_ORDER.forEach((suit, ri) => {
    const row = s.rows[suit]
    if (!row) return
    const y = box.y + L.rowH * (ri + 0.5) + cw * 0.08
    for (let r = row[0]; r <= row[1]; r++) {
      const c = suit * 13 + r - 1
      // 點數大的壓在點數小的上面：左右兩邊都是露出每張牌的左上角（點數、花色），跟左邊一樣好讀
      out.set(c, { x: box.x + box.w / 2 + (r - 7) * step, y, r: 0, s: tableScale, f: 1, z: 200 + ri * 20 + r })
    }
  })
  s.covered.forEach((pile, p) => {
    const at = L.coverAt[p]
    pile.forEach((c, k) => {
      const h = (c * 37) % 11
      out.set(c, { x: at.x + (h - 5) * 0.6 + k * 1.5, y: at.y - k * 1.2, r: (h - 5) * 2.2, s: 0.46, f: 0, z: 120 + k })
    })
  })
  return out
}

export const cardLabel = (c: Card) => ({ rank: rankOf(c), suit: suitOf(c) })
