// 伺服器認得的玩法與人數（跟前端 src/games/registry.ts 的 seatsOf 一致；有測試檢查兩邊一樣）。
// 單人玩法（接龍）不能連線，所以不在這裡。
export const GAME_SEATS: Record<string, number> = {
  bigtwo: 4,
  crazybigtwo: 4,
  sevens: 4,
  redpoint: 4,
  gomoku: 2,
  go: 2,
  othello: 2,
  chess: 2,
  xiangqi: 2,
  banqi: 2,
}
