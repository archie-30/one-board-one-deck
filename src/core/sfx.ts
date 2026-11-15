// 音效的「原料」：每個聲音都用程式一個取樣點一個取樣點算出來（不用任何外部音檔）。
// 這個檔案是純計算，不碰瀏覽器，所以也能在電腦上直接算出來檢查波形。
//
// 做法：
//   - 紙牌：寬頻雜訊經過濾波（紙張摩擦、拍擊的「沙」聲），不帶音高
//   - 木頭、棋子：碰撞模型——接觸時間決定清脆或沉悶，材質的損耗決定共振多快消失（木頭很快、不會像玻璃）
//   - 木琴（贏、輸、和局）：基音＋4 倍泛音
// 每個聲音可以給不同的 seed，做出幾個稍微不一樣的版本輪流播放，聽起來才不會像機器。

export type SfxName =
  // 介面
  | 'tap'
  | 'slide'
  | 'error'
  | 'win'
  | 'lose'
  | 'draw'
  | 'reveal'
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


// ── 敲擊聲的模型 ──
// 一次碰撞 = 「接觸」＋「共振」：
//   接觸時間 tc：越硬越短（石頭碰木頭約 0.1 毫秒、木頭碰木頭 0.2～0.3、隔著絨布或紙 1 毫秒以上），
//     越短激發的頻率越高 → 聲音越清脆；越長 → 越悶。
//   共振：每個材質有一堆很密的共振頻率，每個頻率衰減多快由材質的「損耗」決定：
//     衰減時間 = 1 ÷ (π × 頻率 × 損耗)。木頭損耗大（約 0.02～0.04），高頻一下就沒了 → 「叩」；
//     玻璃、金屬損耗很小，會一直響 → 「叮」。所以只要損耗給得像木頭，就不會像敲玻璃。
interface Material {
  /** 共振頻率的範圍（Hz）與數量：數量多、分佈不規則，聽起來才是實心的東西而不是有音高的「嘟」 */
  lo: number
  hi: number
  n: number
  /** 損耗係數 */
  eta: number
  /**
   * 音色：每個共振的音量 ∝ (頻率／最低頻率)^tilt。
   * 低頻的共振本來就響比較久，tilt ≈ 0.5 時每個共振的「總能量」差不多；越大越亮、越小越悶。
   */
  tilt: number
}
const MAT = {
  /** 厚的榧木棋盤（底下挖空，共鳴好） */
  goBoard: { lo: 300, hi: 4200, n: 22, eta: 0.024, tilt: 0.6 },
  /** 棋石本身（硬，但很小、很快就停） */
  goStone: { lo: 3800, hi: 8200, n: 6, eta: 0.008, tilt: 0 },
  /** 西洋棋、象棋的木頭棋盤（比較薄） */
  boardWood: { lo: 260, hi: 3400, n: 22, eta: 0.03, tilt: 0.55 },
  /** 象棋子：厚的實木圓餅 */
  xqDisc: { lo: 1300, hi: 4800, n: 9, eta: 0.016, tilt: 0.3 },
  /** 西洋棋子：車床車出來的木頭棋子 */
  chessMan: { lo: 700, hi: 2800, n: 8, eta: 0.025, tilt: 0.3 },
  /** 棋罐、盒蓋（薄木頭） */
  bowl: { lo: 400, hi: 2600, n: 10, eta: 0.035, tilt: 0.4 },
  /** 桌面（紙牌拍上去、指節敲桌） */
  table: { lo: 140, hi: 1600, n: 18, eta: 0.045, tilt: 0.4 },
  /** 按鈕：厚紙板 */
  card: { lo: 400, hi: 3000, n: 10, eta: 0.07, tilt: 0.5 },
} satisfies Record<string, Material>

