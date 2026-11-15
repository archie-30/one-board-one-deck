// 音效的「原料」：每個聲音都用程式一個取樣點一個取樣點算出來（不用任何外部音檔）。
// 這個檔案是純計算，不碰瀏覽器，所以也能在電腦上直接算出來檢查波形。
//
// 做法：棋子、紙牌、敲桌等碰撞聲，照真實錄音量到的頻譜形狀與衰減速度合成（見下方「碰撞聲」）；
// 摩擦聲用頻帶噪音；贏、輸、和局用木琴。

export type SfxName =
  // 介面
  | 'tap'
  | 'slide'
  | 'error'
  | 'win'
  | 'lose'
  | 'draw'
  | 'reveal'
  | 'correct'
  // 紙牌
  | 'shuffle'
  | 'deal'
  | 'card'
  | 'flip'
  | 'cardPick'
  | 'collect'
  | 'pass'
  // 棋類
  | 'stone'
  | 'stonePick'
  | 'capture'
  | 'piece'
  | 'chessCapture'
  | 'xqPiece'
  | 'xqCapture'
  | 'piecePick'

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

// ── 碰撞聲：依「真實錄音量到的頻譜形狀與衰減速度」合成 ──
// 量了開源遊戲裡實際錄下來的聲音（lichess 西洋棋、KaTrain／Sabaki 圍棋、KDE KPat 紙牌、ESC-50 敲木門），
// 發現棋子、紙牌的聲音都是「極短、帶頻譜形狀的噪音爆音」：各頻段大多幾毫秒就衰減掉，不是一直響的音。
// 所以這裡把聲音拆成 18 個 1/3 八度的頻段（283 Hz～14 kHz），每個頻段一段濾過的噪音，
// 照量到的音量（lvl，dB）與衰減時間（tau，毫秒）合成，再加上量到的低頻悶響（棋盤、桌面被打到的「咚」）。
// 這裡只記錄量到的少數幾個數字，不包含、也不複製任何錄音本身。

/** 18 個頻段的中心頻率（Hz） */
const BANDS = [283, 356, 449, 566, 713, 898, 1131, 1426, 1796, 2263, 2851, 3592, 4526, 5702, 7184, 9052, 11404, 14368]

interface Profile {
  /** 各頻段的音量（dB，最大的那段約 0） */
  lvl: number[]
  /** 各頻段的衰減時間常數（毫秒） */
  tau: number[]
  /** 低頻悶響：頻率、音量（dB，和上面同一個尺度）、衰減（毫秒） */
  lf?: { f: number; lvl: number; tau: number }
}

