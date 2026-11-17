// 難度：低、中、高、挑戰。難度決定電腦「有多強」（算幾步、會不會失誤、亂下的程度），
// 對手的個性（愛進攻、愛守、偏好的下法）照舊由各自的打法參數決定，
// 另外每位對手在每個難度還有一個自己的「小習慣」（HABITS），只微調個性、不改變強弱。
// 純資料與純函式，不依賴 UI。
import type { BigTwoStyle, ChessStyle, GoStyle, GomokuStyle, OthelloStyle } from './personas'

export type Level = 'low' | 'mid' | 'high' | 'master'
export const LEVELS: readonly Level[] = ['low', 'mid', 'high', 'master']
export const DEFAULT_LEVEL: Level = 'mid'

export const asLevel = (v: unknown): Level => (LEVELS.includes(v as Level) ? (v as Level) : DEFAULT_LEVEL)

const clamp = (v: number) => Math.max(0, Math.min(1, v))

// ── 小習慣 ──
/**
 * rush 急著進攻、turtle 縮著守、center 搶中央、edge 愛走邊角、hoard 大牌捨不得出、
 * bomb 愛用炸彈／愛換子、block 盯著別人擋、calm 慢慢來（不急著壓）、
 * pairs／combo／small 大老二自由出牌時改成愛出對子／五張／小牌
 */
export type Habit = 'rush' | 'turtle' | 'center' | 'edge' | 'hoard' | 'bomb' | 'block' | 'calm' | 'pairs' | 'combo' | 'small'

/** 每位對手在 低／中／高／挑戰 各自的小習慣；順序對應 personas.ts 的 PERSONAS */
export const HABITS: readonly (readonly [Habit, Habit, Habit, Habit])[] = [
  ['rush', 'calm', 'block', 'center'], // 0 阿明
  ['turtle', 'hoard', 'combo', 'block'], // 1 小美
  ['rush', 'bomb', 'rush', 'edge'], // 2 老王
  ['bomb', 'bomb', 'rush', 'combo'], // 3 阿豪
  ['calm', 'edge', 'small', 'turtle'], // 4 小花
  ['pairs', 'turtle', 'center', 'hoard'], // 5 阿土伯
  ['turtle', 'block', 'hoard', 'calm'], // 6 美玲
  ['combo', 'rush', 'bomb', 'combo'], // 7 志明
  ['rush', 'center', 'bomb', 'rush'], // 8 春嬌
  ['edge', 'rush', 'calm', 'bomb'], // 9 阿福
  ['calm', 'hoard', 'turtle', 'hoard'], // 10 小胖
  ['block', 'center', 'block', 'rush'], // 11 阿珠
  ['rush', 'bomb', 'rush', 'bomb'], // 12 阿雄
  ['combo', 'center', 'turtle', 'center'], // 13 秀琴
  ['small', 'calm', 'center', 'turtle'], // 14 建國
  ['center', 'block', 'hoard', 'block'], // 15 淑芬
  ['edge', 'small', 'rush', 'calm'], // 16 阿寶
  ['hoard', 'edge', 'bomb', 'edge'], // 17 小黑
  ['rush', 'rush', 'combo', 'rush'], // 18 阿達
  ['turtle', 'pairs', 'block', 'center'], // 19 阿蓮
  ['rush', 'combo', 'block', 'rush'], // 20 阿傑
  ['turtle', 'calm', 'hoard', 'turtle'], // 21 小芳
  ['bomb', 'rush', 'bomb', 'rush'], // 22 阿偉
  ['edge', 'center', 'small', 'calm'], // 23 佩佩
  ['calm', 'block', 'center', 'hoard'], // 24 大頭
  ['rush', 'combo', 'rush', 'bomb'], // 25 阿翔
  ['hoard', 'turtle', 'hoard', 'block'], // 26 小琪
  ['pairs', 'pairs', 'center', 'turtle'], // 27 阿國
  ['block', 'calm', 'rush', 'center'], // 28 惠美
  ['small', 'edge', 'calm', 'block'], // 29 阿德
]

/** 這位對手（編號 who）在這個難度的小習慣；不認得的對手沒有習慣 */
export const habitOf = (who: number, level: Level): Habit | null => HABITS[who]?.[LEVELS.indexOf(level)] ?? null

