// 圖示的繪圖資料（64×64）。全部交給墨線引擎畫，所以筆觸和其他圖一致。
import { TONE, circlePts, rectPts, type Prim, type Pt } from './ink'

export type IconName = 'book' | 'tutor' | 'gear' | 'bulb' | 'play' | 'pass' | 'back' | 'menu' | 'again' | 'exit' | 'score' | 'resume' | 'rock' | 'paper' | 'scissors'

const T = TONE

function gearPts(cx: number, cy: number, outer: number, inner: number): Pt[] {
  const pts: Pt[] = []
  for (let i = 0; i < 16; i++) {
    const r = i % 2 === 0 ? outer : inner
    for (const off of [-0.11, 0.11]) {
      const a = (i / 16) * Math.PI * 2 + off
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
    }
  }
  return pts
}

const sheet: Pt[] = [
  [13, 9],
  [46, 6],
  [49, 51],
  [15, 54],
]
const bulb: Pt[] = [
  [32, 8],
  [23, 10.5],
  [16.5, 17],
  [14.5, 25],
  [17, 32],
  [22, 38],
  [23.5, 45],
  [40.5, 45],
  [42, 38],
  [47, 32],
  [49.5, 25],
  [47.5, 17],
  [41, 10.5],
]
const pageL: Pt[] = [
  [32, 17],
  [20, 12.5],
  [7, 14],
  [8, 48],
  [20, 46.5],
  [32, 51],
]
const pageR: Pt[] = [
  [32, 17],
  [44, 12.5],
  [57, 14],
  [56, 48],
  [44, 46.5],
  [32, 51],
]
const rock: Pt[] = [
  [9, 33],
  [12, 20],
  [22, 12],
  [36, 10],
  [49, 15],
  [55, 27],
  [53, 39],
  [43, 46],
  [26, 47],
  [14, 43],
]

