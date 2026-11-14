// 音效：全部用 WebAudio 即時合成，不需要音檔，離線也能用。
// 依玩法分成三組，聽起來要像真的東西：
//   撲克牌：洗牌（一連串的牌刷過）、發牌（滑過桌面）、出牌（拍在桌上）、翻牌、拿起、敲桌子過牌、收牌
//   棋盤：棋子敲在木頭棋盤上、從棋罐拿棋子、提子（棋子掉進盒蓋）
//   介面：按鈕、卡片滑動、錯誤、贏、輸
// 每次播放都帶一點隨機的音高與音量，連續播放才不會像機器。
import { settings } from './settings'

export type Sound =
  // 介面
  | 'tap'
  | 'slide'
  | 'error'
  | 'win'
  | 'lose'
  // 撲克牌
  | 'shuffle'
  | 'deal'
  | 'card'
  | 'flip'
  | 'cardPick'
  | 'collect'
  | 'pass'
  // 棋盤
  | 'stone'
  | 'stonePick'
  | 'capture'

let ctx: AudioContext | null = null
let noise: AudioBuffer | null = null
let out: GainNode | null = null

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

/** 總輸出：經過一個輕微的壓縮，很多聲音疊在一起時不會爆音 */
function master(ac: AudioContext): AudioNode {
  if (!out) {
    const comp = ac.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.ratio.value = 4
    out = ac.createGain()
    out.connect(comp).connect(ac.destination)
  }
  out.gain.value = settings.volume
  return out
}

function noiseBuffer(ac: AudioContext): AudioBuffer {
  if (!noise) {
    noise = ac.createBuffer(1, ac.sampleRate * 0.6, ac.sampleRate)
    const data = noise.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  }
  return noise
}

const jit = (v: number, amount = 0.08) => v * (1 + (Math.random() * 2 - 1) * amount)

/** 一段濾過的雜訊：紙張、摩擦、敲擊的「沙」聲都是它 */
function burst(
  ac: AudioContext,
  at: number,
  opt: { dur: number; gain: number; freq: number; q?: number; type?: BiquadFilterType; attack?: number; sweepTo?: number },
) {
  const src = ac.createBufferSource()
  src.buffer = noiseBuffer(ac)
  const filter = ac.createBiquadFilter()
  filter.type = opt.type ?? 'bandpass'
  filter.frequency.setValueAtTime(opt.freq, at)
  if (opt.sweepTo) filter.frequency.exponentialRampToValueAtTime(opt.sweepTo, at + opt.dur)
  filter.Q.value = opt.q ?? 1
  const g = ac.createGain()
  const attack = opt.attack ?? 0.002
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(opt.gain, at + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, at + opt.dur)
  src.connect(filter).connect(g).connect(master(ac))
  src.start(at, Math.random() * 0.25)
  src.stop(at + opt.dur + 0.02)
}

/** 一個會衰減的音：木頭、棋子的「叩」、小鈴聲 */
function ping(ac: AudioContext, at: number, opt: { freq: number; dur: number; gain: number; type?: OscillatorType; to?: number; attack?: number }) {
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.type = opt.type ?? 'sine'
  osc.frequency.setValueAtTime(opt.freq, at)
  if (opt.to) osc.frequency.exponentialRampToValueAtTime(opt.to, at + opt.dur)
  const attack = opt.attack ?? 0.002
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(opt.gain, at + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, at + opt.dur)
  osc.connect(g).connect(master(ac))
  osc.start(at)
  osc.stop(at + opt.dur + 0.02)
}

// ── 撲克牌 ──
/** 牌拍在桌上：紙的「啪」＋一點桌面的低音 */
function cardSlap(ac: AudioContext, t: number, k = 1) {
  burst(ac, t, { dur: jit(0.07), gain: 0.55 * k, freq: jit(2600, 0.15), q: 0.6, attack: 0.001 })
  burst(ac, t, { dur: 0.05, gain: 0.25 * k, freq: 6000, type: 'highpass', attack: 0.001 })
  ping(ac, t, { freq: jit(150), to: 70, dur: 0.07, gain: 0.18 * k })
}
/** 牌滑過桌面：一聲「咻」 */
function cardSlide(ac: AudioContext, t: number, k = 1) {
  burst(ac, t, { dur: jit(0.12), gain: 0.22 * k, freq: jit(1400), sweepTo: jit(4200), q: 0.9, attack: 0.03 })
}
/** 洗牌：一長串很快的「噠噠噠」，最後兩疊合起來 */
function riffle(ac: AudioContext, t: number) {
  const n = 26
  let at = t
  for (let i = 0; i < n; i++) {
    const k = 0.5 + 0.5 * Math.sin((i / n) * Math.PI)
    burst(ac, at, { dur: 0.018, gain: 0.32 * k * jit(1, 0.3), freq: jit(3800, 0.2), q: 1.2, attack: 0.001 })
    at += jit(0.016, 0.35)
  }
  cardSlap(ac, at + 0.05, 0.8)
  burst(ac, at + 0.05, { dur: 0.16, gain: 0.12, freq: 2000, sweepTo: 900, q: 0.7, attack: 0.01 })
}
/** 敲兩下桌子（過牌） */
function knock(ac: AudioContext, t: number) {
  for (const d of [0, 0.13]) {
    ping(ac, t + d, { freq: jit(180), to: 95, dur: 0.09, gain: 0.45, type: 'triangle' })
    burst(ac, t + d, { dur: 0.04, gain: 0.25, freq: 900, type: 'lowpass', attack: 0.001 })
  }
}