// 量到的數值（四捨五入）
const P = {
  /** 圍棋落子（三種：KaTrain 兩種、Sabaki 一種） */
  stone: [
    { lvl: [-18, -26, -21, -17, -24, -13, -14, -11, -9, 0, -4, -4, -1, -3, -16, -23, -33, -38], tau: [5, 4, 8, 6, 10, 4, 3, 11, 10, 3, 13, 12, 7, 7, 8, 8, 13, 19], lf: { f: 59, lvl: -6, tau: 12 } },
    { lvl: [-18, -22, -22, -17, -25, -17, -17, -20, -10, -5, -7, -4, -4, 0, -9, -20, -25, -38], tau: [2, 8, 6, 6, 7, 7, 7, 12, 11, 6, 13, 10, 11, 8, 15, 16, 11, 18], lf: { f: 72, lvl: -9, tau: 10 } },
    { lvl: [-21, -17, -21, -22, -15, -21, -15, -11, -14, -7, -8, -4, 0, -7, -8, -12, -19, -30], tau: [2, 2, 2, 4, 6, 6, 3, 2, 8, 5, 9, 5, 6, 9, 8, 10, 10, 10], lf: { f: 51, lvl: -12, tau: 9 } },
  ] as Profile[],
  /** 棋石互碰（KaTrain 提子錄音裡一顆顆碰撞的平均） */
  stoneTick: { lvl: [-14, -14, -12, -8, -6, -4, -4, -6, -1, -1, 0, -14, -7, -6, -4, -5, -8, -10], tau: [4, 1, 4, 4, 4, 4, 4, 4, 4, 4, 4, 5, 4, 4, 1, 1, 1, 1] } as Profile,
  /** 西洋棋走子（lichess）：極短的悶「叩」＋棋盤的低頻 */
  chessMove: { lvl: [-28, -16, -8, 0, -3, -4, -8, -17, -23, -30, -29, -38, -42, -51, -56, -58, -63, -80], tau: [3, 2, 2, 1.4, 2, 1.4, 1.4, 4, 3, 4, 4, 3, 2, 4, 4, 4, 6, 6], lf: { f: 75, lvl: 0, tau: 7 } } as Profile,
  /** 西洋棋吃子（lichess）：比較寬、比較響 */
  chessCapture: { lvl: [-15, -14, -13, -7, -6, -4, -3, -4, 0, -4, -16, -20, -32, -25, -46, -55, -64, -80], tau: [2, 2, 1.4, 1.4, 2, 2, 2, 3, 4, 2, 5, 2, 2, 4, 4, 2, 4, 4], lf: { f: 94, lvl: -10, tau: 6 } } as Profile,
  /** 指節敲木頭（ESC-50 敲木門） */
  knock: { lvl: [0, -2, -6, -8, -8, -13, -24, -16, -20, -27, -30, -30, -34, -43, -44, -47, -49, -52], tau: [9, 4, 5, 5, 4, 4, 5, 1.4, 1.4, 2, 3, 2, 2, 3, 2, 3, 4, 4], lf: { f: 89, lvl: -6, tau: 11 } } as Profile,
  /** 紙牌落在桌上（KPat card-down 撞擊那一下） */
  cardDown: { lvl: [1, -16, -16, -12, -7, -4, -11, -17, -1, 0, -5, -3, -13, -4, -13, -17, -34, -37].map((v) => v - 1), tau: [20, 20, 19, 18, 7, 10, 13, 20, 9, 11, 11, 12, 15, 9, 13, 15, 20, 20].map((v) => v * 0.6), lf: { f: 89, lvl: 0, tau: 12 } } as Profile,
  /** 紙牌被拿起、彈開（KPat card-pickup 的那一下「啪」） */
  cardSnap: { lvl: [-38, -28, -31, -30, -19, -17, -9, -1, -11, -12, 0, 0, -4, -4, -12, -12, -21, -49], tau: [20, 12, 4, 8, 4, 5, 5, 4, 5, 8, 3, 2, 2, 2, 1.4, 2, 2, 2] } as Profile,
}

/** 原地 FFT（長度要是 2 的次方）；inverse = true 時做反轉換（含 1/n） */
function fft(re: Float64Array, im: Float64Array, inverse = false) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len
    const wr = Math.cos(ang)
    const wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cr = 1
      let ci = 0
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci
        const ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr
        re[i + k + len / 2] = re[i + k] - ar
        im[i + k + len / 2] = im[i + k] - ai
        re[i + k] += ar
        im[i + k] += ai
        const t = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = t
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) (re[i] /= n), (im[i] /= n)
}

/** 第 k 個頻段的權重（相鄰頻段之間用 cos² 交叉淡入淡出，全部加起來是 1；頻段外很快歸零，不會漏到別的頻段） */
function bandWeight(f: number, centers: number[], k: number): number {
  const lf = Math.log2(Math.max(1, f))
  const c = Math.log2(centers[k])
  const prev = k > 0 ? Math.log2(centers[k - 1]) : c - 1 / 3
  const next = k < centers.length - 1 ? Math.log2(centers[k + 1]) : c + 1 / 3
  if (lf <= prev || lf >= next) return 0
  const x = lf < c ? (c - lf) / (c - prev) : (lf - c) / (next - c)
  return Math.cos((Math.PI / 2) * x) ** 2
}

