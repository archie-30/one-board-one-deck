// 圍棋互動教學的盤面（9 路，文字在 strings.ts）。X 黑、O 白、. 空；都是黑棋下。
export interface GoLesson {
  rows: string[]
  /** 正確的落點 [x, y] */
  targets: [number, number][]
  /** 一開始就標出正確位置 */
  showTargets?: boolean
}

const E = '.........'

export const GO_LESSONS: GoLesson[] = [
  { rows: [E, E, E, '....X....', '...XOX...', E, E, E, E], targets: [[4, 5]], showTargets: true },
  { rows: [E, E, E, '....O....', '...OXO...', E, E, E, E], targets: [[4, 5]] },
  { rows: [E, E, E, E, E, E, 'OOOOOOO..', 'XXXXXXO..', 'XX...XO..'], targets: [[3, 8]] },
  { rows: [E, E, E, '...XO....', '..XO.O...', '...XO....', E, E, E], targets: [[4, 4]], showTargets: true },
  { rows: ['...XO....', '...XO....', '...XO....', '...XO....', '....O....', '...XO....', '...XO....', '...XO....', '...XO....'], targets: [[3, 4]] },
]
