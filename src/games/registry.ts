// 遊戲註冊表：主畫面、分類頁、設定頁都只讀這裡。
// 新增遊戲：在這裡加一筆，並提供規則說明、互動教學與引擎測試。
import { defineAsyncComponent } from 'vue'
import { S } from '@/data/strings'
import { DEFAULT_BIGTWO_OPTIONS as B } from '@/engine/bigtwo/options'
import { DEFAULT_GOMOKU_OPTIONS as G } from '@/engine/gomoku/rules'
import { DEFAULT_GO_OPTIONS as GO } from '@/engine/go/rules'
import { bestAt, stats } from '@/core/settings'
import { DEFAULT_LEVEL } from '@/engine/common/difficulty'
import BigTwoCover from './covers/BigTwoCover.vue'
import CrazyBigTwoCover from './covers/CrazyBigTwoCover.vue'
import ChessCover from './covers/ChessCover.vue'
import GoCover from './covers/GoCover.vue'
import GomokuCover from './covers/GomokuCover.vue'
import OthelloCover from './covers/OthelloCover.vue'
import RedPointCover from './covers/RedPointCover.vue'
import SevensCover from './covers/SevensCover.vue'
import SolitaireCover from './covers/SolitaireCover.vue'
import SpiderCover from './covers/SpiderCover.vue'
import FreeCellCover from './covers/FreeCellCover.vue'
import XiangqiCover from './covers/XiangqiCover.vue'
import BanqiCover from './covers/BanqiCover.vue'
import CheckersCover from './covers/CheckersCover.vue'
import StarCheckersCover from './covers/StarCheckersCover.vue'
import QuoridorCover from './covers/QuoridorCover.vue'
import NinetyNineCover from './covers/NinetyNineCover.vue'
import type { GameCategory, GameDef, RuleSection, SettingDef, SettingGroup } from './types'

type Extra = { group?: SettingGroup; live?: boolean }
const toggle = (key: string, text: { label: string; help: string }, def: boolean, extra: Extra = {}): SettingDef => ({
  key,
  type: 'toggle',
  label: text.label,
  help: text.help,
  default: def,
  ...extra,
})
const choice = (
  key: string,
  text: { label: string; help: string; choices: Record<string, string> },
  def: string,
  extra: Extra = {},
): SettingDef => ({
  key,
  type: 'choice',
  label: text.label,
  help: text.help,
  default: def,
  choices: Object.entries(text.choices).map(([value, label]) => ({ value, label })),
  ...extra,
})

const timer = () => toggle('timer', S.common.timer, true, { group: 'other' })
const level = () => choice('difficulty', S.common.level, DEFAULT_LEVEL)
/** 規則說明最後面加一段「倒數計時」 */
const TR = S.common.timerRules
const withTimer = (rules: RuleSection[], body: string[]): RuleSection[] => [...rules, { title: TR.title, body }]
const bs = S.bigtwo.settings
const gs = S.gomoku.settings

