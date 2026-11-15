// 音效的「原料」：每個聲音都用程式一個取樣點一個取樣點算出來（不用任何外部音檔）。
// 這個檔案是純計算，不碰瀏覽器，所以也能在電腦上直接算出來檢查波形。
//
// 做法：
//   - 紙牌：寬頻雜訊經過濾波（紙張摩擦、拍擊的「沙」聲）＋極短的敲擊（牌邊碰到桌面）
//   - 木頭、棋子：模態合成——一次敲擊同時激發好幾個會衰減的共振頻率（木頭的「叩」、石頭的「喀」）
//   - 木琴（贏、輸）：基音＋4 倍泛音，快速衰減
// 每個聲音可以給不同的 seed，做出幾個稍微不一樣的版本輪流播放，聽起來才不會像機器。

export type SfxName =
  | 'tap'
  | 'slide'
  | 'error'
  | 'win'
  | 'lose'
  | 'shuffle'
  | 'deal'
  | 'card'
  | 'flip'
  | 'cardPick'
  | 'collect'
  | 'pass'
  | 'stone'
  | 'stonePick'
  | 'capture'
  | 'piece'

// ── 基本工具 ──
function makeRand(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}
type Rand = () => number

class Buf {
  data: Float32Array
  constructor(
    readonly sr: number,
    seconds: number,
  ) {
    this.data = new Float32Array(Math.ceil(sr * seconds))
  }
  /** 在 t 秒處加入一段訊號 */
  add(t: number, src: Float32Array, gain = 1) {
    const o = Math.round(t * this.sr)
    for (let i = 0; i < src.length && o + i < this.data.length; i++) if (o + i >= 0) this.data[o + i] += src[i] * gain
  }
  /** 結尾 15 毫秒淡出，再正規化到指定的峰值 */
  normalize(peak: number) {
    const tail = Math.min(this.data.length, Math.ceil(0.015 * this.sr))
    for (let i = 0; i < tail; i++) this.data[this.data.length - 1 - i] *= i / tail
    let m = 0
    for (const v of this.data) m = Math.max(m, Math.abs(v))
    if (m > 0) for (let i = 0; i < this.data.length; i++) this.data[i] *= peak / m
    return this
  }
}

/** RBJ 雙二階濾波器 */
function biquad(x: Float32Array, sr: number, type: 'lp' | 'hp' | 'bp', freq: number | ((i: number) => number), q = 0.707): Float32Array {
  const y = new Float32Array(x.length)
  let x1 = 0
  let x2 = 0
  let y1 = 0
  let y2 = 0
  let b0 = 0
  let b1 = 0
  let b2 = 0
  let a1 = 0
  let a2 = 0
  const coef = (f: number) => {
    const w = (2 * Math.PI * Math.min(f, sr * 0.45)) / sr
    const cos = Math.cos(w)
    const alpha = Math.sin(w) / (2 * q)
    const a0 = 1 + alpha
    if (type === 'lp') {
      b0 = (1 - cos) / 2 / a0
      b1 = (1 - cos) / a0
      b2 = b0
    } else if (type === 'hp') {
      b0 = (1 + cos) / 2 / a0
      b1 = -(1 + cos) / a0
      b2 = b0
    } else {
      b0 = alpha / a0
      b1 = 0
      b2 = -alpha / a0
    }
    a1 = (-2 * cos) / a0
    a2 = (1 - alpha) / a0
  }
  const dynamic = typeof freq === 'function'
  if (!dynamic) coef(freq)
  for (let i = 0; i < x.length; i++) {
    if (dynamic && i % 32 === 0) coef(freq(i))
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
    x2 = x1
    x1 = x[i]
    y2 = y1
    y1 = v
    y[i] = v
  }
  return y
}

function noise(n: number, rand: Rand): Float32Array {
  const a = new Float32Array(n)
  for (let i = 0; i < n; i++) a[i] = rand() * 2 - 1
  return a
}

/** 套上包絡：attack 秒內升起，之後以 decay 秒為時間常數指數衰減 */
function env(x: Float32Array, sr: number, attack: number, decay: number): Float32Array {
  const A = Math.max(1, attack * sr)
  for (let i = 0; i < x.length; i++) {
    const t = i / sr
    const up = i < A ? i / A : 1
    x[i] *= up * Math.exp(-Math.max(0, t - attack) / decay)
  }
  return x
}

/** 濾過的雜訊一陣（紙張、摩擦） */
function hiss(sr: number, rand: Rand, dur: number, type: 'lp' | 'hp' | 'bp', freq: number | ((i: number) => number), q: number, attack: number, decay: number) {
  return env(biquad(noise(Math.ceil(dur * sr), rand), sr, type, freq, q), sr, attack, decay)
}

