// 圍棋開局棋譜（挑戰難度用）：照職業棋手的基本下法佈局。
//   1. 先佔空角：星位（4-4）或小目（3-4）
//   2. 四個角都有人之後，對方單獨一顆在角上（星位或小目、旁邊沒有我的子）就去掛角：
//      星位掛小飛（3-6）、小目掛小飛（3-5）
//   9 路：第一手下天元。
// 之後交給電腦用「試下到底」看整盤形勢（mc.ts）。純函式：只回傳棋譜上的點，挑哪個由呼叫的人決定。
import type { Color, GoState } from './rules'

/** 角上的局部座標（離兩條邊各幾格，0 起算）轉成棋盤編號；corner 0～3＝左上、右上、左下、右下 */
function fromCorner(size: number, corner: number, cx: number, cy: number): number {
  const x = corner % 2 ? size - 1 - cx : cx
  const y = corner >= 2 ? size - 1 - cy : cy
  return y * size + x
}

/** 每一手都有兩種方向（沿著兩條邊對稱） */
const both = (pts: [number, number][]) => pts.flatMap(([a, b]) => (a === b ? [[a, b] as [number, number]] : [[a, b] as [number, number], [b, a] as [number, number]]))

/** 棋譜上的下一手（可能好幾個一樣好的點）；沒有就是空陣列 */
export function goBookMoves(state: GoState): number[] {
  const { size, board } = state
  const me: Color = state.turn
  const stones = board.reduce((n: number, v) => n + (v ? 1 : 0), 0)
  if (size < 13) {
    const c = (size - 1) / 2
    return stones === 0 ? [c * size + c] : []
  }
  // 佈局階段才照棋譜
  if (stones > size * 1.4) return []
  const R = size >= 19 ? 6 : 5
  const out: number[] = []
  const approaches: number[] = []
  for (let corner = 0; corner < 4; corner++) {
    const inCorner: { cx: number; cy: number; v: number }[] = []
    for (let cy = 0; cy <= R; cy++)
      for (let cx = 0; cx <= R; cx++) {
        const v = board[fromCorner(size, corner, cx, cy)]
        if (v) inCorner.push({ cx, cy, v })
      }
    // 空角：星位、小目
    if (!inCorner.length) {
      for (const [cx, cy] of both([[3, 3], [2, 3]])) out.push(fromCorner(size, corner, cx, cy))
      continue
    }
    // 對方單獨一顆在星位或小目：掛角
    if (inCorner.length === 1 && inCorner[0].v !== me) {
      const { cx, cy } = inCorner[0]
      if (cx === 3 && cy === 3) approaches.push(fromCorner(size, corner, 2, 5), fromCorner(size, corner, 5, 2))
      else if (cx === 2 && cy === 3) approaches.push(fromCorner(size, corner, 4, 2))
      else if (cx === 3 && cy === 2) approaches.push(fromCorner(size, corner, 2, 4))
    }
  }
  return out.length ? out : approaches
}