function chessHabit(st: ChessStyle, h: Habit | null): ChessStyle {
  const o = { ...st }
  if (h === 'rush') o.attack = clamp(o.attack + 0.3)
  else if (h === 'turtle' || h === 'hoard') o.safety = clamp(o.safety + 0.3)
  else if (h === 'bomb') ((o.attack = clamp(o.attack + 0.2)), (o.safety = clamp(o.safety - 0.1)))
  else if (h === 'calm' || h === 'block') o.safety = clamp(o.safety + 0.15)
  return o
}
function gomokuHabit(st: GomokuStyle, h: Habit | null): GomokuStyle {
  const o = { ...st }
  if (h === 'rush' || h === 'bomb') o.attack *= 1.15
  else if (h === 'turtle' || h === 'block') o.defense *= 1.15
  else if (h === 'center') o.center = clamp(o.center + 0.3)
  else if (h === 'edge') o.center = clamp(o.center - 0.3)
  return o
}
function goHabit(st: GoStyle, h: Habit | null): GoStyle {
  const o = { ...st }
  if (h === 'rush' || h === 'bomb') o.attack = clamp(o.attack + 0.25)
  else if (h === 'turtle' || h === 'block' || h === 'hoard') o.defense = clamp(o.defense + 0.25)
  else if (h === 'center') o.center = clamp(o.center + 0.3)
  else if (h === 'edge') o.center = clamp(o.center - 0.3)
  return o
}
function bigtwoHabit(st: BigTwoStyle, h: Habit | null): BigTwoStyle {
  const o = { ...st }
  if (h === 'rush') o.aggression = clamp(o.aggression + 0.2)
  else if (h === 'calm' || h === 'turtle') o.aggression = clamp(o.aggression - 0.2)
  else if (h === 'hoard') o.hoard = clamp(o.hoard + 0.25)
  else if (h === 'bomb') o.bomb = clamp(o.bomb + 0.3)
  else if (h === 'block') o.block = clamp(o.block + 0.2)
  else if (h === 'pairs' || h === 'combo' || h === 'small') o.lead = h
  return o
}

// ── 強弱 ──
/**
 * 西洋棋、象棋：
 *   低：只看一步，而且看不到對方會吃回來（常常白送子），常常隨手走
 *   中：只看一步，但會把吃來吃去算完；偶爾隨手走
 *   高：看兩步，很少失誤
 *   挑戰：看三步、想得更廣（局面上限多一半），完全不失誤
 * （算 4 步在手機上一步要好幾秒，所以挑戰也是 3 步）
 */
const CHESS: Record<Level, Pick<ChessStyle, 'depth' | 'noise' | 'blunder' | 'quiet' | 'nodes'>> = {
  low: { depth: 1, quiet: 0, noise: 0.8, blunder: 0.3 },
  mid: { depth: 1, quiet: 3, noise: 0.35, blunder: 0.08 },
  high: { depth: 2, quiet: 3, noise: 0.12, blunder: 0.02 },
  master: { depth: 3, quiet: 4, noise: 0, blunder: 0, nodes: 90000 },
}
export const chessAt = (st: ChessStyle, level: Level, who = -1): ChessStyle => chessHabit({ ...st, ...CHESS[level] }, habitOf(who, level))

/**
 * 五子棋（大家比較會玩，整體比其他棋類再強一點）：
 *   低：看不懂跳三跳四、常亂下、有時漏看對手要連五、不太會擋
 *   中：看得懂跳三跳四、偶爾亂挑、偶爾漏看
 *   高：幾乎不亂下、很少漏看，會先試下前幾名、看對手的回應
 *   挑戰：完全不漏看，試下更多手，還會再多看一步（對手回完之後自己的後續）
 */
const GOMOKU: Record<Level, Pick<GomokuStyle, 'sharp' | 'noise' | 'blind' | 'look' | 'vcf'>> = {
  low: { sharp: false, noise: 0.7, blind: 0.35, look: 0 },
  mid: { sharp: true, noise: 0.45, blind: 0.14, look: 0 },
  high: { sharp: true, noise: 0.03, blind: 0.01, look: 0 },
  master: { sharp: true, noise: 0, blind: 0, look: 0, vcf: true },
}
export const gomokuAt = (st: GomokuStyle, level: Level, who = -1): GomokuStyle => {
  const out = { ...st, ...GOMOKU[level] }
  // 低：不太會擋
  if (level === 'low') out.defense *= 0.75
  // 挑戰：攻守都不偏廢（太偏攻或太偏守都容易被抓到漏洞）
  if (level === 'master') {
    const avg = (st.attack + st.defense) / 2
    out.attack = Math.max(st.attack, avg)
    out.defense = Math.max(st.defense, avg)
  }
  return gomokuHabit(out, habitOf(who, level))
}