/** 模態合成：同時激發幾個會衰減的共振頻率 */
function modes(sr: number, dur: number, list: { f: number; a: number; d: number }[], rand: Rand, detune = 0.02): Float32Array {
  const n = Math.ceil(dur * sr)
  const y = new Float32Array(n)
  for (const m of list) {
    const f = m.f * (1 + (rand() * 2 - 1) * detune)
    const ph = rand() * Math.PI * 2
    for (let i = 0; i < n; i++) {
      const t = i / sr
      y[i] += m.a * Math.exp(-t / m.d) * Math.sin(2 * Math.PI * f * t + ph)
    }
  }
  // 起音的地方加一點點柔化、結尾淡出，避免喀聲
  const fade = Math.ceil(0.0006 * sr)
  for (let i = 0; i < fade && i < n; i++) y[i] *= i / fade
  const tail = Math.ceil(n * 0.3)
  for (let i = 0; i < tail; i++) y[n - 1 - i] *= i / tail
  return y
}

/** 極短的敲擊（邊緣碰撞） */
function click(sr: number, rand: Rand, freq: number, dur = 0.004) {
  return hiss(sr, rand, dur + 0.01, 'bp', freq, 0.9, 0.0003, dur / 3)
}

// ── 紙牌 ──
/** 一張牌拍在桌上（像真的紙牌）：全部用寬頻雜訊、不帶音高。
 *  極短的寬頻「啪」（牌面壓出空氣）＋紙張的悶聲＋桌面一點低頻，最後一點點紙的沙聲。 */
function cardSlap(b: Buf, t: number, rand: Rand, k = 1) {
  const sr = b.sr
  // 啪：1～2 毫秒的寬頻雜訊（高通 1.2k、低通 7k，Q 低才不會有「叮」的音高）
  const snap = biquad(hiss(sr, rand, 0.012, 'hp', 1200, 0.5, 0.0002, 0.0016), sr, 'lp', 7000, 0.5)
  b.add(t, snap, 0.75 * k)
  // 紙面：較悶的一團（低通 1.4k 附近）
  b.add(t, hiss(sr, rand, 0.06, 'lp', 1300 + rand() * 300, 0.5, 0.0006, 0.011), 0.9 * k)
  // 桌面：低頻的一點「噗」
  b.add(t, hiss(sr, rand, 0.06, 'lp', 170, 0.5, 0.0015, 0.016), 0.7 * k)
  // 落定後紙邊的一點沙聲
  b.add(t + 0.006 + rand() * 0.004, hiss(sr, rand, 0.05, 'bp', 2400 + rand() * 600, 0.4, 0.002, 0.012), 0.16 * k)
}
/** 牌滑過桌面：摩擦的沙沙聲，最後輕輕停下 */
function cardSlide(b: Buf, t: number, rand: Rand, len: number, k = 1) {
  const sr = b.sr
  const n = Math.ceil(len * sr)
  const x = biquad(biquad(noise(n, rand), sr, 'hp', 700), sr, 'lp', (i) => 2600 + 2400 * (i / n), 0.6)
  for (let i = 0; i < n; i++) {
    const p = i / n
    // 升起、維持、收尾，加上一點不規則的顫動（紙面和桌布摩擦）
    const shape = Math.min(1, p / 0.18) * Math.min(1, (1 - p) / 0.3)
    const flutter = 0.75 + 0.25 * Math.sin(i * 0.0021 + rand() * 0.2)
    x[i] *= shape * flutter
  }
  b.add(t, x, 0.5 * k)
}

