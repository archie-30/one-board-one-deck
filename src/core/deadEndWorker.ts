// 背景執行緒：算三種接龍「是不是真的卡關了」（engine 的 isDeadEnd），最久要零點幾秒，不能卡住畫面。
import { isDeadEnd as solitaireDead } from '@/engine/solitaire/rules'
import { isDeadEnd as spiderDead } from '@/engine/spider/rules'
import { isDeadEnd as freecellDead } from '@/engine/freecell/rules'
import { isDeadEnd as pyramidDead } from '@/engine/pyramid/rules'
import type { DeadEndGame } from './deadEnd'

self.onmessage = (e: MessageEvent<{ id: number; game: DeadEndGame; state: never }>) => {
  const { id, game, state } = e.data
  const dead = game === 'solitaire' ? solitaireDead(state) : game === 'spider' ? spiderDead(state) : game === 'pyramid' ? pyramidDead(state) : freecellDead(state)
  ;(self as unknown as Worker).postMessage({ id, dead })
}
