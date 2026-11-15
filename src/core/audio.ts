// 音效播放：聲音本身在 sfx.ts 用程式算出來（不用外部音檔，離線也能用）。
// 第一次用到某個聲音時才算，每個聲音算 3 個稍微不同的版本輪流播，播放時再加一點點音高變化。
//   撲克牌：洗牌、發牌（滑過桌面）、出牌（拍在桌上）、翻牌、抽起手牌、收牌、敲桌子過牌
//   棋盤：棋子落在木頭棋盤、從棋罐拿棋子、提子丟進盒蓋
//   介面：按鈕（木頭輕敲）、卡片滑動、錯誤、贏、輸（木琴）
import { renderSfx, SFX_NAMES, type SfxName } from './sfx'
import { settings } from './settings'

export type Sound = SfxName

const VARIANTS = 3
let ctx: AudioContext | null = null
let out: GainNode | null = null
const cache = new Map<SfxName, (AudioBuffer | undefined)[]>()
const turn = new Map<SfxName, number>()

function audio(): AudioContext | null {
  if (settings.volume <= 0) return null
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

/** 總輸出：輕微壓縮，很多聲音疊在一起時不會爆音 */
function master(ac: AudioContext): AudioNode {
  if (!out) {
    const comp = ac.createDynamicsCompressor()
    comp.threshold.value = -12
    comp.ratio.value = 3
    out = ac.createGain()
    out.connect(comp).connect(ac.destination)
  }
  out.gain.value = settings.volume
  return out
}

/** 第 v 個版本的聲音；還沒算過就現在算（一次只算一個版本，不會一口氣卡很久） */
function variant(ac: AudioContext, name: SfxName, v: number): AudioBuffer {
  let list = cache.get(name)
  if (!list) cache.set(name, (list = []))
  let buf = list[v]
  if (!buf) {
    const data = renderSfx(name, ac.sampleRate, v + 1)
    buf = ac.createBuffer(1, data.length, ac.sampleRate)
    buf.getChannelData(0).set(data)
    list[v] = buf
  }
  return buf
}

/**
 * 開完 App 後趁空閒把所有聲音先算好：第一次播某個聲音時才算，會在那一刻卡一下（例如結算視窗跳出來時）。
 * 一次只算一個，不影響畫面。
 */
export function warmSounds() {
  let ac: AudioContext
  try {
    ctx ??= new AudioContext()
    ac = ctx
  } catch {
    return
  }
  const todo = SFX_NAMES.flatMap((name) => Array.from({ length: VARIANTS }, (_, v) => [name, v] as const))
  const idle = (fn: () => void) => {
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(fn, { timeout: 2000 })
    else setTimeout(fn, 60)
  }
  const step = () => {
    const next = todo.shift()
    if (!next) return
    variant(ac, next[0], next[1])
    idle(step)
  }
  idle(step)
}

export function playSound(sound: Sound) {
  const ac = audio()
  if (!ac) return
  const k = ((turn.get(sound) ?? 0) + 1) % VARIANTS
  turn.set(sound, k)
  const src = ac.createBufferSource()
  src.buffer = variant(ac, sound, k)
  // 木琴（贏、輸）不變音高；其他聲音每次差一點點
  if (sound !== 'win' && sound !== 'lose') src.playbackRate.value = 1 + (Math.random() * 2 - 1) * 0.04
  src.connect(master(ac))
  src.start(ac.currentTime + 0.002)
}
