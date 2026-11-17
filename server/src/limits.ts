// 次數限制（記在伺服器記憶體裡；伺服器休眠重開就清空，夠用）

/** 一段時間內最多幾次（滑動視窗） */
export class Window {
  private hits = new Map<string, number[]>()
  constructor(
    private max: number,
    private ms: number,
  ) {}
  /** 記一次；超過上限回傳 false */
  hit(key: string, now: number): boolean {
    const list = (this.hits.get(key) ?? []).filter((t) => t > now - this.ms)
    if (list.length >= this.max) {
      this.hits.set(key, list)
      return false
    }
    list.push(now)
    this.hits.set(key, list)
    if (this.hits.size > 5000) this.prune(now)
    return true
  }
  count(key: string, now: number): number {
    return (this.hits.get(key) ?? []).filter((t) => t > now - this.ms).length
  }
  private prune(now: number) {
    for (const [k, v] of this.hits) if (!v.some((t) => t > now - this.ms)) this.hits.delete(k)
  }
}

/** 每條 WebSocket 的訊息頻率：桶子最多 burst 個，每秒補 rate 個 */
export class Bucket {
  private tokens: number
  private last: number
  constructor(
    private burst: number,
    private rate: number,
    now: number,
  ) {
    this.tokens = burst
    this.last = now
  }
  take(now: number): boolean {
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.rate)
    this.last = now
    if (this.tokens < 1) return false
    this.tokens -= 1
    return true
  }
}
