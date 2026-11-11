// 五子棋互動教學的盤面（文字在 strings.ts）。座標為 [x, y]。
type XY = [number, number]

export interface GomokuLesson {
  black: XY[]
  white: XY[]
  /** 正確的落點 */
  targets: XY[]
  /** 一開始就標出正確位置 */
  showTargets?: boolean
}

export const GOMOKU_LESSONS: GomokuLesson[] = [
  {
    black: [[5, 7], [6, 7], [7, 7], [8, 7]],
    white: [[4, 7], [6, 8], [7, 8], [8, 6]],
    targets: [[9, 7]],
    showTargets: true,
  },
  {
    black: [[6, 4], [7, 6], [8, 7], [5, 7]],
    white: [[6, 5], [6, 6], [6, 7], [6, 8]],
    targets: [[6, 9]],
  },
  {
    black: [[6, 7], [7, 7], [8, 7]],
    white: [[7, 8], [6, 6], [8, 8]],
    targets: [[5, 7], [9, 7]],
  },
  {
    black: [[4, 10], [5, 9], [6, 8], [7, 7]],
    white: [[3, 11], [5, 8], [6, 7], [7, 8]],
    targets: [[8, 6]],
  },
]