/** 把一個頻譜形狀合成成聲音。shift：整體往上（正）或往下（負）移幾個 1/3 八度；tauMul：衰減放慢幾倍 */
function burst(sr: number, rand: Rand, p: Profile, opts: { shift?: number; tauMul?: number; attack?: number; jitter?: number } = {}): Float32Array {
  const shift = opts.shift ?? 0
  const tm = opts.tauMul ?? 1
  const jit = opts.jitter ?? 1.5
  const att = Math.max(0.0002, opts.attack ?? 0.0006)
  const longest = Math.max(...p.tau, p.lf?.tau ?? 0) * tm
  const n = Math.ceil((att + (longest * 7) / 1000 + 0.004) * sr)
  let size = 1
  while (size < n) size <<= 1
  const y = new Float32Array(n)
  const envAt = (i: number, tau: number) => {
    const t = i / sr
    const rise = t < att ? Math.sin((Math.PI / 2) * (t / att)) : 1
    return rise * Math.exp(-Math.max(0, t - att) / tau)
  }
  const centers = BANDS.map((f) => f * Math.pow(2, shift / 3))
  // 同一份隨機相位的「白噪音頻譜」，每個頻段各切一塊出來
  const ph = new Float64Array(size / 2 + 1)
  for (let i = 0; i < ph.length; i++) ph[i] = rand() * 2 * Math.PI
  const re = new Float64Array(size)
  const im = new Float64Array(size)
  centers.forEach((fc, k) => {
    if (fc > sr * 0.45) return
    const lvl = p.lvl[k] + (rand() * 2 - 1) * jit
    if (lvl < -60) return
    const tau = Math.max(0.0008, (p.tau[k] * tm * (0.85 + rand() * 0.3)) / 1000)
    re.fill(0)
    im.fill(0)
    for (let i = 1; i < size / 2; i++) {
      const w = bandWeight((i * sr) / size, centers, k)
      if (!w) continue
      re[i] = w * Math.cos(ph[i])
      im[i] = w * Math.sin(ph[i])
      re[size - i] = re[i]
      im[size - i] = -im[i]
    }
    fft(re, im, true)
    // 每個頻段先調成一樣的能量，再照量到的音量放大（量到的是頻段的總能量）
    let rms = 0
    for (let i = 0; i < n; i++) rms += re[i] * re[i]
    rms = Math.sqrt(rms / n) || 1
    const g = Math.pow(10, lvl / 20) / rms
    for (let i = 0; i < n; i++) y[i] += re[i] * g * envAt(i, tau)
  })
  if (p.lf) {
    // 棋盤、桌面被打到的低頻「咚」：很短的低音（混一點低頻噪音，才不是純音）
    const f = p.lf.f * Math.pow(2, shift / 6) * (0.95 + rand() * 0.1)
    const tau = (p.lf.tau * tm) / 1000
    const g = Math.pow(10, p.lf.lvl / 20) * 1.4
    const nz = biquad(noise(n, rand), sr, 'lp', f * 2, 0.7)
    for (let i = 0; i < n; i++) y[i] += g * envAt(i, tau) * (Math.sin((2 * Math.PI * f * i) / sr) + 1.2 * nz[i])
  }
  return y
}
function peakOf(x: Float32Array) {
  let m = 0
  for (const v of x) m = Math.max(m, Math.abs(v))
  return m || 1
}
/** 把一段聲音調成峰值 1 再乘 k 加進去（各部分的比例才好控制） */
function put(b: Buf, t: number, x: Float32Array, k: number) {
  b.add(t, x, k / peakOf(x))
}
/** 一段摩擦聲（紙牌滑過、拿起棋子時擦過棋盤）：頻帶噪音，升起再收尾 */
function rub(sr: number, rand: Rand, len: number, lo: number, hi: number): Float32Array {
  const n = Math.ceil(len * sr)
  const x = biquad(biquad(noise(n, rand), sr, 'hp', lo, 0.6), sr, 'lp', hi, 0.6)
  for (let i = 0; i < n; i++) {
    const p = i / n
    x[i] *= Math.min(1, p / 0.25) * Math.min(1, (1 - p) / 0.3) * (0.8 + 0.2 * Math.sin(i * 0.0023))
  }
  return x
}

