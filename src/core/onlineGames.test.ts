import { expect, it } from 'vitest'
import { BEGINNER_BOT, BOT_TOTAL, GAME_SEATS, MATCH_RULES } from '../../server/src/games'
import { OPPONENTS } from '../data/names'
import { GAMES, getGame, seatsOf } from '../games/registry'

it('伺服器認得的玩法與人數，跟遊戲註冊表一樣（單人玩法不能連線）', () => {
  const fromRegistry = Object.fromEntries(GAMES.filter((g) => seatsOf(g) > 1).map((g) => [g.id, seatsOf(g)]))
  expect(GAME_SEATS).toEqual(fromRegistry)
})

it('能同步的玩法：伺服器收的規則設定，跟註冊表裡「影響公平」的設定（不是 live 的）一樣，值也一樣', () => {
  for (const [id, schema] of Object.entries(MATCH_RULES)) {
    const fromRegistry = Object.fromEntries(
      getGame(id)
        .settings.filter((d) => !d.live)
        .map((d) => [d.key, d.type === 'toggle' ? [true, false] : d.choices!.map((c) => c.value)]),
    )
    expect(Object.fromEntries(Object.entries(schema).map(([k, v]) => [k, [...v].sort()]))).toEqual(Object.fromEntries(Object.entries(fromRegistry).map(([k, v]) => [k, [...v].sort()])))
  }
})

it('電腦對手數量、新手打法那一位，跟對手名單一樣', () => {
  expect(BOT_TOTAL).toBe(OPPONENTS.length)
  expect(OPPONENTS.findIndex((o) => o.beginner)).toBe(BEGINNER_BOT)
})