/** 圍棋：會不會算、亂挑的程度（整體比其他棋類再弱一點點） */
const GO: Record<Level, Pick<GoStyle, 'skill' | 'noise'>> = {
  low: { skill: 0.05, noise: 0.9 },
  mid: { skill: 0.35, noise: 0.5 },
  high: { skill: 0.6, noise: 0.32 },
  master: { skill: 0.9, noise: 0.08 },
}
export const goAt = (st: GoStyle, level: Level, who = -1): GoStyle => goHabit({ ...st, ...GO[level] }, habitOf(who, level))

/**
 * 牌類（大老二、瘋狂大老二、排七）的難度：低／中／高（沒有挑戰）。
 *   低＝會亂出的電腦、中＝以前的「簡單」、高＝以前的「困難」（最強，跟棋類的挑戰一樣）。
 * 舊存檔：簡單 → 中、困難 → 高；更早的四段難度：低 → 低、中 → 中、高／挑戰 → 高。
 */
export type CardLevel = 'low' | 'mid' | 'high'
export const CARD_LEVELS: readonly CardLevel[] = ['low', 'mid', 'high']
export const asCardLevel = (v: unknown): CardLevel => (v === 'low' ? 'low' : v === 'high' || v === 'hard' || v === 'master' ? 'high' : 'mid')
/** 大老二的難度對到電腦強弱 */
export const bigtwoLevel = (d: CardLevel): Level => (d === 'high' ? 'master' : d === 'mid' ? 'mid' : 'low')

/** 大老二：會不會算、手滑的機率、判斷的搖擺程度 */
const BIGTWO: Record<Level, Pick<BigTwoStyle, 'skill' | 'blunder' | 'whim'>> = {
  low: { skill: 0.06, blunder: 0.4, whim: 1.4 },
  mid: { skill: 0.4, blunder: 0.08, whim: 0.55 },
  high: { skill: 0.75, blunder: 0.02, whim: 0.2 },
  master: { skill: 1, blunder: 0, whim: 0 },
}
export const bigtwoAt = (st: BigTwoStyle, level: Level, who = -1): BigTwoStyle => {
  const out = bigtwoHabit({ ...st, ...BIGTWO[level] }, habitOf(who, level))
  // 挑戰：一定會擋快出完的人
  if (level === 'master') out.block = Math.max(out.block, 0.9)
  return out
}

function othelloHabit(st: OthelloStyle, h: Habit | null): OthelloStyle {
  const o = { ...st }
  if (h === 'rush' || h === 'bomb') o.greed = clamp(o.greed + 0.25)
  else if (h === 'turtle' || h === 'hoard' || h === 'edge') o.corner = clamp(o.corner + 0.2)
  else if (h === 'center' || h === 'block' || h === 'calm') o.mobility = clamp(o.mobility + 0.2)
  return o
}

/**
 * 黑白棋：
 *   低：只看一步，不太懂角的重要，愛一次翻很多子，常常隨手下
 *   中：看兩步，偶爾隨手下
 *   高：看四步，很少失誤
 *   挑戰：看五步，剩 9 格以內直接算到底，完全不失誤
 */
const OTHELLO: Record<Level, Pick<OthelloStyle, 'depth' | 'noise' | 'blunder' | 'solve' | 'nodes'>> = {
  low: { depth: 1, noise: 0.8, blunder: 0.25, solve: 0 },
  mid: { depth: 2, noise: 0.35, blunder: 0.06, solve: 0 },
  high: { depth: 4, noise: 0.1, blunder: 0.01, solve: 6 },
  master: { depth: 5, noise: 0, blunder: 0, solve: 9, nodes: 40000 },
}
export const othelloAt = (st: OthelloStyle, level: Level, who = -1): OthelloStyle => {
  const out = othelloHabit({ ...st, ...OTHELLO[level] }, habitOf(who, level))
  // 低：不太懂角，只想翻多一點
  if (level === 'low') ((out.corner *= 0.3), (out.mobility *= 0.3), (out.greed = clamp(out.greed + 0.4)))
  return out
}

/**
 * 排七：低／中／高（跟大老二一樣）。用大老二的「會不會算、手滑」當底：
 *   低：幾乎不會算、常常亂接；中：會一點、偶爾亂接（以前的「簡單」）；高：最會算、不失誤（以前的「困難」）
 */
export const sevensAt = (st: BigTwoStyle, d: CardLevel): { skill: number; blunder: number } =>
  d === 'high' ? { skill: 1, blunder: 0 } : d === 'mid' ? { skill: clamp(st.skill * 0.5), blunder: clamp(0.08 + st.blunder) } : { skill: clamp(st.skill * 0.1), blunder: clamp(0.35 + st.blunder) }

/** 電腦每一步多想多久（毫秒）：挑戰多想一會兒，看起來也比較像在認真算 */
export const extraThink = (level: Level): number => (level === 'master' ? 900 : level === 'high' ? 300 : 0)
