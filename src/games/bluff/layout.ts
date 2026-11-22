// 吹牛的牌桌版面：座位、手牌沿用大老二的排法（tableLayout.ts）。
// 中間的桌框裡由左到右：收掉的牌（蓋著疊一疊，放在左下角，左上角留給「誰說了什麼」）、這一輪蓋著的牌（一手一手亂亂地疊在中間）、喊的點數（大大的）。
// 有人喊「吹牛」時，被抓的那一手翻開排在牌堆上面給大家看。純計算，不碰 DOM。
import { cardPoses, hash, makeLayout, type Layout } from '@/games/bigtwo/tableLayout'
import type { Pose } from '@/games/bigtwo/cardStage'
import { quadCards, type BluffState, type Card } from '@/engine/bluff/rules'

export interface BluffLayout extends Layout {
  /** 桌面框 */
  box: { x: number; y: number; w: number; h: number }
  /** 收掉的牌、桌上這一輪的牌、喊的點數的中心 */
  discardAt: { x: number; y: number }
  /** 收掉的牌的縮放（小小一疊塞在左下角） */
  discardScale: number
  /** 點數按鈕那一排從哪裡開始（左下角讓給收掉的牌） */
  ranksLeft: number
  pileAt: { x: number; y: number }
  claimAt: { x: number; y: number }
  /** 桌上的牌縮放倍率 */
  tableScale: number
}

export function bluffLayout(W: number, H: number): BluffLayout {
  const L = makeLayout(W, H)
  const { cw } = L
  const ch = (cw * 108) / 78
  const top = cw * 1.2
  // 比排七高一點：手牌選起來會往上浮，不能蓋到桌框底下的狀態文字
  const bottom = H - cw * 2
  const w = Math.min(W * 0.56, W - cw * 6.2)
  const box = { x: W / 2 - w / 2, y: top, w, h: bottom - top }
  // 框底下留一條給狀態文字（帶頭時上面再多一排點數按鈕）
  const cy = box.y + (box.h - cw * 1.3) / 2 + cw * 0.1
  const tableScale = Math.min(0.9, ((box.h - cw * 1.4) * 0.75) / ch)
  const pileAt = { x: box.x + box.w * 0.45, y: cy }
  // 收掉的牌：小小一疊塞在桌框左下角，底邊貼著狀態文字那一條上緣（左上角是「誰說了什麼」，不能蓋到；
  // 桌框矮的時候上面沒空間，所以跟點數按鈕同一高度，按鈕那一排從它右邊開始）
  const discardScale = tableScale * 0.62
  const dw = cw * discardScale
  const dh = ch * discardScale
  const discardAt = { x: box.x + cw * 0.18 + dw / 2, y: box.y + box.h - cw * 0.5 - dh / 2 }
  const ranksLeft = box.x + cw * 0.18 + dw + cw * 0.16
  return {
    ...L,
    // 發牌前牌都疊在桌子中間
    pile: pileAt,
    box,
    discardAt,
    discardScale,
    ranksLeft,
    pileAt,
    claimAt: { x: box.x + box.w * 0.8, y: cy },
    tableScale,
  }
}

/**
 * 每一張牌該在哪裡。
 * reveal：正在翻開給大家看的那一手（翻成正面、排一排放在牌堆上）；showAll：結束了，大家的手牌翻開
 */
export function bluffPoses(L: BluffLayout, s: BluffState, selected: readonly Card[], gathered: boolean, reveal: readonly Card[] | null, showAll: boolean, opened = true): Map<Card, Pose> {
  const out = cardPoses(L, { hands: s.hands, selected: selected.slice(), pile: [], discard: [], gathered })
  if (gathered) return out
  const { cw, tableScale: ts } = L
  if (showAll) for (let p = 1; p < 4; p++) for (const c of s.hands[p]) out.set(c, { ...out.get(c)!, f: 1 })
  // 收掉的牌：一疊，往右上錯開一點點（四張一樣棄掉的墊在下面）
  const q0 = (s.quads?.length ?? 0) * 4
  const lift = (k: number) => Math.min(k, 16) * 0.2
  s.discard.forEach((c, k) => out.set(c, { x: L.discardAt.x + hash(c, 3) * 2 + lift(k + q0) * 0.6, y: L.discardAt.y + hash(c, 4) * 2 - lift(k + q0), r: hash(c, 5) * 4, s: L.discardScale, f: 0, z: 100 + k }))
  // 四張一樣棄掉的：不另外擺出來，蓋著墊在收掉的牌最下面
  ;(s.quads ?? []).flatMap((q) => quadCards(q.rank)).forEach((c, k) => out.set(c, { x: L.discardAt.x + hash(c, 3) * 2 + lift(k) * 0.6, y: L.discardAt.y + hash(c, 4) * 2 - lift(k), r: hash(c, 5) * 4, s: L.discardScale, f: 0, z: 40 + k }))
  // 這一輪的牌：一手一手亂亂地疊在中間（每一手往不同方向偏一點、轉一個角度）
  let z = 300
  s.plays.forEach((play, i) => {
    const ox = hash(i * 13 + play.player, 7) * cw * 0.9
    const oy = hash(i * 17 + play.player, 8) * cw * 0.45
    const rot = hash(i * 7 + play.player, 9) * 40
    play.cards.forEach((c, k) => out.set(c, { x: L.pileAt.x + ox + (k - (play.cards.length - 1) / 2) * cw * 0.16, y: L.pileAt.y + oy, r: rot + (k - (play.cards.length - 1) / 2) * 5, s: ts, f: 0, z: z++ }))
  })
  // 被抓的那一手：先從牌堆裡拿起來（還蓋著、放大一點），再一張張翻開排一排，壓在最上面
  if (reveal) {
    const n = reveal.length
    const gap = cw * ts * 1.12
    // 桌框矮的螢幕：往下挪，不蓋到左上角三行「誰說了什麼」
    const y0 = Math.max(L.pileAt.y, L.box.y + cw * 0.8 + ((cw * 108) / 78) * ts * 0.56)
    reveal.forEach((c, k) => out.set(c, { x: L.pileAt.x + (k - (n - 1) / 2) * gap * (opened ? 1 : 0.45), y: y0 - cw * (opened ? 0.12 : 0.3), r: opened ? 0 : (k - (n - 1) / 2) * 6, s: ts * (opened ? 1.05 : 1.12), f: opened ? 1 : 0, z: 900 + k }))
  }
  return out
}
