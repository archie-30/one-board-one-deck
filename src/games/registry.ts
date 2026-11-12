// 遊戲註冊表：主畫面、分類頁、設定頁都只讀這裡。
// 新增遊戲：在這裡加一筆，並提供規則說明、互動教學與引擎測試。
import { defineAsyncComponent } from 'vue'
import { S } from '@/data/strings'
import { DEFAULT_BIGTWO_OPTIONS as B } from '@/engine/bigtwo/options'
import { DEFAULT_GOMOKU_OPTIONS as G } from '@/engine/gomoku/rules'
import { stats } from '@/core/settings'
import BigTwoScene from './bigtwo/BigTwoScene.vue'
import GomokuScene from './gomoku/GomokuScene.vue'
import type { GameCategory, GameDef, SettingDef } from './types'

const toggle = (key: string, text: { label: string; help: string }, def: boolean): SettingDef => ({
  key,
  type: 'toggle',
  label: text.label,
  help: text.help,
  default: def,
})
const choice = (
  key: string,
  text: { label: string; help: string; choices: Record<string, string> },
  def: string,
): SettingDef => ({
  key,
  type: 'choice',
  label: text.label,
  help: text.help,
  default: def,
  choices: Object.entries(text.choices).map(([value, label]) => ({ value, label })),
})

const bs = S.bigtwo.settings
const gs = S.gomoku.settings

export const GAMES: GameDef[] = [
  {
    id: 'bigtwo',
    category: 'cards',
    name: S.bigtwo.name,
    summary: S.bigtwo.summary,
    players: S.bigtwo.players,
    scene: BigTwoScene,
    rulesSub: S.lobby.rulesSub,
    record: () => S.bigtwo.record(stats.bigtwo.rounds, stats.bigtwo.wins, stats.bigtwo.totals[0] ?? 0),
    rulesIntro: S.bigtwo.rules,
    tutorial: defineAsyncComponent(() => import('./bigtwo/BigTwoTutorial.vue')),
    component: defineAsyncComponent(() => import('./bigtwo/BigTwoGame.vue')),
    settings: [
      choice('suitOrder', bs.suitOrder, B.suitOrder),
      choice('straightRule', bs.straightRule, B.straightRule),
      toggle('straightFlushSpecial', bs.straightFlushSpecial, B.straightFlushSpecial),
      toggle('bombBeatsAll', bs.bombBeatsAll, B.bombBeatsAll),
      toggle('allowTriple', bs.allowTriple, B.allowTriple),
      toggle('allowFlush', bs.allowFlush, B.allowFlush),
      toggle('doubleOverTen', bs.doubleOverTen, B.doubleOverTen),
      toggle('doubleTwos', bs.doubleTwos, B.doubleTwos),
    ],
  },
  {
    id: 'gomoku',
    category: 'board',
    name: S.gomoku.name,
    summary: S.gomoku.summary,
    players: S.gomoku.players,
    scene: GomokuScene,
    rulesSub: S.lobby.rulesSubBoard,
    record: () => S.gomoku.record(stats.gomoku.wins, stats.gomoku.losses, stats.gomoku.draws),
    rulesIntro: S.gomoku.rules,
    tutorial: defineAsyncComponent(() => import('./gomoku/GomokuTutorial.vue')),
    component: defineAsyncComponent(() => import('./gomoku/GomokuGame.vue')),
    settings: [toggle('forbidden', gs.forbidden, G.forbidden), toggle('overlineWins', gs.overlineWins, G.overlineWins)],
  },
]

export const getGame = (id: string): GameDef => GAMES.find((g) => g.id === id) ?? GAMES[0]
export const gamesIn = (category: GameCategory): GameDef[] => GAMES.filter((g) => g.category === category)
