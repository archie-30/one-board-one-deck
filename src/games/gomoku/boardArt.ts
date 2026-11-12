// 棋盤的畫法（代表圖與對局棋盤共用）：淺木色打底、深一階的木紋與暗面排線、鉛筆格線、粗墨線外框
import { TONE, rectPts, type Prim, type Pt } from '@/ui/art/ink'

/** x0,y0 = 棋盤左上角；side = 邊長；n = 每邊幾條線；pad = 邊緣到第一條線的距離 */
/** detail：畫面上放得越大就給越大的值，線條與排線會跟著變細變密 */
export function boardPrims(x0: number, y0: number, side: number, n: number, pad: number, lineW: number, detail = 1): { under: Prim[]; edge: Prim[] } {
  const x1 = x0 + side
  const y1 = y0 + side
  const u = side / 100 / detail
  const under: Prim[] = [
    { k: 'hatch', pts: [[x0 + 5 * u, y1], [x1, y1], [x1, y0 + 5 * u], [x1 + 5 * u, y0 + 5 * u], [x1 + 5 * u, y1 + 5 * u], [x0 + 5 * u, y1 + 5 * u]], tone: TONE.near, spacing: 1.7 * u, width: 0.5 * u, angle: -0.9, cross: true, opacity: 0.75 },
    { k: 'fill', pts: rectPts(x0, y0, side, side), tone: TONE.kraftL },
  ]
  // 木紋：幾筆長長的、深一階的線
  for (let i = 0; i < 9; i++) {
    const y = y0 + side * (0.06 + i * 0.108 + ((i * 37) % 5) * 0.006)
    const pts: Pt[] = [
      [x0 + side * (((i * 13) % 4) * 0.03), y],
      [x0 + side * 0.35, y + ((i % 3) - 1) * 1.1 * u],
      [x0 + side * 0.7, y + ((i % 2) - 0.5) * 1.6 * u],
      [x1 - side * (((i * 7) % 5) * 0.03), y + ((i % 3) - 1) * 0.8 * u],
    ]
    under.push({ k: 'path', pts, w: (0.9 + (i % 3) * 0.5) * u, tone: TONE.kraftM, opacity: 0.4, taper: 0.1 })
  }
  // 暗面：下緣與右緣
  under.push({ k: 'hatch', pts: [[x0, y1 - 9 * u], [x1, y1 - 5 * u], [x1, y1], [x0, y1]], tone: TONE.kraftM, spacing: 1.8 * u, width: 0.5 * u, angle: -0.9 })
  under.push({ k: 'hatch', pts: [[x1 - 5 * u, y0], [x1, y0], [x1, y1], [x1 - 8 * u, y1]], tone: TONE.kraftM, spacing: 2 * u, width: 0.5 * u, angle: -0.9, opacity: 0.8 })
  const step = (side - pad * 2) / (n - 1)
  for (let i = 0; i < n; i++) {
    const p = pad + i * step
    under.push({ k: 'path', pts: [[x0 + pad, y0 + p], [x1 - pad, y0 + p]], w: lineW, tone: TONE.kraftD, opacity: 0.85, taper: 0.5 })
    under.push({ k: 'path', pts: [[x0 + p, y0 + pad], [x0 + p, y1 - pad]], w: lineW, tone: TONE.kraftD, opacity: 0.85, taper: 0.5 })
  }
  return { under, edge: [{ k: 'poly', pts: rectPts(x0, y0, side, side), w: 1.5 * u, tone: TONE.ink }] }
}
