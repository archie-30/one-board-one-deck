import { expect, it } from 'vitest'
import { GAME_SEATS } from '../../server/src/games'
import { GAMES, seatsOf } from '../games/registry'

it('伺服器認得的玩法與人數，跟遊戲註冊表一樣（單人玩法不能連線）', () => {
  const fromRegistry = Object.fromEntries(GAMES.filter((g) => seatsOf(g) > 1).map((g) => [g.id, seatsOf(g)]))
  expect(GAME_SEATS).toEqual(fromRegistry)
})
