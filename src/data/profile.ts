// 個人資料的數值：經驗值、等級、稱號的解鎖條件、頭像零件的解鎖等級。
// 稱號名稱與「怎麼解鎖」的說明文字在 strings.ts 的 S.profile.titles。
import type { Acc, Fill, Shape, Tone } from '@/ui/art/look'

/** 每升一級要的經驗值（固定，每一級都一樣；原本 300，使用者覺得升太慢改成 200） */
export const XP_PER_LEVEL = 200
/** 等級先做到 100 級；超過 100 之後照樣每 200 經驗升一級，沒有上限 */
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
  bigtwo: 'high',
  crazybigtwo: 'high',
  sevens: 'high',
  ninetynine: 'high',
  solitaire: 'hard',
  gomoku: 'master',
  go: 'master',
  othello: 'master',
  chess: 'master',
  xiangqi: 'master',
  banqi: 'high',
  checkers: 'master',
  starcheckers: 'master',
  quoridor: 'master',
}

export type TitleRule =
  | { kind: 'free' }
  | { kind: 'level'; n: number }
  | { kind: 'wins'; game: string; n: number }
  | { kind: 'top'; game: string; n: number }
  | { kind: 'played'; n: number }
  | { kind: 'lost'; n: number }
  | { kind: 'allWins' }

/** 有勝負的玩法（「十項全能」要每個都贏過） */
export const ALL_GAMES = ['bigtwo', 'crazybigtwo', 'sevens', 'redpoint', 'solitaire', 'gomoku', 'go', 'othello', 'chess', 'xiangqi']

/**
 * 所有稱號（顯示順序）。門檻刻意拉高，不會一下子拿一大堆：
 * 一開始送 3 個；等級稱號；每個玩法 3 個（贏 5 場、贏 30 場、在最難的難度贏 3 場；撿紅點沒有難度，改成贏 80 場）；綜合 4 個。
 */
export const TITLES: { id: string; rule: TitleRule }[] = [
  { id: 'rookie', rule: { kind: 'free' } },
  { id: 'passby', rule: { kind: 'free' } },
  { id: 'messy', rule: { kind: 'free' } },
  { id: 'lv5', rule: { kind: 'level', n: 5 } },
  { id: 'lv10', rule: { kind: 'level', n: 10 } },
  { id: 'lv30', rule: { kind: 'level', n: 30 } },
  { id: 'lv50', rule: { kind: 'level', n: 50 } },
  { id: 'lv66', rule: { kind: 'level', n: 66 } },
  { id: 'lv88', rule: { kind: 'level', n: 88 } },
  { id: 'lv100', rule: { kind: 'level', n: 100 } },
  { id: 'lv250', rule: { kind: 'level', n: 250 } },
  // 每個玩法 3 個稱號（暗棋、兩種跳棋、步步為營、九九是後來加的：有自己的稱號，但「十項全能」還是原本那十種）
  ...[...ALL_GAMES, 'banqi', 'checkers', 'starcheckers', 'quoridor', 'ninetynine'].flatMap((game) => [
    { id: `${game}A`, rule: { kind: 'wins', game, n: 5 } as TitleRule },
    { id: `${game}B`, rule: { kind: 'wins', game, n: 30 } as TitleRule },
    { id: `${game}Top`, rule: (game === 'redpoint' ? { kind: 'wins', game, n: 80 } : { kind: 'top', game, n: 3 }) as TitleRule },
  ]),
  { id: 'played100', rule: { kind: 'played', n: 100 } },
  { id: 'lost50', rule: { kind: 'lost', n: 50 } },
  { id: 'played500', rule: { kind: 'played', n: 500 } },
  { id: 'allWins', rule: { kind: 'allWins' } },
]
/** 同時可以裝備幾個稱號 */
export const TITLE_SLOTS = 2

/** 頭像零件：形狀、顏色、花紋、飾品各自在幾級解鎖（1 級＝一開始就有） */
export const AVATAR_SHAPES: { value: Shape; level: number }[] = [
  { value: 'circle', level: 1 },
  { value: 'square', level: 1 },
  { value: 'triangle', level: 5 },
  { value: 'diamond', level: 12 },
  { value: 'hex', level: 18 },
  { value: 'half', level: 26 },
  { value: 'pill', level: 35 },
  { value: 'drop', level: 50 },
]
export const AVATAR_TONES: { value: Tone; level: number }[] = [
  { value: 'ink', level: 1 },
  { value: 'red', level: 1 },
  { value: 'blue', level: 3 },
  { value: 'yellow', level: 8 },
  { value: 'card', level: 15 },
]
export const AVATAR_FILLS: { value: Fill; level: number }[] = [
  { value: 'solid', level: 1 },
  { value: 'dots', level: 2 },
  { value: 'stripes', level: 7 },
  { value: 'checker', level: 14 },
  { value: 'grid', level: 22 },
  { value: 'split', level: 30 },
]
export const AVATAR_ACCS: { value: Acc; level: number }[] = [
  { value: 'none', level: 1 },
  { value: 'blush', level: 2 },
  { value: 'glasses', level: 4 },
  { value: 'mustache', level: 6 },
  { value: 'bow', level: 9 },
  { value: 'party', level: 11 },
  { value: 'shades', level: 16 },
  { value: 'headphones', level: 20 },
  { value: 'monocle', level: 24 },
  { value: 'halo', level: 40 },
  { value: 'crown', level: 60 },
]
