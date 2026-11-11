// 手繪線條產生器：同一個 seed 每次畫出來都一樣（不會抖動）。
// 每條邊各畫一筆、稍微畫出頭，並重複描兩次，做出鉛筆打稿的感覺。

export type Pt = [number, number]

function rng(seed: number) {
  let s = (Math.imul(seed + 1, 2654435761) >>> 0) || 1
  return () => {
    s ^= s << 13
    s >>>= 0
    s ^= s >> 17
    s ^= s << 5
    s >>>= 0
    return s / 4294967296 - 0.5
  }
}

const f = (n: number) => n.toFixed(1)

export function roughLine(a: Pt, b: Pt, seed: number, jitter = 1, over = 0): string {
  const r = rng(seed)
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
  const ux = (b[0] - a[0]) / len
  const uy = (b[1] - a[1]) / len
  const o1 = over * (1 + r())
  const o2 = over * (1 + r())
  const ax = a[0] - ux * o1 + r() * jitter
  const ay = a[1] - uy * o1 + r() * jitter
  const bx = b[0] + ux * o2 + r() * jitter
  const by = b[1] + uy * o2 + r() * jitter
  const bend = r() * jitter * 2.4
  const mx = (ax + bx) / 2 - uy * bend
  const my = (ay + by) / 2 + ux * bend
  return `M${f(ax)} ${f(ay)}Q${f(mx)} ${f(my)} ${f(bx)} ${f(by)}`
}

/** 多邊形外框：每邊一筆，描 passes 次 */
export function roughPoly(pts: Pt[], seed: number, jitter = 1, over = 2, passes = 2): string {
  let d = ''
  for (let p = 0; p < passes; p++) {
    for (let i = 0; i < pts.length; i++) {
      d += roughLine(pts[i], pts[(i + 1) % pts.length], seed + i * 7 + p * 53, jitter, over)
    }
  }
  return d
}

export const rectPts = (x: number, y: number, w: number, h: number): Pt[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
]

export const polyFill = (pts: Pt[]): string => `M${pts.map((p) => `${f(p[0])} ${f(p[1])}`).join('L')}Z`

/** 略不規則、頭尾稍微交疊的圓 */
export function roughCircle(cx: number, cy: number, r: number, seed: number, jitter = 0.05, passes = 2): string {
  let d = ''
  for (let p = 0; p < passes; p++) {
    const rand = rng(seed + p * 97)
    const n = 9
    const start = rand() * 6.28
    const pts: Pt[] = []
    for (let i = 0; i <= n + 1; i++) {
      const a = start + (i / n) * Math.PI * 2
      const rr = r * (1 + rand() * jitter * 2)
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr])
    }
    const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    const m0 = mid(pts[0], pts[1])
    d += `M${f(m0[0])} ${f(m0[1])}`
    for (let i = 1; i < pts.length - 1; i++) {
      const m = mid(pts[i], pts[i + 1])
      d += `Q${f(pts[i][0])} ${f(pts[i][1])} ${f(m[0])} ${f(m[1])}`
    }
  }
  return d
}
