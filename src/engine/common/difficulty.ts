// 難度：低、中、高、挑戰。只決定電腦「有多強」（算幾步、會不會失誤、亂下的程度），
// 對手的個性（愛進攻、愛守、偏好的下法）照舊由各自的打法參數決定。純資料與純函式，不依賴 UI。
import type { BigTwoStyle, ChessStyle, GoStyle, GomokuStyle } from './personas'

export type Level = 'low' | 'mid' | 'high' | 'master'
export const LEVELS: readonly Level[] = ['low', 'mid', 'high', 'master']
export const DEFAULT_LEVEL: Level = 'mid'

export const asLevel = (v: unknown): Level => (LEVELS.includes(v as Level) ? (v as Level) : DEFAULT_LEVEL)

/** 西洋棋、象棋：往後算幾步、在差不多的步裡亂挑的程度、隨手走一步的機率 */
const CHESS: Record<Level, Pick<ChessStyle, 'depth' | 'noise' | 'blunder'>> = {
  low: { depth: 1, noise: 0.7, blunder: 0.18 },
  mid: { depth: 2, noise: 0.4, blunder: 0.05 },
  high: { depth: 3, noise: 0.15, blunder: 0.01 },
  // 算 4 步在手機上太慢（一步要好幾秒），所以挑戰也是算 3 步，但完全不失誤、不亂挑
  master: { depth: 3, noise: 0, blunder: 0 },
}
export const chessAt = (st: ChessStyle, level: Level): ChessStyle => ({ ...st, ...CHESS[level] })

/** 五子棋：看不看得懂跳三跳四、亂挑的程度、漏看對手下一手就贏的機率 */
const GOMOKU: Record<Level, Pick<GomokuStyle, 'sharp' | 'noise' | 'blind'>> = {
  low: { sharp: false, noise: 0.65, blind: 0.4 },
  mid: { sharp: true, noise: 0.35, blind: 0.12 },
  high: { sharp: true, noise: 0.12, blind: 0.03 },
  master: { sharp: true, noise: 0, blind: 0 },
}
export const gomokuAt = (st: GomokuStyle, level: Level): GomokuStyle => {
  const out = { ...st, ...GOMOKU[level] }
  // 挑戰：攻守都不偏廢（太偏攻或太偏守都容易被抓到漏洞）
  if (level === 'master') {
    const avg = (st.attack + st.defense) / 2
    out.attack = Math.max(st.attack, avg)
    out.defense = Math.max(st.defense, avg)
  }
  return out
}

/** 圍棋：會不會算、亂挑的程度 */
const GO: Record<Level, Pick<GoStyle, 'skill' | 'noise'>> = {
  low: { skill: 0.15, noise: 0.65 },
  mid: { skill: 0.5, noise: 0.35 },
  high: { skill: 0.8, noise: 0.12 },
  master: { skill: 1, noise: 0.02 },
}
export const goAt = (st: GoStyle, level: Level): GoStyle => ({ ...st, ...GO[level] })

/** 大老二：會不會算、手滑的機率、判斷的搖擺程度 */
const BIGTWO: Record<Level, Pick<BigTwoStyle, 'skill' | 'blunder' | 'whim'>> = {
  low: { skill: 0.2, blunder: 0.15, whim: 0.7 },
  mid: { skill: 0.5, blunder: 0.06, whim: 0.4 },
  high: { skill: 0.8, blunder: 0.02, whim: 0.15 },
  master: { skill: 1, blunder: 0, whim: 0 },
}
export const bigtwoAt = (st: BigTwoStyle, level: Level): BigTwoStyle => {
  const out = { ...st, ...BIGTWO[level] }
  // 挑戰：一定會擋快出完的人
  if (level === 'master') out.block = Math.max(st.block, 0.9)
  return out
}
