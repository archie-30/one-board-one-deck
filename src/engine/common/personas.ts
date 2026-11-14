// 20 位對手的個性：每個人在大老二與五子棋各有一套打法參數。
// 純資料，不依賴 UI；名字與長相在 UI 層（src/data/names.ts）用同一個編號對應。

/** 大老二的打法 */
export interface BigTwoStyle {
  /** 0～1：會不會算（避免拆牌、保留結構、看得懂局勢） */
  skill: number
  /** 0～1：能壓就壓的程度；低的人常常選擇過牌保留實力 */
  aggression: number
  /** 0～1：把 2、A 和炸彈留到最後的程度 */
  hoard: number
  /** 自由出牌時偏好的牌型 */
  lead: 'small' | 'combo' | 'pairs' | 'big' | 'mixed'
  /** 0～1：拿到鐵支／同花順時多想用掉 */
  bomb: number
  /** 0～1：有人快出完時，多拚命去擋 */
  block: number
  /** 0～1：每一手隨手亂出的機率 */
  blunder: number
  /** 0～1：判斷時的搖擺程度，沒填就用 1 - skill */
  whim?: number
}

/** 五子棋的打法 */
export interface GomokuStyle {
  /** 自己連線的權重 */
  attack: number
  /** 擋對手的權重 */
  defense: number
  /** 看得懂跳三、跳四 */
  sharp: boolean
  /** 0～1：在前幾名候選裡隨機挑的程度 */
  noise: number
  /** 0～1：偏愛下在棋盤中央 */
  center: number
  /** 0～1：漏看對手「下一手就贏」的機率 */
  blind: number
}

/** 撿紅點的打法 */
export interface RedPointStyle {
  /** 0～1：會不會算（墊牌時避開容易被吃的牌、記牌） */
  skill: number
  /** 0～1：看到分數就想吃的程度 */
  greed: number
  /** 0～1：隨手亂出的機率 */
  blunder: number
}

/** 圍棋的打法 */
export interface GoStyle {
  /** 0～1：會不會算（避免自己被打吃、看得到叫吃與提子） */
  skill: number
  /** 0～1：愛去碰對方、打吃對方的程度 */
  attack: number
  /** 0～1：重視補強自己的棋 */
  defense: number
  /** 0～1：在前幾名候選裡隨機挑的程度 */
  noise: number
  /** 0～1：偏愛下在棋盤中央（否則偏愛邊角） */
  center: number
}

/** 西洋棋、象棋的打法（兩種棋共用） */
export interface ChessStyle {
  /** 往後算幾步（1～3）；越多越強 */
  depth: number
  /** 0～1：喜歡吃子、將軍、往前壓 */
  attack: number
  /** 0～1：重視保護自己的王（將帥）與棋子 */
  safety: number
  /** 0～1：在差不多好的幾步裡隨機挑的程度 */
  noise: number
  /** 0～1：隨手走一步的機率 */
  blunder: number
}

export interface Persona {
  bigtwo: BigTwoStyle
  gomoku: GomokuStyle
  redpoint: RedPointStyle
  go: GoStyle
  chess: ChessStyle
}

/**
 * 撿紅點與圍棋的打法由同一個人的個性推出來，所以 20 位對手在每款遊戲都各不相同：
 * 大老二的「會不會算、衝動、手滑」對應撿紅點；五子棋的「攻守、隨機、看不看得懂」對應圍棋。
 */
function derive(bigtwo: BigTwoStyle, gomoku: GomokuStyle): Pick<Persona, 'redpoint' | 'go' | 'chess'> {
  const clamp = (v: number) => Math.max(0, Math.min(1, v))
  return {
    redpoint: { skill: bigtwo.skill, greed: clamp(bigtwo.aggression * 0.8 + (1 - bigtwo.hoard) * 0.2), blunder: bigtwo.blunder },
    go: {
      skill: clamp((gomoku.sharp ? 0.55 : 0.2) + (1 - gomoku.noise) * 0.4 - gomoku.blind),
      attack: clamp(gomoku.attack - 0.5),
      defense: clamp(gomoku.defense - 0.4),
      noise: gomoku.noise,
      center: gomoku.center,
    },
    // 西洋棋、象棋：會算的人算得深；五子棋的攻守比重對應愛不愛進攻
    chess: {
      depth: bigtwo.skill >= 0.75 && gomoku.sharp ? 3 : bigtwo.skill >= 0.4 ? 2 : 1,
      attack: clamp(gomoku.attack - 0.4 + bigtwo.aggression * 0.3),
      safety: clamp(gomoku.defense - 0.3),
      noise: clamp(gomoku.noise * 0.8),
      blunder: clamp(bigtwo.blunder * 1.5 + gomoku.blind),
    },
  }
}

