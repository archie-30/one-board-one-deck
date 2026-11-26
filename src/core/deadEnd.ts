// 三種接龍「電腦算過、確定沒救了」：丟給背景執行緒算（deadEndWorker.ts），算好再告訴畫面。
// 新的一步來了、上一個還沒算完：直接停掉重來（舊的答案已經沒用）。沒有背景執行緒的環境就在這裡算。
import { isDeadEnd as solitaireDead } from '@/engine/solitaire/rules'
import { isDeadEnd as spiderDead } from '@/engine/spider/rules'
import { isDeadEnd as freecellDead } from '@/engine/freecell/rules'
import { isDeadEnd as pyramidDead } from '@/engine/pyramid/rules'

export type DeadEndGame = 'solitaire' | 'spider' | 'freecell' | 'pyramid'

let worker: Worker | null | undefined
let busy: ((dead: boolean) => void) | null = null
let seq = 0

function start(): Worker | null {
  try {
    const w = new Worker(new URL('./deadEndWorker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e: MessageEvent<{ id: number; dead: boolean }>) => {
      if (e.data.id !== seq || !busy) return
      const done = busy
      busy = null
      done(e.data.dead)
    }
    w.onerror = () => {
      worker = null
    }
    return w
  } catch {
    return null
  }
}

/** 這個局面是不是確定過不了關（算不完、算不了都當成不是） */
export function checkDeadEnd(game: DeadEndGame, state: unknown): Promise<boolean> {
  // 畫面上的局面是 Vue 包過的，先變成普通資料才送得過去
  const plain = JSON.parse(JSON.stringify(state))
  if (worker === undefined) worker = start()
  // 上一個還在算：停掉換新的
  if (busy && worker) {
    worker.terminate()
    busy(false)
    busy = null
    worker = start()
  }
  if (!worker) {
    const fn = game === 'solitaire' ? solitaireDead : game === 'spider' ? spiderDead : game === 'pyramid' ? pyramidDead : freecellDead
    return Promise.resolve(fn(plain))
  }
  const id = ++seq
  return new Promise((ok) => {
    busy = ok
    worker!.postMessage({ id, game, state: plain })
  })
}
