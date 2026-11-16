// 個人資料的數值：經驗值、等級、稱號的解鎖條件、頭像零件的解鎖等級。
// 稱號名稱與「怎麼解鎖」的說明文字在 strings.ts 的 S.profile.titles。
import type { Fill, Shape, Tone } from '@/ui/art/look'

/** 每升一級要的經驗值（固定，每一級都一樣） */
export const XP_PER_LEVEL = 300
/** 等級先做到 100 級；超過 100 之後照樣每 300 經驗升一級，沒有上限 */
export const LEVEL_CAP_SHOWN = 100
/** 一局最多拿多少經驗 */
export const XP_GAME_CAP = 50

/** 一局的經驗值：贏 30＋表現 0～10、和 18＋表現 0～4、輸 4＋表現 0～16（輸得越接近越多）；再加難度獎勵（輸、和只拿一半） */
export const XP_RULE = {
  win: { base: 30, perf: 10 },
  draw: { base: 18, perf: 4 },
  loss: { base: 4, perf: 16 },
}
/** 難度獎勵：電腦越強拿越多（沒有難度的撿紅點算中等） */
export const XP_LEVEL_BONUS: Record<string, number> = { low: 0, easy: 0, mid: 4, all: 4, normal: 4, high: 8, hard: 10, master: 12 }

/** 每個玩法最難的那個難度（稱號「在最難的難度贏一場」用） */
export const TOP_LEVEL: Record<string, string> = {
  bigtwo: 'hard',
  crazybigtwo: 'hard',
  sevens: 'hard',
  solitaire: 'hard',
  gomoku: 'master',
  go: 'master',
  othello: 'master',
  chess: 'master',
  xiangqi: 'master',
}

export type TitleRule =
  | { kind: 'free' }
  | { kind: 'level'; n: number }
  | { kind: 'wins'; game: string; n: number }
  | { kind: 'top'; game: string }
  | { kind: 'played'; n: number }
  | { kind: 'allWins' }

/** 所有稱號（顯示順序）：一開始送 3 個；等級稱號；每個玩法 3 個；另外 2 個綜合的 */
export const TITLES: { id: string; rule: TitleRule }[] = [
  { id: 'rookie', rule: { kind: 'free' } },
  { id: 'chill', rule: { kind: 'free' } },
  { id: 'snack', rule: { kind: 'free' } },
  { id: 'lv5', rule: { kind: 'level', n: 5 } },
  { id: 'lv10', rule: { kind: 'level', n: 10 } },
  { id: 'lv20', rule: { kind: 'level', n: 20 } },
  { id: 'lv30', rule: { kind: 'level', n: 30 } },
  { id: 'lv50', rule: { kind: 'level', n: 50 } },
  { id: 'lv75', rule: { kind: 'level', n: 75 } },
  { id: 'lv100', rule: { kind: 'level', n: 100 } },
  ...['bigtwo', 'crazybigtwo', 'sevens', 'redpoint', 'solitaire', 'gomoku', 'go', 'othello', 'chess', 'xiangqi'].flatMap((game) => [
    { id: `${game}1`, rule: { kind: 'wins', game, n: 1 } as TitleRule },
    { id: `${game}10`, rule: { kind: 'wins', game, n: 10 } as TitleRule },
    // 撿紅點沒有難度：第三個改成贏 30 場
    { id: `${game}Top`, rule: (game === 'redpoint' ? { kind: 'wins', game, n: 30 } : { kind: 'top', game }) as TitleRule },
  ]),
  { id: 'played100', rule: { kind: 'played', n: 100 } },
  { id: 'allWins', rule: { kind: 'allWins' } },
]

/** 有勝負的玩法（「十項全能」要每個都贏過） */
export const ALL_GAMES = ['bigtwo', 'crazybigtwo', 'sevens', 'redpoint', 'solitaire', 'gomoku', 'go', 'othello', 'chess', 'xiangqi']

/** 頭像零件：形狀、顏色、花紋各自在幾級解鎖（1 級＝一開始就有） */
export const AVATAR_SHAPES: { value: Shape; level: number }[] = [
  { value: 'circle', level: 1 },
  { value: 'square', level: 1 },
  { value: 'triangle', level: 6 },
  { value: 'diamond', level: 15 },
  { value: 'half', level: 25 },
  { value: 'pill', level: 40 },
]
export const AVATAR_TONES: { value: Tone; level: number }[] = [
  { value: 'ink', level: 1 },
  { value: 'red', level: 1 },
  { value: 'blue', level: 4 },
  { value: 'yellow', level: 10 },
  { value: 'card', level: 20 },
]
export const AVATAR_FILLS: { value: Fill; level: number }[] = [
  { value: 'solid', level: 1 },
  { value: 'dots', level: 3 },
  { value: 'stripes', level: 8 },
]
