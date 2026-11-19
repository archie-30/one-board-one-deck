// 蜘蛛接龍互動教學的牌面（文字在 strings.ts）。每一課給一個小牌桌、過關條件、以及提示要亮哪裡。
import { parseCard as P, type Card } from '@/engine/bigtwo/cards'
import type { SpiderState } from '@/engine/spider/rules'

export interface SpiderLesson {
  build: () => SpiderState
  done: (s: SpiderState) => boolean
  hint: (s: SpiderState) => { cards: Card[]; spot: number | 'stock' | null }
}

/** 照牌面文字擺牌（每張牌給一個編號，牌面記在 faces） */
function table(cols: Record<number, { down?: string[]; up?: string[] }>, stock: string[] = []): SpiderState {
  const faces: number[] = []
  const id = (t: string) => faces.push(P(t)) - 1
  const tableau = Array.from({ length: 10 }, (_, i) => ({ down: (cols[i]?.down ?? []).map(id), up: (cols[i]?.up ?? []).map(id) }))
  return { suits: 4, faces, stock: stock.map(id), tableau, done: [], score: 500, moves: 0, penalty: 0, won: false }
}
/** 第 col 疊翻開的第 i 張 */
const at = (s: SpiderState, col: number, i = 0) => s.tableau[col].up[i]
const KQ2 = ['K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'].map((r) => `S${r}`)

export const SPIDER_LESSONS: SpiderLesson[] = [
  {
    build: () => table({ 2: { down: ['C4'], up: ['S9'] }, 5: { down: ['D3'], up: ['H8'] } }),
    done: (s) => s.tableau[2].up.length === 2,
    hint: (s) => ({ cards: [at(s, 5)], spot: 2 }),
  },
  {
    build: () => table({ 1: { down: ['C2'], up: ['S8', 'S7', 'S6'] }, 4: { up: ['H9'] }, 7: { up: ['D8', 'S7'] } }),
    done: (s) => s.tableau[4].up.length === 4,
    hint: (s) => ({ cards: s.tableau[1].up.slice(), spot: 4 }),
  },
  {
    build: () => table({ 0: { down: ['H5'], up: KQ2 }, 1: { up: ['SA'] } }),
    done: (s) => s.done.length === 1,
    hint: (s) => ({ cards: s.tableau[1].up.slice(), spot: 0 }),
  },
  {
    build: () =>
      table(
        Object.fromEntries(['S5', 'H9', 'DK', 'C3', 'S10', 'H2', 'D7', 'CJ', 'S4', 'HQ'].map((c, i) => [i, { up: [c] }])),
        ['S6', 'H8', 'DQ', 'C2', 'S9', 'HA', 'D6', 'C10', 'S3', 'HJ'],
      ),
    done: (s) => !s.stock.length,
    hint: () => ({ cards: [], spot: 'stock' }),
  },
]