// ── 介面 ──
/** 木琴的一個音（贏、輸、和局）：木琴的木條調過音，基音＋約 4 倍、10 倍泛音；槌子打下去有一下短的敲擊聲 */
function marimba(b: Buf, t: number, rand: Rand, f: number, k = 1, d = 0.35) {
  const sr = b.sr
  const n = Math.ceil(d * 3 * sr)
  const y = new Float32Array(n)
  for (const [mul, a, dd] of [
    [1, 1, d],
    [3.93, 0.2, d * 0.2],
    [9.2, 0.05, d * 0.06],
  ] as const) {
    const w = (2 * Math.PI * f * mul * (1 + (rand() - 0.5) * 0.002)) / sr
    for (let i = 0; i < n; i++) y[i] += a * Math.exp(-i / (dd * sr)) * Math.sin(w * i)
  }
  const rise = Math.ceil(0.002 * sr)
  for (let i = 0; i < rise; i++) y[i] *= i / rise
  b.add(t, y, k)
  b.add(t, burst(sr, rand, P.knock, { shift: 6, tauMul: 0.6 }), 0.06 * k / 1)
}

/** 拇指琴的一個音：基音為主，帶一點點很快消失的高泛音（撥下去的那一下），沒有尖銳的起音 */
function kalimba(b: Buf, t: number, rand: Rand, f: number, k = 1) {
  const sr = b.sr
  const n = Math.ceil(0.5 * sr)
  const y = new Float32Array(n)
  for (const [mul, a, d] of [
    [1, 1, 0.22],
    [2, 0.12, 0.08],
    [5.4, 0.05, 0.015],
  ] as const) {
    const w = (2 * Math.PI * f * mul * (1 + (rand() - 0.5) * 0.001)) / sr
    for (let i = 0; i < n; i++) y[i] += a * Math.exp(-i / (d * sr)) * Math.sin(w * i)
  }
  // 柔和的起音（4 毫秒），不會有「叮」的尖頭
  const rise = Math.ceil(0.004 * sr)
  for (let i = 0; i < rise; i++) y[i] *= Math.sin((Math.PI / 2) * (i / rise))
  b.add(t, y, k)
}

