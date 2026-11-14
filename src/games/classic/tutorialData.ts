// 西洋棋、象棋互動教學的盤面（文字在 strings.ts）。玩家都是先走的一方（白／紅），棋盤在下面。
import { at, fromBoard as chessBoard, type ChessState } from '@/engine/chess/rules'
import { fromBoard as xqBoard, sq, type XiangqiState } from '@/engine/xiangqi/rules'

export interface ClassicLesson<S> {
  build: () => S
  /** 這一課只能動哪一顆子 */
  from: number
  /** 走完之後算不算過關 */
  done: (s: S) => boolean
}

const rows = (...r: string[]) => r.join('')
const E8 = '........'
const E9 = '.........'

export const CHESS_LESSONS: ClassicLesson<ChessState>[] = [
  // 馬走日
  { build: () => chessBoard(rows('....k...', E8, E8, E8, E8, E8, E8, '....K.N.')), from: at('g1'), done: (s) => s.board[at('g1')] === '' },
  // 兵斜吃
  { build: () => chessBoard(rows('....k...', E8, E8, '...n....', '....P...', E8, E8, '....K...')), from: at('e4'), done: (s) => s.board[at('d5')] === 'P' },
  // 王車易位
  {
    build: () => chessBoard(rows('....k...', E8, E8, E8, E8, E8, '.....PPP', '....K..R'), 'w', { wK: true, wQ: false, bK: false, bQ: false }),
    from: at('e1'),
    done: (s) => s.board[at('g1')] === 'K' && s.board[at('f1')] === 'R',
  },
  // 兵升變
  { build: () => chessBoard(rows('.......k', 'P.......', E8, E8, E8, E8, E8, '....K...')), from: at('a7'), done: (s) => s.board[at('a8')] !== '' && s.board[at('a8')] !== 'P' },
  // 一步將死（底線殺）
  { build: () => chessBoard(rows('......k.', '.....ppp', E8, E8, E8, E8, E8, '...Q..K.')), from: at('d1'), done: (s) => s.status === 'checkmate' },
]

export const XIANGQI_LESSONS: ClassicLesson<XiangqiState>[] = [
  // 傌走日
  { build: () => xqBoard(rows('...k.....', E9, E9, E9, E9, E9, E9, E9, E9, '.N...K...')), from: sq(9, 1), done: (s) => s.board[sq(9, 1)] === '' },
  // 蹩馬腿
  { build: () => xqBoard(rows('...k.....', E9, E9, E9, E9, E9, '....P....', '....N....', E9, '.....K...')), from: sq(7, 4), done: (s) => s.board[sq(7, 4)] === '' },
  // 炮隔子吃
  { build: () => xqBoard(rows('....k....', E9, '.r.......', E9, E9, '.P.......', E9, '.C.......', E9, '...K.....')), from: sq(7, 1), done: (s) => s.board[sq(2, 1)] === 'C' },
  // 過河兵橫走
  { build: () => xqBoard(rows('...k.....', E9, E9, '......P..', E9, E9, E9, E9, E9, '.....K...')), from: sq(3, 6), done: (s) => s.board[sq(3, 5)] === 'P' },
  // 一步將死
  { build: () => xqBoard(rows('...k.....', '.......R.', E9, E9, E9, E9, E9, E9, E9, '.....K..R')), from: sq(9, 8), done: (s) => s.winner === 'r' },
]
