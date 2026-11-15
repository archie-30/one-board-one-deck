// 背景執行緒：在這裡算出音效的波形，主畫面永遠不會因為算聲音而卡住。
import { renderSfx, type SfxName } from './sfx'

self.onmessage = (e: MessageEvent<{ name: SfxName; sr: number; v: number }>) => {
  const { name, sr, v } = e.data
  const data = renderSfx(name, sr, v + 1)
  ;(self as unknown as Worker).postMessage({ name, v, data }, [data.buffer])
}
