import { describe, expect, it, vi } from 'vitest'

// 測試環境沒有瀏覽器的 localStorage：用一個簡單的代替品
const mem = new Map<string, string>()
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() {
    return mem.size
  },
}

describe('保存的進度：同一個玩法不同難度各自一份', () => {
  it('選簡單不會讀到困難的存檔；沒有難度的玩法照舊一格', async () => {
    localStorage.clear()
    vi.resetModules()
    const r = await import('./resume')
    r.setResume(r.resumeSlot('gomoku', 'high'), { n: 1 }, { difficulty: 'high' })
    expect(r.getResume(r.resumeSlot('gomoku', 'mid'))).toBeNull()
    expect(r.getResume(r.resumeSlot('gomoku', 'high'))?.data).toEqual({ n: 1 })
    expect(r.resumeSlot('redpoint', undefined)).toBe('redpoint')
  })
  it('舊存檔（放在玩法那一格）：難度一樣才搬過去用', async () => {
    localStorage.clear()
    localStorage.setItem('obod.resume.v1', JSON.stringify({ gomoku: { savedAt: 1, options: { difficulty: 'high' }, data: { old: true } } }))
    vi.resetModules()
    const r = await import('./resume')
    expect(r.getResume(r.resumeSlot('gomoku', 'mid'))).toBeNull()
    expect(r.getResume(r.resumeSlot('gomoku', 'high'))?.data).toEqual({ old: true })
    // 搬過去之後舊的那格就沒了
    expect(r.getResume('gomoku')).toBeNull()
  })
})
