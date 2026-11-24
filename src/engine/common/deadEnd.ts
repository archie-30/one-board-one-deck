// 「真的卡關了嗎」：從目前局面把所有走得到的局面都走過一遍（一樣的局面只走一次），
// 全部走完都沒有一個能過關 → 卡關（死路）。走的局面超過 budget 還沒走完 → 說不準，當成沒卡關。
// 所以只會在「確定沒救」時說卡關，不會把還解得開的局面誤判成卡關。純計算，三種接龍共用。
export interface DeadEndSpec<S, A> {
  /** 局面的鑰匙：一樣的局面只走一次 */
  key: (s: S) => string
  /** 這個局面所有能走的步（同樣效果的步可以只列一個，例如搬到哪個空位都一樣） */
  moves: (s: S) => A[]
  /** 走一步；走不了回傳 null */
  apply: (s: S, a: A) => S | null
  /** 已經過關，或確定能直接收完 */
  done: (s: S) => boolean
}

export function provedDeadEnd<S, A>(start: S, spec: DeadEndSpec<S, A>, budget: number): boolean {
  const seen = new Set<string>([spec.key(start)])
  const stack: S[] = [start]
  while (stack.length) {
    const s = stack.pop()!
    if (spec.done(s)) return false
    for (const a of spec.moves(s)) {
      const t = spec.apply(s, a)
      if (!t) continue
      const k = spec.key(t)
      if (seen.has(k)) continue
      if (seen.size >= budget) return false
      seen.add(k)
      stack.push(t)
    }
  }
  return true
}

/** 每一步做完都檢查卡關，要快：手機上一次最多試這麼多個局面（實測約 0.1 秒內） */
export const DEAD_END_BUDGET = 5000
