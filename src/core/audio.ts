// 音效播放：聲音本身在 sfx.ts 用程式算出來（不用外部音檔，離線也能用）。
// 第一次用到某個聲音時才算，每個聲音算 3 個稍微不同的版本輪流播，播放時再加一點點音高變化。
//   撲克牌：洗牌、發牌（滑過桌面）、出牌（拍在桌上）、翻牌、抽起手牌、收牌、敲桌子過牌
//   棋盤：棋子落在木頭棋盤、從棋罐拿棋子、提子丟進盒蓋
//   介面：按鈕（木頭輕敲）、卡片滑動、錯誤、贏、輸（木琴）
import { renderSfx, type SfxName } from './sfx'
import { settings } from './settings'

export type Sound = SfxName

const VARIANTS = 3
let ctx: AudioContext | null = null
let out: GainNode | null = null
const cache = new Map<SfxName, AudioBuffer[]>()
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

function buffers(ac: AudioContext, name: SfxName): AudioBuffer[] {
  let list = cache.get(name)
  if (!list) {
    list = []
    for (let v = 0; v < VARIANTS; v++) {
      const data = renderSfx(name, ac.sampleRate, v + 1)
      const buf = ac.createBuffer(1, data.length, ac.sampleRate)
      buf.getChannelData(0).set(data)
      list.push(buf)
    }
    cache.set(name, list)
  }
  return list
}

export function playSound(sound: Sound) {
  const ac = audio()
  if (!ac) return
  const list = buffers(ac, sound)
  const k = ((turn.get(sound) ?? 0) + 1) % list.length
  turn.set(sound, k)
  const src = ac.createBufferSource()
  src.buffer = list[k]
  // 木琴（贏、輸）不變音高；其他聲音每次差一點點
  if (sound !== 'win' && sound !== 'lose') src.playbackRate.value = 1 + (Math.random() * 2 - 1) * 0.04
  src.connect(master(ac))
  src.start(ac.currentTime + 0.002)
}