export const ICONS: Record<IconName, Prim[]> = {
  book: [
    { k: 'hatch', pts: [[9, 51], [32, 55], [58, 51], [59, 56], [32, 61], [9, 56]], tone: T.near, spacing: 2.6, width: 1 },
    { k: 'fill', pts: pageL, tone: T.white },
    { k: 'fill', pts: pageR, tone: T.white },
    { k: 'hatch', pts: [[32, 17], [38, 14.5], [38, 48.5], [32, 51]], tone: T.mid, spacing: 2.4, width: 0.8, angle: 0.4 },
    { k: 'hatch', pts: [[26, 15], [32, 17], [32, 51], [26, 48.5]], tone: T.far, spacing: 2.4, width: 0.8, angle: -0.4 },
    { k: 'path', pts: [[12, 22], [19, 21], [25, 23]], w: 1.1, tone: T.mid },
    { k: 'path', pts: [[12, 29], [19, 28], [25, 30]], w: 1.1, tone: T.mid },
    { k: 'path', pts: [[12, 36], [19, 35], [25, 37]], w: 1.1, tone: T.mid },
    { k: 'path', pts: [[40, 30], [46, 28.5], [52, 29.5]], w: 1.1, tone: T.mid },
    { k: 'path', pts: [[40, 37], [46, 35.5], [52, 36.5]], w: 1.1, tone: T.mid },
    { k: 'poly', pts: pageL, w: 2.2 },
    { k: 'poly', pts: pageR, w: 2.2 },
    { k: 'fill', pts: [[43.5, 8], [51, 8], [51, 25], [47.3, 21], [43.5, 25]], tone: T.red },
    { k: 'poly', pts: [[43.5, 8], [51, 8], [51, 25], [47.3, 21], [43.5, 25]], w: 1.6, over: 0.6 },
  ],
  tutor: [
    { k: 'hatch', pts: [[15, 53], [51, 48], [47, 13], [53, 13], [57, 53], [19, 59]], tone: T.near, spacing: 2.8, width: 1 },
    { k: 'fill', pts: [[9, 15], [46, 10], [50, 47], [13, 52]], tone: T.markerLight },
    { k: 'hatch', pts: [[30, 49.5], [50, 47], [48, 26]], tone: T.marker, spacing: 2.8, width: 0.9 },
    { k: 'path', pts: [[17, 24], [34, 21.5]], w: 1.2, tone: T.near },
    { k: 'path', pts: [[18, 32], [31, 30]], w: 1.2, tone: T.near },
    { k: 'path', pts: [[19, 40], [27, 39]], w: 1.2, tone: T.near },
    { k: 'poly', pts: [[9, 15], [46, 10], [50, 47], [13, 52]], w: 2.2 },
    { k: 'fill', pts: [[28.5, 50.3], [57.2, 19.5], [50.6, 13.3], [21.9, 44.1]], tone: T.indigoL },
    { k: 'hatch', pts: [[28.5, 50.3], [57.2, 19.5], [53.9, 16.4], [25.2, 47.2]], tone: T.indigoM, spacing: 2.2, width: 0.9, angle: 0.2 },
    { k: 'fill', pts: [[57.2, 19.5], [61.3, 15.1], [54.7, 8.9], [50.6, 13.3]], tone: T.redLight },
    { k: 'fill', pts: [[28.5, 50.3], [21.9, 44.1], [17, 56]], tone: T.white },
    { k: 'fill', pts: [[20.6, 52.3], [19, 50.8], [17, 56]], tone: T.ink },
    { k: 'poly', pts: [[28.5, 50.3], [61.3, 15.1], [54.7, 8.9], [21.9, 44.1]], w: 1.9, over: 0.8 },
    { k: 'path', pts: [[21.9, 44.1], [17, 56], [28.5, 50.3]], w: 1.9 },
    { k: 'path', pts: [[57.2, 19.5], [50.6, 13.3]], w: 1.5 },
  ],
  gear: [
    { k: 'hatch', pts: gearPts(36, 36.5, 25, 18.5), tone: T.near, spacing: 2.8, width: 1 },
    { k: 'fill', pts: gearPts(32, 32, 25, 18.5), tone: T.far },
    { k: 'hatch', pts: [...circlePts(32, 32, 24, -0.6, 2.2, 10), ...circlePts(32, 32, 10, 2.2, -0.6, 10)], tone: T.mid, spacing: 2.6, width: 0.9 },
    { k: 'poly', pts: gearPts(32, 32, 25, 18.5), w: 2, over: 0.4 },
    { k: 'disc', c: [32, 32], r: 8.5, tone: T.paper },
    { k: 'ring', c: [32, 32], r: 8.5, w: 2 },
  ],
  bulb: [
    { k: 'fill', pts: bulb, tone: T.markerLight },
    { k: 'hatch', pts: [[38, 10], [47.5, 17], [49.5, 25], [47, 32], [42, 38], [40.5, 45], [33, 45], [40, 30]], tone: T.marker, spacing: 2.6, width: 0.9 },
    { k: 'poly', pts: bulb, w: 2.2, over: 0.3 },
    { k: 'path', pts: [[25, 50.5], [39, 50.5]], w: 2.2 },
    { k: 'path', pts: [[26.5, 55], [37.5, 55]], w: 2.2 },
    { k: 'path', pts: [[29.5, 59.3], [34.5, 59.3]], w: 2.2 },
    { k: 'path', pts: [[32, 1], [32, 4.5]], w: 1.8 },
    { k: 'path', pts: [[10, 8.5], [13, 11.5]], w: 1.8 },
    { k: 'path', pts: [[54, 8.5], [51, 11.5]], w: 1.8 },
    { k: 'path', pts: [[4, 26], [8.5, 26]], w: 1.8 },
    { k: 'path', pts: [[55.5, 26], [60, 26]], w: 1.8 },
  ],
  play: [
    { k: 'hatch', pts: [[21, 53], [50, 50], [47, 14], [53, 14], [56, 55], [23, 59]], tone: T.near, spacing: 2.8, width: 1 },
    { k: 'fill', pts: [[16, 12], [45, 9], [48, 50], [19, 53]], tone: T.white },
    { k: 'hatch', pts: [[32, 51.5], [48, 50], [46.5, 30]], tone: T.far, spacing: 2.6, width: 0.9 },
    { k: 'poly', pts: [[16, 12], [45, 9], [48, 50], [19, 53]], w: 2.2 },
    { k: 'path', pts: [[32, 44], [32, 21]], w: 4.6, tone: T.red, taper: 0.6 },
    { k: 'path', pts: [[23, 30.5], [32, 20], [41, 30]], w: 4.6, tone: T.red, taper: 0.6 },
  ],
  pass: [
    { k: 'hatch', pts: [[23, 56], [46, 54], [44, 26], [50, 26], [52, 58], [25, 61]], tone: T.near, spacing: 2.8, width: 1 },
    { k: 'fill', pts: [[19, 23], [44, 21], [46, 54], [21, 56]], tone: T.indigoL },
    { k: 'hatch', pts: [[23, 27], [40.5, 25.5], [42, 50], [24.5, 51.5]], tone: T.indigoM, spacing: 3.4, width: 0.9, cross: true },
    { k: 'poly', pts: [[19, 23], [44, 21], [46, 54], [21, 56]], w: 2.1 },
    { k: 'path', pts: [[7, 21], [14, 12], [24, 6.5], [36, 5.5], [47, 9], [56, 15]], w: 3.2 },
    { k: 'path', pts: [[56, 15], [46.5, 15.5]], w: 3 },
    { k: 'path', pts: [[56, 15], [54.5, 5.5]], w: 3 },
  ],
  back: [
    { k: 'path', pts: [[37, 13], [17, 32], [38, 51]], w: 4.8, taper: 0.5 },
    { k: 'path', pts: [[19, 32], [56, 33]], w: 4.8, taper: 0.5 },
  ],
  menu: [
    { k: 'path', pts: [[12, 19], [52, 19.5]], w: 4.6, taper: 0.5 },
    { k: 'path', pts: [[12.5, 32], [51.5, 31.5]], w: 4.6, taper: 0.5 },
    { k: 'path', pts: [[12, 45], [52, 45.6]], w: 4.6, taper: 0.5 },
  ],
  again: [
    { k: 'path', pts: circlePts(32, 33, 20, -0.55, -5.4, 24), w: 4.6, taper: 0.5 },
    { k: 'path', pts: [[52, 9], [50, 23.5], [36.5, 20]], w: 4.4, taper: 0.5 },
  ],
  exit: [
    { k: 'path', pts: [[30, 13], [12.5, 13], [13, 52], [30, 52]], w: 3.4 },
    { k: 'path', pts: [[25, 32], [55, 32.5]], w: 4.6, taper: 0.5 },
    { k: 'path', pts: [[44, 21.5], [56, 32.5], [44.5, 43.5]], w: 4.6, taper: 0.5 },
  ],
  score: [
    { k: 'hatch', pts: [[18, 54], [49, 51], [47, 10], [53, 10], [55, 56], [20, 60]], tone: T.near, spacing: 2.8, width: 1 },
    { k: 'fill', pts: sheet, tone: T.white },
    { k: 'hatch', pts: [[30, 52.5], [49, 51], [47.5, 28]], tone: T.far, spacing: 2.6, width: 0.9 },
    { k: 'path', pts: [[20, 19], [40, 17.5]], w: 1.3, tone: T.mid },
    { k: 'path', pts: [[20.5, 27], [40.5, 25.5]], w: 1.3, tone: T.mid },
    { k: 'path', pts: [[21, 35], [34, 34]], w: 1.3, tone: T.mid },
    { k: 'poly', pts: sheet, w: 2.2 },
    { k: 'path', pts: [[36, 40], [41.5, 46.5], [54, 32]], w: 4.2, tone: T.red, taper: 0.5 },
  ],
  resume: [
    { k: 'hatch', pts: [[21, 53], [55, 33], [58, 37], [23, 58]], tone: T.near, spacing: 2.8, width: 1 },
    { k: 'fill', pts: [[18, 10], [53, 31], [19, 52]], tone: T.red },
    { k: 'hatch', pts: [[18.6, 34], [44, 36.5], [19, 52]], tone: T.redDark, spacing: 2.8, width: 1 },
    { k: 'poly', pts: [[18, 10], [53, 31], [19, 52]], w: 2.4 },
  ],
  rock: [
    { k: 'hatch', pts: rock.map(([x, y]) => [x + 4, y + 5] as Pt), tone: T.near, spacing: 2.8, width: 1 },
    { k: 'fill', pts: rock, tone: T.far },
    { k: 'hatch', pts: [[30, 47], [43, 46], [53, 39], [55, 27], [49, 15], [44, 30]], tone: T.mid, spacing: 2.6, width: 1 },
    { k: 'path', pts: [[17, 24], [22, 18.5], [29, 16]], w: 1.4, tone: T.white },
    { k: 'poly', pts: rock, w: 2.3, over: 0.3 },
  ],
  paper: [
    { k: 'hatch', pts: [[18, 54], [49, 51], [47, 10], [53, 10], [55, 56], [20, 60]], tone: T.near, spacing: 2.8, width: 1 },
    { k: 'fill', pts: sheet, tone: T.white },
    { k: 'hatch', pts: [[30, 52.5], [49, 51], [47.5, 28]], tone: T.far, spacing: 2.6, width: 0.9 },
    { k: 'path', pts: [[20, 19], [40, 17.5]], w: 1.3, tone: T.mid },
    { k: 'path', pts: [[20.5, 27], [40.5, 25.5]], w: 1.3, tone: T.mid },
    { k: 'path', pts: [[21, 35], [41, 33.5]], w: 1.3, tone: T.mid },
    { k: 'path', pts: [[21.5, 43], [33, 42]], w: 1.3, tone: T.mid },
    { k: 'poly', pts: sheet, w: 2.2 },
  ],
  scissors: [
    { k: 'path', pts: [[15, 7], [28, 30]], w: 3.4, taper: 0.2 },
    { k: 'path', pts: [[34, 7], [21, 30]], w: 3.4, taper: 0.2 },
    { k: 'disc', c: [17.5, 37], r: 6.5, tone: T.redLight },
    { k: 'disc', c: [31.5, 37], r: 6.5, tone: T.redLight },
    { k: 'ring', c: [17.5, 37], r: 6.5, w: 2.4 },
    { k: 'ring', c: [31.5, 37], r: 6.5, w: 2.4 },
  ],
}

export { rectPts }