/** 一次碰撞的聲音：tc = 接觸時間（秒），k = 音量 */
function impact(sr: number, rand: Rand, mat: Material, tc: number, dur: number): Float32Array {
  const n = Math.ceil(dur * sr)
  const y = new Float32Array(n)
  // 接觸越短，能激發的頻率越高（半正弦脈衝的頻譜大致在 1/tc 附近開始掉）
  const cut = 0.9 / tc
  for (let m = 0; m < mat.n; m++) {
    // 頻率在範圍內對數分佈，再加上不規則的偏移
    const p = (m + 0.15 + rand() * 0.7) / mat.n
    const f = mat.lo * Math.pow(mat.hi / mat.lo, p)
    const tau = 1 / (Math.PI * f * mat.eta)
    const reach = Math.exp(-Math.pow(f / cut, 2))
    const a = (0.5 + rand() * 0.5) * Math.pow(f / mat.lo, mat.tilt) * reach
    if (a < 0.002) continue
    const w = (2 * Math.PI * f) / sr
    const len = Math.min(n, Math.ceil(tau * 7 * sr))
    for (let i = 0; i < len; i++) y[i] += a * Math.exp(-i / (tau * sr)) * Math.sin(w * i)
  }
  // 起音：用接觸時間當作升起的時間，不會有數位的「喀」
  const rise = Math.max(2, Math.ceil(tc * sr))
  for (let i = 0; i < rise && i < n; i++) y[i] *= Math.sin((Math.PI / 2) * (i / rise))
  return y
}
/** 碰撞那一瞬間的寬頻「接觸聲」：tc 越短越亮 */
function contact(sr: number, rand: Rand, tc: number, dur = 0.012): Float32Array {
  return env(biquad(noise(Math.ceil(dur * sr), rand), sr, 'lp', Math.min(sr * 0.45, 0.7 / tc), 0.5), sr, tc * 0.5, Math.max(0.0006, tc * 1.6))
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

// ── 棋類 ──
/** 棋石落在榧木棋盤上：硬的「啪」＋棋盤的共鳴，石頭再小彈一下 */
function stoneOnBoard(b: Buf, t: number, rand: Rand, k = 1) {
  const sr = b.sr
  const tc = 0.00011 + rand() * 0.00003
  put(b, t, impact(sr, rand, MAT.goBoard, tc, 0.22), 1 * k)
  put(b, t, impact(sr, rand, MAT.goStone, tc, 0.06), 0.2 * k)
  put(b, t, contact(sr, rand, tc), 0.55 * k)
  // 小彈跳：石頭落定前在棋盤上輕輕再碰一下
  const t2 = t + 0.009 + rand() * 0.006
  put(b, t2, impact(sr, rand, MAT.goBoard, tc * 1.2, 0.08), 0.18 * k)
  put(b, t2, contact(sr, rand, tc), 0.12 * k)
}
/** 兩顆棋石互碰（棋罐裡、盒蓋裡）：很短很亮的「喀」，帶一點罐子的木頭聲 */
function stoneTick(b: Buf, t: number, rand: Rand, k = 1) {
  const sr = b.sr
  const tc = 0.00006 + rand() * 0.00004
  put(b, t, impact(sr, rand, MAT.goStone, tc, 0.05), 0.6 * k)
  put(b, t, contact(sr, rand, tc, 0.006), 0.7 * k)
  put(b, t, impact(sr, rand, MAT.bowl, 0.0003, 0.08), 0.22 * k)
}
/** 木頭棋子放到木頭棋盤上：soft = 底下貼絨布（西洋棋），hard = 實木直接拍（象棋） */
function pieceDown(b: Buf, t: number, rand: Rand, hard: boolean, k = 1) {
  const sr = b.sr
  const tc = hard ? 0.00024 + rand() * 0.00005 : 0.00062 + rand() * 0.00012
  put(b, t, impact(sr, rand, MAT.boardWood, tc, 0.25), 1 * k)
  put(b, t, impact(sr, rand, hard ? MAT.xqDisc : MAT.chessMan, tc, 0.1), (hard ? 0.45 : 0.25) * k)
  put(b, t, contact(sr, rand, tc, 0.02), (hard ? 0.6 : 0.35) * k)
  if (hard) {
    const t2 = t + 0.006 + rand() * 0.004
    put(b, t2, impact(sr, rand, MAT.boardWood, tc * 1.3, 0.08), 0.15 * k)
  }
}
/** 棋子撞到棋子（吃子時拿自己的子去撞對方的子） */
function pieceClack(b: Buf, t: number, rand: Rand, hard: boolean, k = 1) {
  const sr = b.sr
  const tc = hard ? 0.00013 : 0.0002
  put(b, t, impact(sr, rand, hard ? MAT.xqDisc : MAT.chessMan, tc, 0.08), 0.8 * k)
  put(b, t, contact(sr, rand, tc), 0.6 * k)
}
/** 指節敲木頭桌：比較低沉的「叩」 */
function knock(b: Buf, t: number, rand: Rand, k = 1) {
  const sr = b.sr
  const tc = 0.0006 + rand() * 0.0002
  put(b, t, impact(sr, rand, MAT.table, tc, 0.22), 1 * k)
  put(b, t, contact(sr, rand, tc, 0.015), 0.35 * k)
}

// ── 紙牌 ──
/** 一張牌拍在桌上：牌面壓出空氣的「啪」（寬頻、不帶音高）＋桌面一點低沉的共鳴 */
function cardSlap(b: Buf, t: number, rand: Rand, k = 1) {
  const sr = b.sr
  // 空氣被擠出去：寬頻雜訊，集中在 400～3000 Hz，十幾毫秒就停
  put(b, t, env(biquad(biquad(noise(Math.ceil(0.05 * sr), rand), sr, 'hp', 350, 0.5), sr, 'lp', 2800 + rand() * 600, 0.5), sr, 0.0005, 0.009), 1 * k)
  // 牌邊碰到桌面的一下脆聲
  put(b, t, env(biquad(noise(Math.ceil(0.01 * sr), rand), sr, 'hp', 3500, 0.5), sr, 0.0002, 0.0014), 0.35 * k)
  // 桌面被拍到的一點低音（紙很軟，接觸時間長，只激得起低頻）
  put(b, t, impact(sr, rand, MAT.table, 0.0025, 0.1), 0.12 * k)
}
/** 牌滑過桌面或牌堆：沙沙的摩擦，最後輕輕停下 */
function cardSlide(b: Buf, t: number, rand: Rand, len: number, k = 1) {
  const sr = b.sr
  const n = Math.ceil(len * sr)
  const x = biquad(biquad(noise(n, rand), sr, 'hp', 900, 0.5), sr, 'lp', (i) => 2600 + 2600 * (i / n), 0.5)
  for (let i = 0; i < n; i++) {
    const p = i / n
    x[i] *= Math.min(1, p / 0.2) * Math.min(1, (1 - p) / 0.35) * (0.8 + 0.2 * Math.sin(i * 0.002))
  }
  put(b, t, x, 0.5 * k)
}
/** 牌從手上抽出來／挑起來：牌和牌互相摩擦的一聲短「刷」 */
function cardRub(b: Buf, t: number, rand: Rand, len: number, k = 1) {
  const sr = b.sr
  const n = Math.ceil(len * sr)
  const x = biquad(noise(n, rand), sr, 'bp', (i) => 2600 + 2200 * (i / n), 0.6)
  for (let i = 0; i < n; i++) x[i] *= Math.sin((Math.PI * i) / n) ** 1.4
  put(b, t, x, k)
}

// ── 介面 ──
/** 木琴的一個音（贏、輸、和棋）：木琴是調過音的木條，基音＋4 倍泛音，比一般木頭響得久 */
function marimba(b: Buf, t: number, rand: Rand, f: number, k = 1, d = 0.35) {
  const sr = b.sr
  const n = Math.ceil(d * 3 * sr)
  const y = new Float32Array(n)
  for (const [mul, a, dd] of [
    [1, 1, d],
    [3.93, 0.22, d * 0.2],
    [9.2, 0.05, d * 0.06],
  ] as const) {
    const w = (2 * Math.PI * f * mul * (1 + (rand() - 0.5) * 0.002)) / sr
    for (let i = 0; i < n; i++) y[i] += a * Math.exp(-i / (dd * sr)) * Math.sin(w * i)
  }
  // 槌子打下去：一點點接觸聲
  const rise = Math.ceil(0.0015 * sr)
  for (let i = 0; i < rise; i++) y[i] *= i / rise
  b.add(t, y, k)
  b.add(t, contact(sr, rand, 0.0008, 0.01), 0.05 * k)
}

/** 算出一個聲音（seed 不同，聲音就稍微不同） */
export function renderSfx(name: SfxName, sr: number, seed = 1): Float32Array {
  const rand = makeRand(seed * 9973 + name.length * 131 + name.charCodeAt(0))
  let b: Buf
  switch (name) {
    // ── 介面 ──
    case 'tap': {
      // 按鈕：手指按下厚紙板的一聲輕「嗒」
      b = new Buf(sr, 0.08)
      put(b, 0, impact(sr, rand, MAT.card, 0.0005, 0.07), 1)
      put(b, 0, contact(sr, rand, 0.0005), 0.45)
      return b.normalize(0.28).data
    }
    case 'slide': {
      // 模式卡片左右滑：一張卡片滑過另一張的「咻」
      b = new Buf(sr, 0.26)
      cardSlide(b, 0, rand, 0.22, 1)
      return b.normalize(0.26).data
    }
    case 'error': {
      // 不能這樣做：兩聲悶悶的「咚咚」，第二聲比較低（木頭被手掌壓著敲）
      b = new Buf(sr, 0.34)
      put(b, 0, impact(sr, rand, { ...MAT.table, lo: 200, hi: 1200, tilt: 0.35 }, 0.0012, 0.16), 1)
      put(b, 0.13, impact(sr, rand, { ...MAT.table, lo: 160, hi: 950, tilt: 0.35 }, 0.0014, 0.18), 0.9)
      return b.normalize(0.5).data
    }
    case 'win': {
      // 贏：木琴往上的琶音
      b = new Buf(sr, 1.6)
      ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) => marimba(b, i * 0.11, rand, f, i === 3 ? 1.1 : 0.9))
      return b.normalize(0.55).data
    }
    case 'lose': {
      // 輸：木琴往下的三個音
      b = new Buf(sr, 1.6)
      ;[392, 329.63, 261.63].forEach((f, i) => marimba(b, i * 0.18, rand, f, 0.9, 0.42))
      return b.normalize(0.45).data
    }
    case 'draw': {
      // 和局：木琴兩個一樣高的音，不喜不悲
      b = new Buf(sr, 1.2)
      marimba(b, 0, rand, 440, 0.8, 0.3)
      marimba(b, 0.2, rand, 440, 0.7, 0.36)
      return b.normalize(0.42).data
    }
    case 'reveal': {
      // 猜拳亮出手勢：手一甩的風聲＋手停住的一下輕拍
      b = new Buf(sr, 0.2)
      const n = Math.ceil(0.12 * sr)
      const w = biquad(noise(n, rand), sr, 'lp', (i) => 600 + 1800 * (i / n), 0.5)
      for (let i = 0; i < n; i++) w[i] *= (i / n) ** 2
      put(b, 0, w, 0.35)
      put(b, 0.12, impact(sr, rand, MAT.card, 0.0012, 0.07), 0.7)
      put(b, 0.12, contact(sr, rand, 0.001), 0.4)
      return b.normalize(0.4).data
    }

    // ── 紙牌 ──
    case 'shuffle': {
      // 洗牌（鴿尾式）：拇指放開，兩疊牌的牌角一張張交錯落下（一長串細小的「答」），接著把牌推齊
      b = new Buf(sr, 0.95)
      const n = 48
      let t = 0.02
      for (let i = 0; i < n; i++) {
        const p = i / n
        const k = 0.35 + 0.65 * Math.sin(Math.PI * p)
        put(b, t, env(biquad(noise(Math.ceil(0.006 * sr), rand), sr, 'bp', 3200 + rand() * 3000, 0.7), sr, 0.0002, 0.0012), k * (0.6 + rand() * 0.4))
        t += 0.0065 + 0.008 * (1 - Math.sin(Math.PI * p)) + rand() * 0.003
      }
      cardSlide(b, 0.02, rand, t, 0.3)
      cardSlap(b, t + 0.1, rand, 0.9)
      cardSlap(b, t + 0.14, rand, 0.45)
      return b.normalize(0.5).data
    }
    case 'deal': {
      // 發一張牌：從牌堆滑出去，落在桌上
      b = new Buf(sr, 0.2)
      cardSlide(b, 0, rand, 0.09, 0.8)
      cardSlap(b, 0.085, rand, 0.55)
      return b.normalize(0.4).data
    }
    case 'card': {
      // 出牌、放牌：一張牌拍在桌上
      b = new Buf(sr, 0.14)
      cardSlap(b, 0, rand)
      return b.normalize(0.5).data
    }
    case 'flip': {
      // 翻牌：指尖把牌邊撥起的「嗤」，牌面掀過去帶起一點風，再落下
      b = new Buf(sr, 0.17)
      put(b, 0, env(biquad(noise(Math.ceil(0.01 * sr), rand), sr, 'hp', 2400, 0.5), sr, 0.0002, 0.0012), 0.45)
      const n = Math.ceil(0.05 * sr)
      const whoosh = biquad(noise(n, rand), sr, 'lp', (i) => 700 + 2000 * Math.sin((Math.PI * i) / n), 0.5)
      for (let i = 0; i < n; i++) whoosh[i] *= Math.sin((Math.PI * i) / n) ** 2
      put(b, 0.004, whoosh, 0.4)
      cardSlap(b, 0.055 + rand() * 0.008, rand, 0.7)
      return b.normalize(0.42).data
    }
    case 'cardPick': {
      // 從手牌裡挑起一張：牌和牌之間輕輕一「刷」
      b = new Buf(sr, 0.09)
      cardRub(b, 0, rand, 0.06, 1)
      return b.normalize(0.24).data
    }
    case 'collect': {
      // 收牌：牌疊到另一疊上，拍一下再順手推齊
      b = new Buf(sr, 0.17)
      cardSlap(b, 0, rand, 0.9)
      cardSlap(b, 0.04 + rand() * 0.01, rand, 0.35)
      return b.normalize(0.45).data
    }
    case 'pass': {
      // 過牌：指節在木頭桌上敲兩下
      b = new Buf(sr, 0.36)
      knock(b, 0, rand, 1)
      knock(b, 0.13 + rand() * 0.02, rand, 0.85)
      return b.normalize(0.55).data
    }

    // ── 棋類 ──
    case 'stone': {
      // 五子棋、圍棋落子：棋石落在榧木棋盤上
      b = new Buf(sr, 0.26)
      stoneOnBoard(b, 0, rand)
      return b.normalize(0.62).data
    }
    case 'stonePick': {
      // 手伸進棋罐拿一顆：幾顆棋石互相碰撞，越來越輕
      b = new Buf(sr, 0.2)
      const n = 3 + Math.floor(rand() * 3)
      let t = 0
      for (let i = 0; i < n; i++) {
        stoneTick(b, t, rand, (1 - i / (n + 1)) * (0.6 + rand() * 0.4))
        t += 0.018 + rand() * 0.03
      }
      return b.normalize(0.34).data
    }
    case 'capture': {
      // 圍棋提子：被提的棋石一顆顆丟進盒蓋，碰在一起
      b = new Buf(sr, 0.48)
      const n = 7 + Math.floor(rand() * 4)
      for (let i = 0; i < n; i++) {
        const t = (i / n) * 0.28 + rand() * 0.025
        stoneTick(b, t, rand, 0.55 + rand() * 0.45)
        if (rand() < 0.4) stoneTick(b, t + 0.007 + rand() * 0.006, rand, 0.35)
      }
      return b.normalize(0.42).data
    }
    case 'piece': {
      // 西洋棋走子：底下貼絨布的木頭棋子放上木頭棋盤，悶悶的「叩」
      b = new Buf(sr, 0.26)
      pieceDown(b, 0, rand, false)
      return b.normalize(0.55).data
    }
    case 'chessCapture': {
      // 西洋棋吃子：自己的子碰到對方的子「喀」，把它拿開，自己的子落下
      b = new Buf(sr, 0.32)
      pieceClack(b, 0, rand, false, 0.7)
      pieceDown(b, 0.07, rand, false, 1)
      return b.normalize(0.58).data
    }
    case 'xqPiece': {
      // 象棋走子：實木棋子直接拍在棋盤上，清脆的「啪」
      b = new Buf(sr, 0.26)
      pieceDown(b, 0, rand, true)
      return b.normalize(0.62).data
    }
    case 'xqCapture': {
      // 象棋吃子：用自己的子把對方的子「啪」一聲壓下去
      b = new Buf(sr, 0.28)
      pieceClack(b, 0, rand, true, 0.9)
      pieceDown(b, 0.012, rand, true, 1)
      return b.normalize(0.66).data
    }
    case 'piecePick': {
      // 拿起一顆棋子：棋子底部離開棋盤時輕輕擦過的一聲
      b = new Buf(sr, 0.1)
      const n = Math.ceil(0.05 * sr)
      const x = biquad(noise(n, rand), sr, 'bp', 1400 + rand() * 300, 0.6)
      for (let i = 0; i < n; i++) x[i] *= Math.sin((Math.PI * i) / n)
      put(b, 0, x, 0.45)
      put(b, 0.035, impact(sr, rand, MAT.boardWood, 0.0007, 0.05), 0.4)
      return b.normalize(0.24).data
    }
  }
}

export const SFX_NAMES: SfxName[] = ['tap', 'slide', 'error', 'win', 'lose', 'draw', 'reveal', 'shuffle', 'deal', 'card', 'flip', 'cardPick', 'collect', 'pass', 'stone', 'stonePick', 'capture', 'piece', 'chessCapture', 'xqPiece', 'xqCapture', 'piecePick']