export const GAMES: GameDef[] = [
  {
    id: 'bigtwo',
    category: 'cards',
    name: S.bigtwo.name,
    summary: S.bigtwo.summary,
    players: S.bigtwo.players,
    cover: BigTwoCover,
    tags: S.bigtwo.tags,
    best: (o) => bestAt('bigtwo', String(o.difficulty ?? 'mid')),
    rulesIntro: withTimer(S.bigtwo.rules, [...TR.cards, TR.bigtwo]),
    tutorial: defineAsyncComponent(() => import('./bigtwo/BigTwoTutorial.vue')),
    component: defineAsyncComponent(() => import('./bigtwo/BigTwoGame.vue')),
    settings: [
      choice('difficulty', bs.difficulty, 'mid'),
      choice('suitOrder', bs.suitOrder, B.suitOrder),
      choice('straightRule', bs.straightRule, B.straightRule),
      toggle('straightFlushSpecial', bs.straightFlushSpecial, B.straightFlushSpecial),
      toggle('bombBeatsAll', bs.bombBeatsAll, B.bombBeatsAll),
      toggle('allowTriple', bs.allowTriple, B.allowTriple),
      toggle('allowSmallStraight', bs.allowSmallStraight, B.allowSmallStraight),
      toggle('allowFlush', bs.allowFlush, B.allowFlush),
      toggle('allowTwoPair', bs.allowTwoPair, B.allowTwoPair),
      toggle('dragon', bs.dragon, B.dragon),
      toggle('playToRank', bs.playToRank, true),
      toggle('doubleOverTen', bs.doubleOverTen, B.doubleOverTen, { group: 'score' }),
      toggle('doubleTwos', bs.doubleTwos, B.doubleTwos, { group: 'score' }),
      toggle('autoPass', bs.autoPass, true, { group: 'other', live: true }),
      timer(),
    ],
  },
  {
    id: 'crazybigtwo',
    category: 'cards',
    name: S.crazybigtwo.name,
    summary: S.crazybigtwo.summary,
    players: S.crazybigtwo.players,
    cover: CrazyBigTwoCover,
    tags: S.crazybigtwo.tags,
    best: (o) => bestAt('crazybigtwo', String(o.difficulty ?? 'mid')),
    rulesIntro: withTimer(S.crazybigtwo.rules, [...TR.cardsCrazy, TR.bigtwo]),
    tutorial: defineAsyncComponent(() => import('./bigtwo/CrazyTutorial.vue')),
    component: defineAsyncComponent(() => import('./bigtwo/BigTwoGame.vue')),
    settings: [
      choice('difficulty', bs.difficulty, 'mid'),
      choice('suitOrder', bs.suitOrder, B.suitOrder),
      choice('straightRule', bs.straightRule, B.straightRule),
      toggle('straightFlushSpecial', bs.straightFlushSpecial, B.straightFlushSpecial),
      toggle('bombBeatsAll', bs.bombBeatsAll, B.bombBeatsAll),
      toggle('allowTriple', bs.allowTriple, B.allowTriple),
      toggle('allowSmallStraight', bs.allowSmallStraight, B.allowSmallStraight),
      toggle('allowFlush', bs.allowFlush, B.allowFlush),
      toggle('allowTwoPair', bs.allowTwoPair, B.allowTwoPair),
      toggle('playToRank', bs.playToRank, true),
      toggle('doubleOverTen', S.crazybigtwo.settings.doubleOverTen, B.doubleOverTen, { group: 'score' }),
      toggle('autoPass', bs.autoPass, true, { group: 'other', live: true }),
      toggle('twoRows', S.crazybigtwo.settings.twoRows, true, { group: 'other', live: true }),
      timer(),
    ],
  },
  {
    id: 'sevens',
    category: 'cards',
    name: S.sevens.name,
    summary: S.sevens.summary,
    players: S.sevens.players,
    cover: SevensCover,
    tags: S.sevens.tags,
    rulesIntro: withTimer(S.sevens.rules, [...TR.cards, TR.sevens]),
    tutorial: defineAsyncComponent(() => import('./sevens/SevensTutorial.vue')),
    component: defineAsyncComponent(() => import('./sevens/SevensGame.vue')),
    settings: [choice('difficulty', S.sevens.settings.difficulty, 'mid'), toggle('tapPlay', S.sevens.settings.tapPlay, false, { group: 'other', live: true }), timer()],
  },
  {
    id: 'redpoint',
    category: 'cards',
    name: S.redpoint.name,
    summary: S.redpoint.summary,
    players: S.redpoint.players,
    cover: RedPointCover,
    tags: S.redpoint.tags,
    best: () => stats.redpoint.best,
    rulesIntro: withTimer(S.redpoint.rules, [...TR.cards, TR.redpoint]),
    tutorial: defineAsyncComponent(() => import('./redpoint/RedPointTutorial.vue')),
    component: defineAsyncComponent(() => import('./redpoint/RedPointGame.vue')),
    settings: [toggle('hints', S.redpoint.settings.hints, false), timer()],
  },
  {
    id: 'ninetynine',
    category: 'cards',
    name: S.ninetynine.name,
    summary: S.ninetynine.summary,
    players: S.ninetynine.players,
    cover: NinetyNineCover,
    tags: S.ninetynine.tags,
    rulesIntro: withTimer(S.ninetynine.rules, [...TR.cards, TR.ninetynine]),
    tutorial: defineAsyncComponent(() => import('./ninetynine/NinetyNineTutorial.vue')),
    component: defineAsyncComponent(() => import('./ninetynine/NinetyNineGame.vue')),
    settings: [choice('difficulty', S.ninetynine.settings.difficulty, 'mid'), timer()],
  },
  {
    id: 'solitaire',
    category: 'cards',
    seats: 1,
    name: S.solitaire.name,
    summary: S.solitaire.summary,
    players: S.solitaire.players,
    cover: SolitaireCover,
    tags: S.solitaire.tags,
    best: (o) => bestAt('solitaire', String(o.difficulty ?? 'easy')),
    rulesIntro: S.solitaire.rules,
    tutorial: defineAsyncComponent(() => import('./solitaire/SolitaireTutorial.vue')),
    component: defineAsyncComponent(() => import('./solitaire/SolitaireGame.vue')),
    settings: [choice('difficulty', S.solitaire.settings.difficulty, 'easy')],
  },
  {
    id: 'spider',
    category: 'cards',
    seats: 1,
    name: S.spider.name,
    summary: S.spider.summary,
    players: S.spider.players,
    cover: SpiderCover,
    tags: S.spider.tags,
    best: (o) => bestAt('spider', String(o.difficulty ?? 'easy')),
    rulesIntro: S.spider.rules,
    tutorial: defineAsyncComponent(() => import('./spider/SpiderTutorial.vue')),
    component: defineAsyncComponent(() => import('./spider/SpiderGame.vue')),
    settings: [choice('difficulty', S.spider.settings.difficulty, 'easy')],
  },
  {
    id: 'freecell',
    category: 'cards',
    seats: 1,
    name: S.freecell.name,
    summary: S.freecell.summary,
    players: S.freecell.players,
    cover: FreeCellCover,
    tags: S.freecell.tags,
    best: () => stats.freecell.fewest,
    bestLabel: S.freecell.bestLabel,
    rulesIntro: S.freecell.rules,
    tutorial: defineAsyncComponent(() => import('./freecell/FreeCellTutorial.vue')),
    component: defineAsyncComponent(() => import('./freecell/FreeCellGame.vue')),
    settings: [],
  },
  {
    id: 'gomoku',
    category: 'board',
    name: S.gomoku.name,
    summary: S.gomoku.summary,
    players: S.gomoku.players,
    cover: GomokuCover,
    tags: S.gomoku.tags,
    rulesIntro: withTimer(S.gomoku.rules, [...TR.board]),
    tutorial: defineAsyncComponent(() => import('./gomoku/GomokuTutorial.vue')),
    component: defineAsyncComponent(() => import('./gomoku/GomokuGame.vue')),
    settings: [level(), toggle('forbidden', gs.forbidden, G.forbidden), toggle('overlineWins', gs.overlineWins, G.overlineWins), timer()],
  },
  {
    id: 'go',
    category: 'board',
    name: S.go.name,
    summary: S.go.summary,
    players: S.go.players,
    cover: GoCover,
    tags: S.go.tags,
    rulesIntro: withTimer(S.go.rules, [...TR.board, TR.go]),
    tutorial: defineAsyncComponent(() => import('./go/GoTutorial.vue')),
    component: defineAsyncComponent(() => import('./go/GoGame.vue')),
    settings: [level(), choice('size', S.go.settings.size, String(GO.size)), timer()],
  },
  {
    id: 'othello',
    category: 'board',
    name: S.othello.name,
    summary: S.othello.summary,
    players: S.othello.players,
    cover: OthelloCover,
    tags: S.othello.tags,
    rulesIntro: withTimer(S.othello.rules, [...TR.board, TR.othello]),
    tutorial: defineAsyncComponent(() => import('./othello/OthelloTutorial.vue')),
    component: defineAsyncComponent(() => import('./othello/OthelloGame.vue')),
    settings: [level(), timer()],
  },
  {
    id: 'chess',
    category: 'board',
    name: S.chess.name,
    summary: S.chess.summary,
    players: S.chess.players,
    cover: ChessCover,
    tags: S.chess.tags,
    rulesIntro: withTimer(S.chess.rules, [...TR.board, TR.check]),
    tutorial: defineAsyncComponent(() => import('./chess/ChessTutorial.vue')),
    component: defineAsyncComponent(() => import('./chess/ChessGame.vue')),
    settings: [level(), timer()],
  },
  {
    id: 'xiangqi',
    category: 'board',
    name: S.xiangqi.name,
    summary: S.xiangqi.summary,
    players: S.xiangqi.players,
    cover: XiangqiCover,
    tags: S.xiangqi.tags,
    rulesIntro: withTimer(S.xiangqi.rules, [...TR.board, TR.check]),
    tutorial: defineAsyncComponent(() => import('./xiangqi/XiangqiTutorial.vue')),
    component: defineAsyncComponent(() => import('./xiangqi/XiangqiGame.vue')),
    settings: [level(), choice('pieceStyle', S.xiangqi.settings.pieceStyle, 'text', { group: 'other', live: true }), timer()],
  },
  {
    id: 'banqi',
    category: 'board',
    name: S.banqi.name,
    summary: S.banqi.summary,
    players: S.banqi.players,
    cover: BanqiCover,
    tags: S.banqi.tags,
    rulesIntro: withTimer(S.banqi.rules, [...TR.board, TR.banqi]),
    tutorial: defineAsyncComponent(() => import('./banqi/BanqiTutorial.vue')),
    component: defineAsyncComponent(() => import('./banqi/BanqiGame.vue')),
    settings: [
      choice('difficulty', S.banqi.settings.difficulty, 'mid'),
      toggle('rookSlide', S.banqi.settings.rookSlide, false),
      toggle('chain', S.banqi.settings.chain, false),
      toggle('darkEat', S.banqi.settings.darkEat, false),
      timer(),
    ],
  },
  {
    id: 'checkers',
    category: 'board',
    name: S.checkers.name,
    summary: S.checkers.summary,
    players: S.checkers.players,
    cover: CheckersCover,
    tags: S.checkers.tags,
    rulesIntro: withTimer(S.checkers.rules, [...TR.checkers]),
    tutorial: defineAsyncComponent(() => import('./checkers/CheckersTutorial.vue')),
    component: defineAsyncComponent(() => import('./checkers/CheckersGame.vue')),
    settings: [level(), toggle('forceCapture', S.checkers.settings.forceCapture, true), timer()],
  },
  {
    id: 'starcheckers',
    category: 'board',
    seats: 3,
    name: S.starcheckers.name,
    summary: S.starcheckers.summary,
    players: S.starcheckers.players,
    cover: StarCheckersCover,
    tags: S.starcheckers.tags,
    rulesIntro: withTimer(S.starcheckers.rules, TR.star),
    tutorial: defineAsyncComponent(() => import('./starcheckers/StarTutorial.vue')),
    component: defineAsyncComponent(() => import('./starcheckers/StarGame.vue')),
    settings: [level(), toggle('longJump', S.starcheckers.settings.longJump, true), toggle('allAtOnce', S.starcheckers.settings.allAtOnce, false, { group: 'other', live: true }), timer()],
  },  {
    id: 'quoridor',
    category: 'board',
    name: S.quoridor.name,
    summary: S.quoridor.summary,
    players: S.quoridor.players,
    cover: QuoridorCover,
    tags: S.quoridor.tags,
    rulesIntro: withTimer(S.quoridor.rules, [...TR.board]),
    tutorial: defineAsyncComponent(() => import('./quoridor/QuoridorTutorial.vue')),
    component: defineAsyncComponent(() => import('./quoridor/QuoridorGame.vue')),
    settings: [level(), toggle('doubleTap', S.quoridor.settings.doubleTap, false, { group: 'other', live: true }), timer()],
  },

]

export const getGame = (id: string): GameDef => GAMES.find((g) => g.id === id) ?? GAMES[0]
export const gamesIn = (category: GameCategory): GameDef[] => GAMES.filter((g) => g.category === category)

/** 這個玩法幾個人玩（連線房間的座位數） */
export const seatsOf = (g: GameDef): number => g.seats ?? (g.category === 'cards' ? 4 : 2)
/** 可以連線對戰的玩法（單人的接龍不行） */
export const onlineGames = (category: GameCategory): GameDef[] => gamesIn(category).filter((g) => seatsOf(g) > 1)