// ── 木頭、棋子 ──
/** 木頭的「叩」（敲桌子、按鈕） */
function woodKnock(b: Buf, t: number, rand: Rand, base: number, k = 1, dur = 0.16) {
  const sr = b.sr
  b.add(
    t,
    modes(
      sr,
      dur,
      [
        { f: base, a: 1, d: 0.045 },
        { f: base * 2.27, a: 0.55, d: 0.022 },
        { f: base * 4.1, a: 0.3, d: 0.01 },
        { f: base * 6.6, a: 0.15, d: 0.006 },
      ],
      rand,
    ),
    k,
  )
  b.add(t, click(sr, rand, base * 5, 0.002), 0.25 * k)
}
/** 棋子落在木頭棋盤上：石頭清脆的「喀」＋棋盤木頭的共鳴 */
function stoneOnBoard(b: Buf, t: number, rand: Rand, k = 1) {
  const sr = b.sr
  b.add(t, click(sr, rand, 3800, 0.0015), 0.55 * k)
  b.add(
    t,
    modes(
      sr,
      0.3,
      [
        // 石頭本身：清脆但不刺耳（高頻壓低，避免像敲玻璃）
        { f: 2200, a: 0.45, d: 0.008 },
        { f: 3300, a: 0.18, d: 0.005 },
        // 棋盤木頭：中低頻，比較長
        { f: 690, a: 0.8, d: 0.05 },
        { f: 1120, a: 0.45, d: 0.03 },
        { f: 240, a: 0.45, d: 0.07 },
      ],
      rand,
      0.03,
    ),
    k,
  )
}
/** 兩顆棋子互相碰到的「喀」（棋罐裡、盒蓋裡） */
function stoneTick(b: Buf, t: number, rand: Rand, k = 1) {
  const sr = b.sr
  // 棋子互相碰撞：短促的「喀」，主要是被濾過的敲擊聲，只帶一點點音高（太純的高音聽起來像玻璃）
  const f = 2000 + rand() * 900
  b.add(t, hiss(sr, rand, 0.03, 'bp', f, 1.2, 0.0004, 0.004), k)
  b.add(t, modes(sr, 0.04, [{ f, a: 0.35, d: 0.003 }], rand, 0.05), k)
}
/** 木琴的一個音 */
function marimba(b: Buf, t: number, rand: Rand, f: number, k = 1, d = 0.35) {
  b.add(
    t,
    modes(
      b.sr,
      d * 3,
      [
        { f, a: 1, d },
        { f: f * 4, a: 0.25, d: d * 0.18 },
        { f: f * 9.8, a: 0.06, d: d * 0.05 },
      ],
      rand,
      0.002,
    ),
    k,
  )
}

