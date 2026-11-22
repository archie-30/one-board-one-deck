// 伺服器認得的玩法與人數（跟前端 src/games/registry.ts 的 seatsOf 一致；有測試檢查兩邊一樣）。
// 單人玩法（接龍）不能連線，所以不在這裡。
export const GAME_SEATS: Record<string, number> = {
  bigtwo: 4,
  crazybigtwo: 4,
  sevens: 4,
  ninetynine: 4,
  bluff: 4,
  redpoint: 4,
  gomoku: 2,
  go: 2,
  othello: 2,
  chess: 2,
  xiangqi: 2,
  banqi: 2,
  checkers: 2,
  starcheckers: 3,
  quoridor: 2,
  dots: 2,
}

/** 電腦對手一共幾位（跟 src/data/names.ts 的 OPPONENTS 一樣多） */
export const BOT_TOTAL = 30
/** 新手打法的那一位（難度「高」不會出現；跟 names.ts 標 beginner 的一樣，有測試檢查） */
export const BEGINNER_BOT = 16

const B = [true, false] as const
const LEVEL = ['low', 'mid', 'high'] as const
const LEVEL4 = ['low', 'mid', 'high', 'master'] as const
const BIGTWO_RULES = {
  difficulty: LEVEL,
  suitOrder: ['shdc', 'shcd'],
  straightRule: ['tw', 'aLow', 'high'],
  straightFlushSpecial: B,
  bombBeatsAll: B,
  allowTriple: B,
  allowSmallStraight: B,
  allowFlush: B,
  allowTwoPair: B,
  playToRank: B,
  doubleOverTen: B,
  timer: B,
}

/**
 * 已經能連線同步對局的玩法，以及房主能送來的規則設定（只收這些鍵、只收這些值）。
 * 只放「會影響這一局公平」的設定；每個人自己能改的（例如自動過牌、手牌分兩排）不在這裡。
 * 跟遊戲註冊表的設定一致（src/core/onlineGames.test.ts 檢查）。
 */
export const MATCH_RULES: Record<string, Record<string, readonly (string | boolean)[]>> = {
  bigtwo: { ...BIGTWO_RULES, dragon: B, doubleTwos: B },
  crazybigtwo: BIGTWO_RULES,
  sevens: { difficulty: LEVEL, timer: B },
  ninetynine: { difficulty: LEVEL, timer: B },
  bluff: { difficulty: LEVEL, fourDiscard: B, timer: B },
  redpoint: { hints: B, timer: B },
  gomoku: { difficulty: LEVEL4, forbidden: B, overlineWins: B, timer: B },
  go: { difficulty: LEVEL4, size: ['19', '13', '9'], timer: B },
  othello: { difficulty: LEVEL4, timer: B },
  chess: { difficulty: LEVEL4, timer: B },
  xiangqi: { difficulty: LEVEL4, timer: B },
  banqi: { difficulty: LEVEL, rookSlide: B, chain: B, darkEat: B, timer: B },
  checkers: { difficulty: LEVEL4, forceCapture: B, timer: B },
  starcheckers: { difficulty: LEVEL4, longJump: B, timer: B },
  quoridor: { difficulty: LEVEL4, timer: B },
  dots: { difficulty: LEVEL, timer: B },
}

/** 檢查房主送來的規則設定：不認得的鍵、不合法的值整份不收 */
export function parseRules(gameId: unknown, raw: unknown): { gameId: string; options: Record<string, string | boolean> } | null {
  if (typeof gameId !== 'string' || !(gameId in MATCH_RULES) || !raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const schema = MATCH_RULES[gameId]
  const out: Record<string, string | boolean> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!(k in schema) || !schema[k].includes(v as string | boolean)) return null
    out[k] = v as string | boolean
  }
  return { gameId, options: out }
}
