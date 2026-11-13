// 接龍互動教學的牌面（文字在 strings.ts）。每一課給一個小牌桌、過關條件、以及提示要亮哪裡。
import { parseCard as P, type Card } from '@/engine/bigtwo/cards'
import type { SolitaireState, Target } from '@/engine/solitaire/rules'

export interface SolLesson {
  build: () => SolitaireState
  done: (s: SolitaireState) => boolean
  hint: (s: SolitaireState) => { cards: Card[]; spot: Target | 'stock' | null }
}

function table(cols: Record<number, { down?: string[]; up?: string[] }>, stock: string[] = []): SolitaireState {
  return {
    stock: stock.map(P),
    waste: [],
    foundations: [[], [], [], []],
    tableau: Array.from({ length: 7 }, (_, i) => ({ down: (cols[i]?.down ?? []).map(P), up: (cols[i]?.up ?? []).map(P) })),
    draw: 1,
    score: 0,
    moves: 0,
    recycles: 0,
    won: false,
  }
}

export const SOL_LESSONS: SolLesson[] = [
  {
    build: () => table({ 2: { up: ['S9'] }, 4: { up: ['H8'] } }),
    done: (s) => s.tableau[2].up.includes(P('H8')),
    hint: () => ({ cards: [P('H8')], spot: { pile: 'tableau', col: 2 } }),
  },
  {
    build: () => table({ 1: { up: ['S9'] }, 3: { up: ['CA'] } }),
    done: (s) => s.foundations.some((f) => f.includes(P('CA'))),
    hint: () => ({ cards: [P('CA')], spot: { pile: 'foundation', slot: 0 } }),
  },
  {
    build: () => table({ 1: { down: ['D5'], up: ['C7'] }, 4: { up: ['H8'] } }),
    done: (s) => s.tableau[1].down.length === 0,
    hint: () => ({ cards: [P('C7')], spot: { pile: 'tableau', col: 4 } }),
  },
  {
    build: () => table({ 3: { down: ['C4'], up: ['SK', 'HQ'] }, 5: { up: ['D9'] } }),
    done: (s) => s.tableau[0].up[0] === P('SK'),
    hint: () => ({ cards: [P('SK'), P('HQ')], spot: { pile: 'tableau', col: 0 } }),
  },
  {
    build: () => table({ 2: { up: ['D4'] }, 5: { up: ['SQ'] } }, ['C3', 'HJ']),
    done: (s) => s.tableau[5].up.includes(P('HJ')),
    hint: (s) => (s.waste.length ? { cards: [s.waste[s.waste.length - 1]], spot: { pile: 'tableau', col: 5 } } : { cards: [], spot: 'stock' }),
  },
]
