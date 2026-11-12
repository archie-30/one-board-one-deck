// 墨線引擎：線條是「填滿的形狀」而不是等寬的線，
// 粗細會隨筆壓變化、頭尾收細、邊角稍微畫出頭；陰影用一筆一筆的排線。
// 同一個 seed 畫出來的結果固定，換 seed 就是同一張圖的另一次描線（給「線條呼吸」用）。

export type Pt = [number, number]

export interface InkOpts {
  width?: number
  jitter?: number
  overshoot?: number
  seed?: number
  /** 頭尾收細的程度：0 = 收到尖，1 = 不收 */
  taper?: number
  /** 筆壓變化幅度 */
  pressure?: number
}

function rng(seed: number) {
  let s = (Math.imul((seed | 0) + 0x9e3779b9, 2654435761) >>> 0) || 1
  return () => {
    s ^= s << 13
    s >>>= 0
    s ^= s >>> 17
    s ^= s << 5
    s >>>= 0
    return s / 4294967296
  }
}

function smoothNoise(rand: () => number, n: number) {
  const v: number[] = []
  for (let i = 0; i <= n; i++) v.push(rand() * 2 - 1)
  return (t: number) => {
    const x = Math.max(0, Math.min(0.9999, t)) * n
    const i = Math.floor(x)
    let f = x - i
    f = f * f * (3 - 2 * f)
    return v[i] + (v[i + 1] - v[i]) * f
  }
}

const num = (n: number) => {
  const s = n.toFixed(2)
  return s.endsWith('.00') ? s.slice(0, -3) : s
}

function resample(points: Pt[], width: number): { pts: Pt[]; total: number } {
  let total = 0
  const lens = [0]
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1])
    lens.push(total)
  }
  const n = Math.max(4, Math.min(48, Math.ceil(total / Math.max(width * 2.2, total / 48))))
  const out: Pt[] = []
  let seg = 1
  for (let k = 0; k <= n; k++) {
    const d = (total * k) / n
    while (seg < lens.length - 1 && lens[seg] < d) seg++
    const l0 = lens[seg - 1]
    const l1 = lens[seg]
    const f = l1 > l0 ? (d - l0) / (l1 - l0) : 0
    const a = points[seg - 1]
    const b = points[seg]
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f])
  }
  return { pts: out, total }
}

/** 沿著一串點畫一筆，回傳可直接填色的路徑 */
export function inkPath(points: Pt[], opts: InkOpts = {}): string {
  if (points.length < 2) return ''
  const width = opts.width ?? 2
  const jitter = opts.jitter ?? width * 0.45
  const overshoot = opts.overshoot ?? 0
  const taper = opts.taper ?? 0.35
  const pressure = opts.pressure ?? 0.3
  const rand = rng(opts.seed ?? 1)

  const pts = points.slice()
  if (overshoot > 0) {
    const a = pts[0]
    const b = pts[1]
    const la = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    const oa = overshoot * (0.2 + rand())
    pts[0] = [a[0] - ((b[0] - a[0]) / la) * oa, a[1] - ((b[1] - a[1]) / la) * oa]
    const c = pts[pts.length - 1]
    const d = pts[pts.length - 2]
    const lc = Math.hypot(c[0] - d[0], c[1] - d[1]) || 1
    const oc = overshoot * (0.2 + rand())
    pts[pts.length - 1] = [c[0] + ((c[0] - d[0]) / lc) * oc, c[1] + ((c[1] - d[1]) / lc) * oc]
  }
  const { pts: s, total } = resample(pts, width)
  const jn = smoothNoise(rand, Math.max(3, Math.min(10, Math.round(total / (width * 14)))))
  const wn = smoothNoise(rand, 5)
  const n = s.length
  const left: string[] = []
  const right: string[] = []
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    const q0 = s[Math.max(0, i - 1)]
    const q1 = s[Math.min(n - 1, i + 1)]
    let tx = q1[0] - q0[0]
    let ty = q1[1] - q0[1]
    const tl = Math.hypot(tx, ty) || 1
    tx /= tl
    ty /= tl
    const j = jn(t) * jitter
    const end = Math.min(1, t / 0.12, (1 - t) / 0.18)
    const press = taper + (1 - taper) * Math.sqrt(Math.max(0, end))
    const w = width * 0.5 * press * (1 + wn(t) * pressure)
    const cx = s[i][0] - ty * j
    const cy = s[i][1] + tx * j
    left.push(`${num(cx - ty * w)} ${num(cy + tx * w)}`)
    right.push(`${num(cx + ty * w)} ${num(cy - tx * w)}`)
  }
  return `M${left.join('L')}L${right.reverse().join('L')}Z`
}