/** 算出一個聲音（seed 不同，聲音就稍微不同） */
export function renderSfx(name: SfxName, sr: number, seed = 1): Float32Array {
  const rand = makeRand(seed * 9973 + name.length * 131)
  let b: Buf
  switch (name) {
    case 'tap': {
      // 按鈕：手指按下厚紙板的悶悶一聲（沒有高頻的「叮」）
      b = new Buf(sr, 0.09)
      b.add(0, hiss(sr, rand, 0.05, 'lp', 1500 + rand() * 300, 0.7, 0.0008, 0.008), 0.8)
      b.add(0, modes(sr, 0.08, [{ f: 300 + rand() * 30, a: 1, d: 0.018 }, { f: 690, a: 0.35, d: 0.009 }], rand), 0.6)
      return b.normalize(0.32).data
    }
    case 'slide': {
      b = new Buf(sr, 0.3)
      const n = Math.ceil(0.26 * sr)
      const x = biquad(noise(n, rand), sr, 'bp', (i) => 600 + 2200 * (i / n), 0.8)
      for (let i = 0; i < n; i++) x[i] *= Math.sin((Math.PI * i) / n) ** 1.5
      b.add(0, x)
      return b.normalize(0.3).data
    }
    case 'error': {
      b = new Buf(sr, 0.32)
      woodKnock(b, 0, rand, 210, 1, 0.14)
      woodKnock(b, 0.12, rand, 160, 0.9, 0.16)
      return b.normalize(0.5).data
    }
    case 'win': {
      b = new Buf(sr, 1.6)
      ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) => marimba(b, i * 0.11, rand, f, i === 3 ? 1.1 : 0.9))
      marimba(b, 0.33, rand, 1318.5, 0.35, 0.25)
      return b.normalize(0.6).data
    }
    case 'lose': {
      b = new Buf(sr, 1.6)
      ;[392, 329.63, 261.63].forEach((f, i) => marimba(b, i * 0.18, rand, f, 0.9, 0.42))
      return b.normalize(0.5).data
    }
    case 'shuffle': {
      // 洗牌：兩疊牌用拇指撥開互相交錯（一長串細小的「噠」），最後把牌推齊
      b = new Buf(sr, 0.95)
      const n = 46
      let t = 0.02
      for (let i = 0; i < n; i++) {
        const p = i / n
        const k = 0.35 + 0.65 * Math.sin(Math.PI * p)
        b.add(t, hiss(sr, rand, 0.02, 'bp', 2800 + rand() * 2600, 1.4, 0.0004, 0.0035), k * (0.7 + rand() * 0.4))
        t += 0.006 + 0.012 * (1 - Math.sin(Math.PI * p)) * 0.6 + rand() * 0.004
      }
      // 底下一層紙張摩擦的沙沙聲
      cardSlide(b, 0.02, rand, t, 0.35)
      // 推齊：一聲較厚的拍擊
      cardSlap(b, t + 0.09, rand, 0.9)
      return b.normalize(0.55).data
    }
    case 'deal': {
      b = new Buf(sr, 0.2)
      cardSlide(b, 0, rand, 0.11, 0.9)
      cardSlap(b, 0.1, rand, 0.45)
      return b.normalize(0.42).data
    }
    case 'card': {
      b = new Buf(sr, 0.14)
      cardSlap(b, 0, rand)
      return b.normalize(0.55).data
    }
    case 'flip': {
      // 翻牌：指尖把牌邊撥起的「嗤」，牌面掀過去帶起一點風（咻），再輕輕落下
      b = new Buf(sr, 0.16)
      b.add(0, biquad(hiss(sr, rand, 0.012, 'hp', 2200, 0.5, 0.0002, 0.0012), sr, 'lp', 8000, 0.5), 0.5)
      const n = Math.ceil(0.05 * sr)
      const whoosh = biquad(noise(n, rand), sr, 'lp', (i) => 700 + 2000 * Math.sin((Math.PI * i) / n), 0.5)
      for (let i = 0; i < n; i++) whoosh[i] *= Math.sin((Math.PI * i) / n) ** 2
      b.add(0.004, whoosh, 0.45)
      cardSlap(b, 0.05 + rand() * 0.008, rand, 0.6)
      return b.normalize(0.42).data
    }
    case 'cardPick': {
      // 從手牌裡抽起一張：輕輕的摩擦
      b = new Buf(sr, 0.1)
      const n = Math.ceil(0.07 * sr)
      const x = biquad(noise(n, rand), sr, 'bp', (i) => 3000 + 2500 * (i / n), 1.2)
      for (let i = 0; i < n; i++) x[i] *= Math.sin((Math.PI * i) / n)
      b.add(0, x)
      return b.normalize(0.28).data
    }
    case 'collect': {
      // 收到收牌區：疊到別的牌上，拍一下再順手推齊（兩聲紙牌聲，不帶音高）
      b = new Buf(sr, 0.16)
      cardSlap(b, 0, rand, 0.9)
      cardSlap(b, 0.035 + rand() * 0.01, rand, 0.35)
      return b.normalize(0.48).data
    }
    case 'pass': {
      // 過牌：手指在木頭桌上敲兩下
      b = new Buf(sr, 0.4)
      woodKnock(b, 0, rand, 185 + rand() * 15, 1, 0.18)
      woodKnock(b, 0.14 + rand() * 0.02, rand, 175 + rand() * 15, 0.85, 0.18)
      return b.normalize(0.6).data
    }
    case 'stone': {
      b = new Buf(sr, 0.32)
      stoneOnBoard(b, 0, rand)
      return b.normalize(0.65).data
    }
    case 'stonePick': {
      // 手伸進棋罐拿一顆：幾顆棋子互相碰撞
      b = new Buf(sr, 0.2)
      const n = 4 + Math.floor(rand() * 3)
      for (let i = 0; i < n; i++) stoneTick(b, rand() * 0.12, rand, 0.5 + rand() * 0.5)
      b.add(0, hiss(sr, rand, 0.15, 'bp', 4500, 0.8, 0.01, 0.04), 0.06)
      return b.normalize(0.32).data
    }
    case 'piece': {
      // 西洋棋、象棋走子：木頭棋子（底下貼著絨布）放在木頭棋盤上，比較悶的「叩」
      b = new Buf(sr, 0.22)
      b.add(0, hiss(sr, rand, 0.03, 'lp', 1800, 0.8, 0.0008, 0.006), 0.5)
      b.add(
        0.001,
        modes(
          sr,
          0.2,
          [
            { f: 420 + rand() * 40, a: 1, d: 0.035 },
            { f: 980, a: 0.45, d: 0.018 },
            { f: 1850, a: 0.2, d: 0.008 },
          ],
          rand,
          0.03,
        ),
      )
      return b.normalize(0.55).data
    }
    case 'capture': {
      // 提子：被提的子一顆顆丟進盒蓋
      b = new Buf(sr, 0.5)
      const n = 9 + Math.floor(rand() * 4)
      for (let i = 0; i < n; i++) {
        const t = (i / n) * 0.3 + rand() * 0.03
        stoneTick(b, t, rand, 0.6 + rand() * 0.4)
        if (rand() < 0.35) stoneTick(b, t + 0.008, rand, 0.4)
      }
      return b.normalize(0.45).data
    }
  }
}

export const SFX_NAMES: SfxName[] = ['tap', 'slide', 'error', 'win', 'lose', 'shuffle', 'deal', 'card', 'flip', 'cardPick', 'collect', 'pass', 'stone', 'stonePick', 'capture', 'piece']
