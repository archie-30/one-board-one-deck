// 新接龍互動教學的牌面（文字在 strings.ts）。
import { parseCard as P, type Card } from '@/engine/bigtwo/cards'
import type { FreeCellState, Target } from '@/engine/freecell/rules'

export interface FreeCellLesson {
  build: () => FreeCellState
  done: (s: FreeCellState) => boolean
  hint: (s: FreeCellState) => { cards: Card[]; spot: Target | null }
}

function table(cols: Record<number, string[]>): FreeCellState {
  return { cells: [null, null, null, null], foundations: [[], [], [], []], tableau: Array.from({ length: 8 }, (_, i) => (cols[i] ?? []).map(P)), moves: 0, won: false }
}

export const FREECELL_LESSONS: FreeCellLesson[] = [
  {
    build: () => table({ 2: ['D4', 'S9'], 5: ['C6', 'H8'] }),
    done: (s) => s.tableau[2].includes(P('H8')),
    hint: () => ({ cards: [P('H8')], spot: { pile: 'tableau', col: 2 } }),
  },
  {
    build: () => table({ 1: ['S7'], 3: ['D6', 'HK'] }),
    done: (s) => s.cells.includes(P('HK')),
    hint: () => ({ cards: [P('HK')], spot: { pile: 'cell', slot: 0 } }),
  },
  {
    build: () => table({ 1: ['S7', 'DA'], 4: ['C9'] }),
    done: (s) => s.foundations[1].length === 1,
    hint: () => ({ cards: [P('DA')], spot: { pile: 'foundation', slot: 1 } }),
  },
  {
    build: () => table({ 0: ['C2', 'H10', 'S9', 'H8'], 1: ['D3'], 2: ['C4'], 3: ['S2'], 4: ['CJ'], 5: ['H5'], 6: ['D6'], 7: ['C7'] }),
    done: (s) => s.tableau[4].length === 4,
    hint: () => ({ cards: [P('H10'), P('S9'), P('H8')], spot: { pile: 'tableau', col: 4 } }),
  },
]