/** 算出一個聲音（seed 不同，聲音就稍微不同） */
export function renderSfx(name: SfxName, sr: number, seed = 1): Float32Array {
  const rand = makeRand(seed * 9973 + name.length * 131 + name.charCodeAt(0))
  const v = (seed - 1) % 3
  let b: Buf
  switch (name) {
    // ── 介面 ──
    case 'tap': {
      // 按鈕：手指按下去的一下輕「嗒」（像西洋棋子那種極短的悶聲，高一點、輕一點）
      b = new Buf(sr, 0.06)
      put(b, 0, burst(sr, rand, P.chessMove, { shift: 4, tauMul: 0.8 }), 1)
      return b.normalize(0.22).data
    }
    case 'slide': {
      // 模式卡片左右滑：一張卡片滑過另一張
      b = new Buf(sr, 0.24)
      put(b, 0, rub(sr, rand, 0.2, 1500, 6000), 1)
      return b.normalize(0.18).data
    }
    case 'error': {
      // 不能這樣做：兩下悶悶的敲木頭，第二下比較低
      b = new Buf(sr, 0.3)
      put(b, 0, burst(sr, rand, P.knock, { shift: -1 }), 1)
      put(b, 0.12, burst(sr, rand, P.knock, { shift: -3 }), 0.85)
      return b.normalize(0.45).data
    }
    case 'win': {
      b = new Buf(sr, 1.6)
      ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) => marimba(b, i * 0.11, rand, f, i === 3 ? 1.1 : 0.9))
      return b.normalize(0.5).data
    }
    case 'lose': {
      b = new Buf(sr, 1.6)
      ;[392, 329.63, 261.63].forEach((f, i) => marimba(b, i * 0.18, rand, f, 0.9, 0.42))
      return b.normalize(0.42).data
    }
    case 'draw': {
      b = new Buf(sr, 1.2)
      marimba(b, 0, rand, 440, 0.8, 0.3)
      marimba(b, 0.2, rand, 440, 0.7, 0.36)
      return b.normalize(0.4).data
    }
    case 'correct': {
      // 新手教學答對：兩個往上的短音（相差五度），像拇指琴：起音柔和、很快收尾，不吵
      b = new Buf(sr, 0.7)
      kalimba(b, 0, rand, 659.25, 0.75)
      kalimba(b, 0.11, rand, 987.77, 1)
      return b.normalize(0.32).data
    }
    case 'reveal': {
      // 猜拳亮出手勢：手一甩的風聲，停住時一下輕拍
      b = new Buf(sr, 0.22)
      const w = rub(sr, rand, 0.12, 400, 2500)
      for (let i = 0; i < w.length; i++) w[i] *= (i / w.length) ** 1.5
      put(b, 0, w, 0.4)
      put(b, 0.115, burst(sr, rand, P.chessMove, { shift: 2 }), 0.9)
      return b.normalize(0.38).data
    }

    // ── 紙牌 ──
    case 'shuffle': {
      // 鴿尾式洗牌：牌角一張張交錯落下（一長串很短的「答」），最後把牌推齊
      b = new Buf(sr, 0.95)
      const n = 46
      // 先算幾個不一樣的「答」，再隨機挑來用（每次音量、時間都不同，聽不出重複）
      const ticks = [0, 1, 2, 3, 4].map(() => burst(sr, rand, P.cardSnap, { tauMul: 0.5, jitter: 3 }))
      let t = 0.02
      for (let i = 0; i < n; i++) {
        const p = i / n
        const k = 0.35 + 0.65 * Math.sin(Math.PI * p)
        put(b, t, ticks[Math.floor(rand() * ticks.length)], k * (0.5 + rand() * 0.5))
        t += 0.0065 + 0.008 * (1 - Math.sin(Math.PI * p)) + rand() * 0.003
      }
      put(b, 0.02, rub(sr, rand, t, 1200, 7000), 0.25)
      put(b, t + 0.09, burst(sr, rand, P.cardDown), 0.9)
      put(b, t + 0.13, burst(sr, rand, P.cardDown, { tauMul: 0.6 }), 0.45)
      return b.normalize(0.45).data
    }
    case 'deal': {
      // 發一張牌：從牌堆滑出去，落在桌上
      b = new Buf(sr, 0.2)
      put(b, 0, rub(sr, rand, 0.08, 1500, 7000), 0.35)
      put(b, 0.075, burst(sr, rand, P.cardDown), 1)
      return b.normalize(0.36).data
    }
    case 'card': {
      // 出牌、放牌：一張牌落在桌上
      b = new Buf(sr, 0.13)
      put(b, 0, burst(sr, rand, P.cardDown), 1)
      return b.normalize(0.45).data
    }
    case 'flip': {
      // 翻牌：牌邊彈開的「啪」，翻過去再落下
      b = new Buf(sr, 0.17)
      put(b, 0, burst(sr, rand, P.cardSnap), 0.8)
      put(b, 0.05 + rand() * 0.01, burst(sr, rand, P.cardDown, { tauMul: 0.7 }), 0.8)
      return b.normalize(0.4).data
    }
    case 'cardPick': {
      // 從手牌裡挑起一張：牌和牌擦過，再輕輕彈開
      b = new Buf(sr, 0.1)
      put(b, 0, rub(sr, rand, 0.05, 1500, 6500), 0.5)
      put(b, 0.045, burst(sr, rand, P.cardSnap, { tauMul: 0.8 }), 0.6)
      return b.normalize(0.22).data
    }
    case 'collect': {
      // 收牌：疊到另一疊上，拍一下再推齊
      b = new Buf(sr, 0.17)
      put(b, 0, burst(sr, rand, P.cardDown), 1)
      put(b, 0.04 + rand() * 0.01, burst(sr, rand, P.cardDown, { tauMul: 0.6 }), 0.4)
      return b.normalize(0.42).data
    }
    case 'pass': {
      // 過牌：指節在木頭桌上敲兩下
      b = new Buf(sr, 0.32)
      put(b, 0, burst(sr, rand, P.knock), 1)
      put(b, 0.13 + rand() * 0.02, burst(sr, rand, P.knock, { shift: -0.5 }), 0.85)
      return b.normalize(0.5).data
    }

    // ── 棋類 ──
    case 'stone': {
      // 五子棋、圍棋落子：棋石拍在棋盤上（三個版本各對應一種量到的落子聲）
      b = new Buf(sr, 0.16)
      put(b, 0, burst(sr, rand, P.stone[v], { attack: 0.0003 }), 1)
      return b.normalize(0.6).data
    }
    case 'stonePick': {
      // 手伸進棋罐拿一顆：幾顆棋石互相碰撞，越來越輕
      b = new Buf(sr, 0.2)
      const n = 3 + Math.floor(rand() * 3)
      const ticks = [0, 1, 2].map(() => burst(sr, rand, P.stoneTick, { shift: 1, jitter: 3 }))
      let t = 0
      for (let i = 0; i < n; i++) {
        put(b, t, ticks[i % ticks.length], (1 - i / (n + 1)) * (0.6 + rand() * 0.4))
        t += 0.02 + rand() * 0.03
      }
      return b.normalize(0.28).data
    }
    case 'capture': {
      // 圍棋提子：被提的棋石一顆顆丟進盒蓋，碰在一起
      b = new Buf(sr, 0.45)
      const n = 7 + Math.floor(rand() * 4)
      const ticks = [0, 1, 2, 3].map((k) => burst(sr, rand, P.stoneTick, { shift: k % 2, jitter: 3 }))
      for (let i = 0; i < n; i++) {
        const t = (i / n) * 0.28 + rand() * 0.025
        put(b, t, ticks[Math.floor(rand() * ticks.length)], 0.55 + rand() * 0.45)
        if (rand() < 0.4) put(b, t + 0.007 + rand() * 0.006, ticks[Math.floor(rand() * ticks.length)], 0.35)
      }
      return b.normalize(0.42).data
    }
    case 'piece': {
      // 西洋棋走子：極短的悶「叩」＋棋盤的低音
      b = new Buf(sr, 0.1)
      put(b, 0, burst(sr, rand, P.chessMove), 1)
      return b.normalize(0.55).data
    }
    case 'chessCapture': {
      // 西洋棋吃子：比走子寬、比較響
      b = new Buf(sr, 0.12)
      put(b, 0, burst(sr, rand, P.chessCapture), 1)
      return b.normalize(0.6).data
    }
    case 'xqPiece': {
      // 象棋走子：厚實木棋子直接拍下，比西洋棋清脆（頻譜往上移、衰減慢一點），落定前小彈一下
      b = new Buf(sr, 0.12)
      put(b, 0, burst(sr, rand, P.chessMove, { shift: 4, tauMul: 2.2 }), 1)
      put(b, 0.007 + rand() * 0.003, burst(sr, rand, P.chessMove, { shift: 5, tauMul: 1.2 }), 0.18)
      return b.normalize(0.6).data
    }
    case 'xqCapture': {
      // 象棋吃子：兩顆木棋子相撞的「喀」，緊接著拍下
      b = new Buf(sr, 0.14)
      put(b, 0, burst(sr, rand, P.chessCapture, { shift: 5, tauMul: 1.6 }), 0.8)
      put(b, 0.01, burst(sr, rand, P.chessMove, { shift: 3, tauMul: 2 }), 1)
      return b.normalize(0.64).data
    }
    case 'piecePick': {
      // 拿起一顆棋子：棋子底部擦過棋盤，離開時輕輕一聲
      b = new Buf(sr, 0.09)
      put(b, 0, rub(sr, rand, 0.045, 700, 3500), 0.5)
      put(b, 0.04, burst(sr, rand, P.chessMove, { shift: 3, tauMul: 0.8 }), 0.35)
      return b.normalize(0.2).data
    }
  }
}

export const SFX_NAMES: SfxName[] = ['tap', 'slide', 'error', 'win', 'lose', 'draw', 'reveal', 'correct', 'shuffle', 'deal', 'card', 'flip', 'cardPick', 'collect', 'pass', 'stone', 'stonePick', 'capture', 'piece', 'chessCapture', 'xqPiece', 'xqCapture', 'piecePick']
