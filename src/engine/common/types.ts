// 各遊戲共用的型別

export type Difficulty = 'easy' | 'normal'

/** 引擎動作的結果：成功給新狀態，失敗給原因代碼（由 UI 轉成文字） */
export type Result<S, E extends string = string> =
  | { ok: true; state: S }
  | { ok: false; reason: E }