const P = (bigtwo: BigTwoStyle, gomoku: GomokuStyle): Persona => ({ bigtwo, gomoku, ...derive(bigtwo, gomoku) })

/** 順序對應 src/data/names.ts 的 OPPONENT_NAMES */
export const PERSONAS: Persona[] = [
  // 0 阿明：中規中矩，什麼都會一點
  P({ skill: 0.6, aggression: 0.6, hoard: 0.5, lead: 'mixed', bomb: 0.5, block: 0.6, blunder: 0.04 },
    { attack: 1, defense: 0.85, sharp: true, noise: 0.25, center: 0.5, blind: 0.02 }),
  // 1 小美：精算型，很少犯錯
  P({ skill: 0.95, aggression: 0.5, hoard: 0.8, lead: 'combo', bomb: 0.3, block: 0.9, blunder: 0 },
    { attack: 1, defense: 1, sharp: true, noise: 0, center: 0.7, blind: 0 }),
  // 2 老王：衝動，見牌就壓
  P({ skill: 0.35, aggression: 1, hoard: 0.1, lead: 'big', bomb: 1, block: 0.4, blunder: 0.08 },
    { attack: 1.4, defense: 0.5, sharp: false, noise: 0.35, center: 0.3, blind: 0.1 }),
  // 3 阿豪：愛炸，一有炸彈就丟
  P({ skill: 0.55, aggression: 0.85, hoard: 0.2, lead: 'combo', bomb: 1, block: 0.7, blunder: 0.04 },
    { attack: 1.3, defense: 0.7, sharp: true, noise: 0.2, center: 0.4, blind: 0.03 }),
  // 4 小花：佛系，常常過牌
  P({ skill: 0.4, aggression: 0.2, hoard: 0.5, lead: 'small', bomb: 0.2, block: 0.3, blunder: 0.1 },
    { attack: 0.7, defense: 0.7, sharp: false, noise: 0.6, center: 0.2, blind: 0.15 }),
  // 5 阿土伯：老派，先出對子
  P({ skill: 0.65, aggression: 0.45, hoard: 0.9, lead: 'pairs', bomb: 0.2, block: 0.6, blunder: 0.02 },
    { attack: 0.8, defense: 1.2, sharp: true, noise: 0.15, center: 0.9, blind: 0.02 }),
  // 6 美玲：穩健防守
  P({ skill: 0.8, aggression: 0.4, hoard: 0.7, lead: 'small', bomb: 0.4, block: 1, blunder: 0.01 },
    { attack: 0.75, defense: 1.3, sharp: true, noise: 0.1, center: 0.6, blind: 0 }),
  // 7 志明：喜歡一次丟一大把
  P({ skill: 0.55, aggression: 0.7, hoard: 0.4, lead: 'combo', bomb: 0.6, block: 0.5, blunder: 0.05 },
    { attack: 1.2, defense: 0.8, sharp: true, noise: 0.3, center: 0.4, blind: 0.04 }),
  // 8 春嬌：先出大牌嚇人
  P({ skill: 0.5, aggression: 0.75, hoard: 0.05, lead: 'big', bomb: 0.7, block: 0.5, blunder: 0.05 },
    { attack: 1.1, defense: 0.9, sharp: false, noise: 0.4, center: 0.3, blind: 0.06 }),
  // 9 阿福：運氣派，常亂出
  P({ skill: 0.25, aggression: 0.6, hoard: 0.3, lead: 'mixed', bomb: 0.5, block: 0.3, blunder: 0.2 },
    { attack: 0.9, defense: 0.6, sharp: false, noise: 0.8, center: 0.1, blind: 0.2 }),
  // 10 小胖：慢熟，前面都過、後面才發力
  P({ skill: 0.7, aggression: 0.3, hoard: 1, lead: 'small', bomb: 0.2, block: 0.8, blunder: 0.02 },
    { attack: 0.8, defense: 1.1, sharp: true, noise: 0.2, center: 0.5, blind: 0.02 }),
  // 11 阿珠：見縫插針，很會擋
  P({ skill: 0.85, aggression: 0.65, hoard: 0.6, lead: 'mixed', bomb: 0.5, block: 1, blunder: 0.01 },
    { attack: 0.95, defense: 1.25, sharp: true, noise: 0.05, center: 0.6, blind: 0 }),
  // 12 阿雄：硬碰硬
  P({ skill: 0.5, aggression: 0.95, hoard: 0.3, lead: 'big', bomb: 0.8, block: 0.6, blunder: 0.03 },
    { attack: 1.35, defense: 0.6, sharp: true, noise: 0.25, center: 0.4, blind: 0.05 }),
  // 13 秀琴：細心，愛出順子
  P({ skill: 0.75, aggression: 0.5, hoard: 0.6, lead: 'combo', bomb: 0.3, block: 0.7, blunder: 0.02 },
    { attack: 1, defense: 1, sharp: true, noise: 0.15, center: 0.8, blind: 0.01 }),
  // 14 建國：照本宣科
  P({ skill: 0.6, aggression: 0.55, hoard: 0.5, lead: 'small', bomb: 0.5, block: 0.5, blunder: 0.03 },
    { attack: 1, defense: 0.9, sharp: true, noise: 0.1, center: 1, blind: 0.03 }),
  // 15 淑芬：大師級
  P({ skill: 1, aggression: 0.6, hoard: 0.85, lead: 'mixed', bomb: 0.4, block: 1, blunder: 0 },
    { attack: 1.1, defense: 1.15, sharp: true, noise: 0, center: 0.6, blind: 0 }),
  // 16 阿寶：新手，常常看不懂
  P({ skill: 0.15, aggression: 0.5, hoard: 0.2, lead: 'small', bomb: 0.6, block: 0.1, blunder: 0.25 },
    { attack: 0.8, defense: 0.5, sharp: false, noise: 1, center: 0.2, blind: 0.3 }),
  // 17 小黑：神出鬼沒，喜歡突然丟大牌
  P({ skill: 0.6, aggression: 0.5, hoard: 0.95, lead: 'pairs', bomb: 0.9, block: 0.9, blunder: 0.04 },
    { attack: 1.25, defense: 0.85, sharp: true, noise: 0.35, center: 0.1, blind: 0.03 }),
  // 18 阿達：急性子，什麼都快快出
  P({ skill: 0.35, aggression: 0.9, hoard: 0, lead: 'combo', bomb: 0.9, block: 0.3, blunder: 0.1 },
    { attack: 1.3, defense: 0.55, sharp: false, noise: 0.5, center: 0.3, blind: 0.12 }),
  // 19 阿蓮：溫和但不好惹
  P({ skill: 0.7, aggression: 0.5, hoard: 0.7, lead: 'pairs', bomb: 0.4, block: 0.85, blunder: 0.02 },
    { attack: 0.9, defense: 1.1, sharp: true, noise: 0.2, center: 0.7, blind: 0.01 }),
]

/** 以前的「簡單／普通」對應到兩組固定打法（測試與教學用） */
export const PRESET_STYLES = {
  easy: P({ skill: 0.2, aggression: 0.75, hoard: 0.3, lead: 'small', bomb: 0.6, block: 0.3, blunder: 0, whim: 0 },
    { attack: 0.9, defense: 0.55, sharp: false, noise: 0.6, center: 0, blind: 0 }),
  normal: P({ skill: 0.85, aggression: 0.6, hoard: 0.7, lead: 'mixed', bomb: 0.4, block: 0.9, blunder: 0 },
    { attack: 1, defense: 0.9, sharp: true, noise: 0, center: 0.6, blind: 0 }),
}