export const inkLine = (a: Pt, b: Pt, opts: InkOpts = {}) => inkPath([a, b], opts)

/** 多邊形外框：每一邊各畫一筆，邊角會稍微畫出頭 */
export function inkPoly(pts: Pt[], opts: InkOpts = {}): string {
  let d = ''
  const seed = opts.seed ?? 1
  for (let i = 0; i < pts.length; i++) {
    d += inkPath([pts[i], pts[(i + 1) % pts.length]], { overshoot: (opts.width ?? 2) * 1.4, ...opts, seed: seed * 31 + i * 7 })
  }
  return d
}

export function circlePts(cx: number, cy: number, r: number, from = 0, to = Math.PI * 2, n = 28): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i <= n; i++) {
    const a = from + ((to - from) * i) / n
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
  }
  return out
}

/** 一筆畫成的圓：頭尾稍微交疊，不會剛好接上 */
export function inkCircle(cx: number, cy: number, r: number, opts: InkOpts = {}): string {
  const rand = rng((opts.seed ?? 1) + 77)
  const start = rand() * 6.28
  const wob = smoothNoise(rand, 6)
  const n = 30
  const pts: Pt[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const a = start + t * Math.PI * 2 * 1.07
    const rr = r * (1 + wob(t) * 0.035)
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr])
  }
  return inkPath(pts, { jitter: 0, taper: 0.3, ...opts })
}

/** 圓角矩形的外框點（順時針） */
export function roundRectPts(x: number, y: number, w: number, h: number, r: number, seg = 4): Pt[] {
  const out: Pt[] = []
  const corner = (cx: number, cy: number, from: number) => {
    for (let i = 0; i <= seg; i++) {
      const a = from + (i / seg) * (Math.PI / 2)
      out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
    }
  }
  corner(x + w - r, y + r, -Math.PI / 2)
  corner(x + w - r, y + h - r, 0)
  corner(x + r, y + h - r, Math.PI / 2)
  corner(x + r, y + r, Math.PI)
  return out
}

/** 封閉的外框分成兩筆畫：起點錯開、頭尾稍微交疊，像手繪時分兩次描完 */
export function inkLoop(pts: Pt[], opts: InkOpts = {}): string {
  const n = pts.length
  const rand = rng((opts.seed ?? 1) + 991)
  const start = Math.floor(rand() * n)
  const half = Math.floor(n / 2)
  const seg = (from: number, len: number): Pt[] => Array.from({ length: len + 1 }, (_, i) => pts[(from + i) % n])
  return (
    inkPath(seg(start, half + 1), { taper: 0.3, ...opts, seed: (opts.seed ?? 1) * 3 + 1 }) +
    inkPath(seg(start + half, n - half + 1), { taper: 0.3, ...opts, seed: (opts.seed ?? 1) * 3 + 2 })
  )
}

export const rectPts = (x: number, y: number, w: number, h: number): Pt[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
]

export const fillPath = (pts: Pt[]): string => `M${pts.map((p) => `${num(p[0])} ${num(p[1])}`).join('L')}Z`

export interface HatchOpts {
  spacing?: number
  angle?: number
  width?: number
  seed?: number
  /** 再疊一層垂直方向的線 */
  cross?: boolean
}

/** 在多邊形裡畫排線（鉛筆陰影） */
export function hatch(poly: Pt[], opts: HatchOpts = {}): string {
  const spacing = opts.spacing ?? 5
  const width = opts.width ?? 0.9
  const seed = opts.seed ?? 1
  const angles = opts.cross ? [opts.angle ?? -0.8, (opts.angle ?? -0.8) + Math.PI / 2] : [opts.angle ?? -0.8]
  let d = ''
  angles.forEach((angle, ai) => {
    const rand = rng(seed * 13 + ai * 101)
    const c = Math.cos(-angle)
    const s = Math.sin(-angle)
    const rot = poly.map(([x, y]) => [x * c - y * s, x * s + y * c] as Pt)
    const ys = rot.map((p) => p[1])
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const ic = Math.cos(angle)
    const is = Math.sin(angle)
    let k = 0
    for (let y = minY + spacing * 0.5; y < maxY; y += spacing * (ai ? 1.25 : 1) * (0.8 + rand() * 0.4)) {
      const xs: number[] = []
      for (let i = 0; i < rot.length; i++) {
        const a = rot[i]
        const b = rot[(i + 1) % rot.length]
        if (a[1] <= y !== b[1] <= y) xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]))
      }
      xs.sort((p, q) => p - q)
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const x0 = xs[i] + rand() * spacing * 0.5
        const x1 = xs[i + 1] - rand() * spacing * 0.5
        if (x1 - x0 < spacing * 0.4) continue
        const p0: Pt = [x0 * ic - y * is, x0 * is + y * ic]
        const p1: Pt = [x1 * ic - y * is, x1 * is + y * ic]
        d += inkPath([p0, p1], { width, jitter: width * 0.35, taper: 0.25, pressure: 0.4, seed: seed * 97 + ai * 31 + k++ })
      }
    }
  })
  return d
}