// ── 棋盤 ──
/** 棋子敲在木頭棋盤上：清脆的「叩」＋木頭共鳴 */
function stoneClack(ac: AudioContext, t: number, k = 1) {
  burst(ac, t, { dur: 0.012, gain: 0.5 * k, freq: 5200, type: 'highpass', attack: 0.0005 })
  ping(ac, t, { freq: jit(2300, 0.06), to: 1900, dur: 0.05, gain: 0.32 * k, type: 'triangle', attack: 0.0005 })
  ping(ac, t, { freq: jit(620, 0.05), to: 520, dur: 0.12, gain: 0.3 * k, attack: 0.001 })
  ping(ac, t + 0.004, { freq: jit(210), to: 160, dur: 0.1, gain: 0.18 * k })
}
/** 棋子在棋罐裡互相碰撞的「喀啦」 */
function rattle(ac: AudioContext, t: number, count: number, spread: number, k = 1) {
  for (let i = 0; i < count; i++) {
    const at = t + Math.random() * spread
    ping(ac, at, { freq: jit(3400, 0.25), dur: 0.025, gain: 0.14 * k * jit(1, 0.4), type: 'triangle', attack: 0.0005 })
    burst(ac, at, { dur: 0.01, gain: 0.12 * k, freq: 6500, type: 'highpass', attack: 0.0005 })
  }
}

export function playSound(sound: Sound) {
  const ac = audio()
  if (!ac) return
  const t = ac.currentTime + 0.005
  switch (sound) {
    // 介面
    case 'tap':
      ping(ac, t, { freq: jit(1500, 0.04), to: 1100, dur: 0.035, gain: 0.16, type: 'triangle' })
      burst(ac, t, { dur: 0.015, gain: 0.12, freq: 5000, type: 'highpass' })
      break
    case 'slide':
      burst(ac, t, { dur: 0.2, gain: 0.16, freq: 700, sweepTo: 2600, q: 0.8, attack: 0.05 })
      break
    case 'error':
      ping(ac, t, { freq: 190, dur: 0.08, gain: 0.25, type: 'triangle' })
      ping(ac, t + 0.1, { freq: 150, dur: 0.12, gain: 0.25, type: 'triangle' })
      break
    case 'win':
      // 木琴般的上行四個音
      ;[523, 659, 784, 1047].forEach((f, i) => {
        ping(ac, t + i * 0.1, { freq: f, dur: 0.45, gain: 0.22 })
        ping(ac, t + i * 0.1, { freq: f * 4, dur: 0.08, gain: 0.05 })
      })
      break
    case 'lose':
      ;[392, 349, 294].forEach((f, i) => ping(ac, t + i * 0.16, { freq: f, dur: 0.5, gain: 0.2 }))
      break
    // 撲克牌
    case 'shuffle':
      riffle(ac, t)
      break
    case 'deal':
      cardSlide(ac, t, 0.9)
      burst(ac, t + 0.09, { dur: 0.03, gain: 0.18, freq: 3000, q: 0.8 })
      break
    case 'card':
      cardSlap(ac, t)
      break
    case 'flip':
      burst(ac, t, { dur: 0.03, gain: 0.3, freq: 4200, q: 1.5 })
      burst(ac, t + 0.045, { dur: 0.05, gain: 0.35, freq: 2600, q: 0.8 })
      break
    case 'cardPick':
      burst(ac, t, { dur: 0.04, gain: 0.22, freq: jit(5200), q: 1.5, attack: 0.004 })
      break
    case 'collect':
      cardSlap(ac, t, 0.8)
      ping(ac, t + 0.02, { freq: jit(1320, 0.03), dur: 0.22, gain: 0.08 })
      break
    case 'pass':
      knock(ac, t)
      break
    // 棋盤
    case 'stone':
      stoneClack(ac, t)
      break
    case 'stonePick':
      rattle(ac, t, 4, 0.08, 0.8)
      break
    case 'capture':
      rattle(ac, t, 9, 0.28)
      break
  }
}
