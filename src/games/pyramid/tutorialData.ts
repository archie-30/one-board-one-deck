// 金字塔接龍互動教學的牌面（文字在 strings.ts）。每一課給一個小金字塔、過關條件、以及提示要亮哪裡。
// 最下面一排是第 21～27 格，倒數第二排是第 15～20 格（第 16 格壓在 22、23 格上面）。
import { parseCard as P, type Card } from '@/engine/bigtwo/cards'
import { PYRAMID, type PyramidState } from '@/engine/pyramid/rules'

export interface PyramidLesson {
  build: () => PyramidState
  done: (s: PyramidState) => boolean
  hint: (s: PyramidState) => { cards: Card[]; stock: boolean }
}

/** 照牌面文字擺牌：cells 是「第幾格 → 牌」，stock 最後一張在最上面 */
function table(cells: Record<number, string>, stock: string[] = []): PyramidState {
  const pyramid = Array.from({ length: PYRAMID }, (_, i) => (cells[i] ? P(cells[i]) : null))
  return { pyramid, stock: stock.map(P), waste: [], gone: [], recyclesLeft: 0, score: 0, moves: 0, penalty: 0, won: false }
}
const row = (start: number, cards: string[]) => Object.fromEntries(cards.map((c, k) => [start + k, c]))
const gone = (s: PyramidState, card: string) => s.gone.includes(P(card))

export const PYRAMID_LESSONS: PyramidLesson[] = [
  {
    build: () => table({ ...row(15, ['C9', 'HJ', 'D5', 'S10', 'H4', 'C8']), ...row(21, ['C2', 'S6', 'H7', 'D9', 'C3', 'H5', 'S3']) }),
    done: (s) => gone(s, 'S6') && gone(s, 'H7'),
    hint: () => ({ cards: [P('S6'), P('H7')], stock: false }),
  },
  {
    build: () => table({ ...row(15, ['C9', 'HJ', 'D5', 'S10', 'H4', 'C8']), ...row(21, ['C2', 'D6', 'SK', 'D9', 'C3', 'H5', 'S3']) }),
    done: (s) => gone(s, 'SK'),
    hint: () => ({ cards: [P('SK')], stock: false }),
  },
  {
    build: () => table({ ...row(15, ['C9', 'H8', 'D5', 'S10', 'H4', 'C7']), ...row(21, ['C2', 'HQ', 'DA', 'D9', 'C3', 'H6', 'S3']) }),
    done: (s) => s.pyramid[16] !== null && s.pyramid[22] === null && s.pyramid[23] === null,
    hint: () => ({ cards: [P('HQ'), P('DA')], stock: false }),
  },
  {
    build: () => table({ ...row(15, ['C9', 'HJ', 'D4', 'S10', 'H4', 'C7']), ...row(21, ['C2', 'D6', 'C8', 'D9', 'C3', 'H6', 'S3']) }, ['H5']),
    done: (s) => gone(s, 'H5') && gone(s, 'C8'),
    hint: (s) => (s.stock.length ? { cards: [], stock: true } : { cards: [P('H5'), P('C8')], stock: false }),
  },
]