/** 墨點 */
export function inkBlob(cx: number, cy: number, r: number, seed = 1): string {
  const rand = rng(seed)
  const pts: Pt[] = []
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2
    const rr = r * (0.82 + rand() * 0.36)
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr])
  }
  return fillPath(pts)
}

// ── 用資料描述一張圖：依序畫，後面的蓋住前面的 ──
export type Prim =
  | { k: 'fill'; pts: Pt[]; tone: string; opacity?: number }
  | { k: 'disc'; c: Pt; r: number; tone: string; opacity?: number }
  | ({ k: 'hatch'; pts: Pt[]; tone?: string; opacity?: number } & HatchOpts)
  | { k: 'poly'; pts: Pt[]; w?: number; tone?: string; opacity?: number; over?: number }
  | { k: 'path'; pts: Pt[]; w?: number; tone?: string; opacity?: number; taper?: number }
  | { k: 'ring'; c: Pt; r: number; w?: number; tone?: string; opacity?: number }
  | { k: 'loop'; pts: Pt[]; w?: number; tone?: string; opacity?: number }

export interface Drawn {
  d: string
  fill: string
  opacity?: number
  /** 會跟著「呼吸」的線條（平塗色塊不會） */
  line: boolean
}

export const TONE = {
  ink: 'var(--color-ink)',
  near: 'var(--color-near)',
  mid: 'var(--color-mid)',
  far: 'var(--color-far)',
  paper: 'var(--color-paper)',
  white: 'var(--color-card)',
  red: 'var(--color-red)',
  redDark: 'var(--color-red-dark)',
  redLight: 'var(--color-red-soft)',
  marker: 'var(--color-marker)',
  markerLight: 'var(--color-sun)',
  kraftL: 'var(--color-wood)',
  kraftM: 'var(--color-wood-deep)',
  kraftD: 'var(--color-kraft-dark)',
  indigoL: 'var(--color-deck-soft)',
  indigoM: 'var(--color-deck)',
  indigoD: 'var(--color-indigo-dark)',
  mossL: 'var(--color-leaf-soft)',
  mossM: 'var(--color-moss)',
  shadow: 'var(--color-shadow)',
}

export function draw(prims: Prim[], seed = 0): Drawn[] {
  return prims.map((p, i): Drawn => {
    const s = seed + i * 17 + 1
    switch (p.k) {
      case 'fill':
        return { d: fillPath(p.pts), fill: p.tone, opacity: p.opacity, line: false }
      case 'disc':
        return { d: fillPath(circlePts(p.c[0], p.c[1], p.r)), fill: p.tone, opacity: p.opacity, line: false }
      case 'hatch':
        return { d: hatch(p.pts, { ...p, seed: (p.seed ?? 0) + s }), fill: p.tone ?? TONE.mid, opacity: p.opacity, line: true }
      case 'poly':
        return { d: inkPoly(p.pts, { width: p.w ?? 2, overshoot: p.over, seed: s }), fill: p.tone ?? TONE.ink, opacity: p.opacity, line: true }
      case 'path':
        return { d: inkPath(p.pts, { width: p.w ?? 2, taper: p.taper, seed: s }), fill: p.tone ?? TONE.ink, opacity: p.opacity, line: true }
      case 'ring':
        return { d: inkCircle(p.c[0], p.c[1], p.r, { width: p.w ?? 2, seed: s }), fill: p.tone ?? TONE.ink, opacity: p.opacity, line: true }
      case 'loop':
        return { d: inkLoop(p.pts, { width: p.w ?? 2, seed: s }), fill: p.tone ?? TONE.ink, opacity: p.opacity, line: true }
    }
  })
}
