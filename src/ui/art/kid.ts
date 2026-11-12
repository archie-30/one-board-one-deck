// 塗鴉小人：用「長相」與「心情」組出繪圖資料。分成幾個部位，讓畫面可以各自加動作。
// 座標系 80×100，腳底在 y = 96。
import { TONE, circlePts, roundRectPts, type Prim, type Pt } from './ink'

export interface KidLook {
  head: 'round' | 'square' | 'tall' | 'wide'
  hair: 'tuft' | 'bob' | 'bald' | 'spike' | 'bun' | 'long' | 'pony' | 'cone' | 'part' | 'hood'
  eyes: 'dot' | 'pill' | 'angry' | 'sleepy' | 'cross' | 'big'
  tone: 'gray' | 'indigo' | 'kraft' | 'red' | 'moss' | 'marker' | 'ink'
  extra: 'none' | 'glasses' | 'mustache' | 'band' | 'flower' | 'bow' | 'cap' | 'tie' | 'scarf'
}

export type KidMood = 'idle' | 'think' | 'happy' | 'sad' | 'smug' | 'shock'

export interface KidParts {
  legs: Prim[]
  body: Prim[]
  armL: Prim[]
  armR: Prim[]
  head: Prim[]
  face: Prim[]
}

const TONES: Record<KidLook['tone'], [string, string]> = {
  gray: [TONE.far, TONE.mid],
  indigo: [TONE.indigoL, TONE.indigoM],
  kraft: [TONE.kraftL, TONE.kraftM],
  red: [TONE.redLight, TONE.red],
  moss: [TONE.mossL, TONE.mossM],
  marker: [TONE.markerLight, TONE.marker],
  ink: [TONE.mid, TONE.near],
}

/** 只留下多邊形在 a·x + b·y >= c 這一側的部分（用來畫半邊的暗面） */
export function clipHalf(pts: Pt[], a: number, b: number, c: number): Pt[] {
  const inside = (p: Pt) => a * p[0] + b * p[1] >= c
  const out: Pt[] = []
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    const pi = inside(p)
    const qi = inside(q)
    if (pi) out.push(p)
    if (pi !== qi) {
      const t = (c - a * p[0] - b * p[1]) / (a * (q[0] - p[0]) + b * (q[1] - p[1]))
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t])
    }
  }
  return out
}

const HX = 40
const HY = 33

function headShape(head: KidLook['head']): { pts: Pt[]; top: number; half: number } {
  switch (head) {
    case 'square':
      return { pts: roundRectPts(HX - 17, HY - 16, 34, 32, 5), top: HY - 16, half: 17 }
    case 'tall':
      return { pts: roundRectPts(HX - 15, HY - 20, 30, 38, 11), top: HY - 20, half: 15 }
    case 'wide':
      return { pts: circlePts(HX, HY + 1, 20, 0, Math.PI * 2, 26).map(([x, y]) => [x, HY + 1 + (y - HY - 1) * 0.82] as Pt).slice(0, -1), top: HY - 15, half: 20 }
    default:
      return { pts: circlePts(HX, HY, 17, 0, Math.PI * 2, 24).slice(0, -1), top: HY - 17, half: 17 }
  }
}

function hairPrims(look: KidLook, top: number, half: number): Prim[] {
  const L = HX - half
  const R = HX + half
  switch (look.hair) {
    case 'tuft':
      return [
        { k: 'path', pts: [[HX - 4, top + 1], [HX - 7, top - 6]], w: 2 },
        { k: 'path', pts: [[HX, top], [HX + 1, top - 8]], w: 2 },
        { k: 'path', pts: [[HX + 4, top + 1], [HX + 8, top - 5]], w: 2 },
      ]
    case 'bob':
    case 'part':
    case 'long':
    case 'pony': {
      const cap: Pt[] = [[L - 1, HY + (look.hair === 'long' ? 18 : 4)], [L - 1, top + 8], [HX - 8, top - 2], [HX + 8, top - 2], [R + 1, top + 8], [R + 1, HY + (look.hair === 'long' ? 18 : 4)], [R - 4, HY - 2], [HX + 6, top + 7], [HX - 10, top + 9], [L + 4, HY - 2]]
      const out: Prim[] = [
        { k: 'fill', pts: cap, tone: TONE.near },
        { k: 'hatch', pts: cap, tone: TONE.ink, spacing: 1.8, width: 0.9, angle: 0.5 },
        { k: 'poly', pts: cap, w: 1.6, over: 0.3 },
      ]
      if (look.hair === 'part') out.push({ k: 'path', pts: [[HX - 6, top - 1], [HX - 3, top + 8]], w: 1.4, tone: TONE.paper })
      if (look.hair === 'pony') {
        out.push({ k: 'fill', pts: [[R, top + 6], [R + 9, top + 10], [R + 11, top + 22], [R + 4, top + 16]], tone: TONE.near })
        out.push({ k: 'poly', pts: [[R, top + 6], [R + 9, top + 10], [R + 11, top + 22], [R + 4, top + 16]], w: 1.5, over: 0.2 })
      }
      return out
    }
    case 'spike': {
      const pts: Pt[] = [[L + 1, top + 6], [L + 3, top - 5], [HX - 8, top + 2], [HX - 4, top - 8], [HX, top + 1], [HX + 5, top - 8], [HX + 8, top + 2], [R - 2, top - 5], [R - 1, top + 6]]
      return [
        { k: 'fill', pts, tone: TONE.near },
        { k: 'poly', pts, w: 1.6, over: 0.3 },
      ]
    }
    case 'bun':
      return [
        { k: 'disc', c: [HX, top - 5], r: 6.5, tone: TONE.near },
        { k: 'hatch', pts: circlePts(HX, top - 5, 6.5, 0, Math.PI * 2, 12), tone: TONE.ink, spacing: 1.6, width: 0.8 },
        { k: 'ring', c: [HX, top - 5], r: 6.5, w: 1.6 },
        { k: 'path', pts: [[L + 3, top + 7], [HX, top + 2], [R - 3, top + 7]], w: 2.2, tone: TONE.near },
      ]
    case 'cone': {
      const pts: Pt[] = [[L + 1, top + 5], [HX + 3, top - 22], [R - 1, top + 5]]
      return [
        { k: 'fill', pts, tone: TONE.near },
        { k: 'hatch', pts, tone: TONE.ink, spacing: 1.8, width: 0.9, angle: 0.6 },
        { k: 'poly', pts, w: 1.8, over: 0.6 },
        { k: 'path', pts: [[L - 2, top + 6], [R + 2, top + 5]], w: 2.4 },
      ]
    }
    case 'hood': {
      const pts = circlePts(HX, HY + 1, half + 5, Math.PI * 0.82, Math.PI * 2.18, 18)
      return [{ k: 'path', pts, w: 5.5, tone: TONE.near, taper: 0.6 }]
    }
    default:
      return [{ k: 'path', pts: [[HX + 5, top + 5], [HX + 10, top + 8]], w: 1.4, tone: TONE.mid }]
  }
}

function eyePrims(kind: KidLook['eyes'] | KidMood, mood: KidMood): Prim[] {
  const ex = [HX - 7, HX + 7]
  const y = HY + 1
  const look = mood === 'think' ? -1.6 : 0
  const out: Prim[] = []
  for (const x0 of ex) {
    const x = x0 + look
    switch (kind) {
      case 'happy':
        out.push({ k: 'path', pts: [[x - 3, y + 1], [x, y - 2.4], [x + 3, y + 1]], w: 2 })
        break
      case 'sad':
        out.push({ k: 'path', pts: [[x - 3, y - 1], [x, y + 1.6], [x + 3, y - 1]], w: 1.8 })
        out.push({ k: 'path', pts: [[x - 3.4, y - 5 + (x0 < HX ? 1.6 : 0)], [x + 3.4, y - 5 + (x0 < HX ? 0 : 1.6)]], w: 1.4 })
        break
      case 'shock':
        out.push({ k: 'ring', c: [x, y], r: 3.4, w: 1.4 })
        out.push({ k: 'disc', c: [x, y], r: 1.1, tone: TONE.ink })
        break
      case 'smug':
        out.push({ k: 'path', pts: [[x - 3, y], [x + 3, y]], w: 2.2 })
        out.push({ k: 'disc', c: [x + 0.8, y + 1.4], r: 1.3, tone: TONE.ink })
        break
      case 'pill':
        out.push({ k: 'fill', pts: roundRectPts(x - 1.8, y - 4, 3.6, 8, 1.8, 3), tone: TONE.ink })
        break
      case 'angry':
        out.push({ k: 'disc', c: [x, y + 0.5], r: 2, tone: TONE.ink })
        out.push({ k: 'path', pts: x0 < HX ? [[x - 4, y - 6], [x + 3, y - 3.5]] : [[x - 3, y - 3.5], [x + 4, y - 6]], w: 2 })
        break
      case 'sleepy':
        out.push({ k: 'path', pts: [[x - 3, y], [x, y + 2], [x + 3, y]], w: 1.8 })
        break
      case 'cross':
        out.push({ k: 'path', pts: [[x - 2.6, y - 2.6], [x + 2.6, y + 2.6]], w: 1.6 })
        out.push({ k: 'path', pts: [[x + 2.6, y - 2.6], [x - 2.6, y + 2.6]], w: 1.6 })
        break
      case 'big':
        out.push({ k: 'ring', c: [x, y], r: 3.6, w: 1.3 })
        out.push({ k: 'disc', c: [x + 0.8, y + 0.6], r: 1.8, tone: TONE.ink })
        break
      default:
        out.push({ k: 'disc', c: [x, y], r: 2.1, tone: TONE.ink })
    }
  }
  return out
}

function mouthPrims(mood: KidMood): Prim[] {
  const y = HY + 9
  switch (mood) {
    case 'happy':
      return [
        { k: 'fill', pts: [[HX - 5, y - 1], [HX + 5, y - 1], [HX + 3, y + 3], [HX, y + 4], [HX - 3, y + 3]], tone: TONE.redLight },
        { k: 'poly', pts: [[HX - 5, y - 1], [HX + 5, y - 1], [HX + 3, y + 3], [HX, y + 4], [HX - 3, y + 3]], w: 1.5, over: 0.2 },
      ]
    case 'sad':
      return [{ k: 'path', pts: [[HX - 4, y + 2], [HX, y - 0.6], [HX + 4, y + 2]], w: 1.6 }]
    case 'shock':
      return [{ k: 'ring', c: [HX, y + 1], r: 2.4, w: 1.5 }]
    case 'smug':
      return [{ k: 'path', pts: [[HX - 3, y + 0.6], [HX + 2, y + 0.6], [HX + 5, y - 1.8]], w: 1.6 }]
    case 'think':
      return [{ k: 'path', pts: [[HX - 2.5, y + 0.5], [HX + 2.5, y]], w: 1.5 }]
    default:
      return [{ k: 'path', pts: [[HX - 3, y], [HX, y + 1.4], [HX + 3, y]], w: 1.5 }]
  }
}

function extraPrims(look: KidLook, top: number, half: number): { head: Prim[]; body: Prim[] } {
  const R = HX + half
  switch (look.extra) {
    case 'glasses':
      return {
        head: [
          { k: 'ring', c: [HX - 7, HY + 1], r: 4.6, w: 1.3 },
          { k: 'ring', c: [HX + 7, HY + 1], r: 4.6, w: 1.3 },
          { k: 'path', pts: [[HX - 2.4, HY + 0.5], [HX + 2.4, HY + 0.5]], w: 1.2 },
        ],
        body: [],
      }
    case 'mustache':
      return { head: [{ k: 'path', pts: [[HX - 7, HY + 8.5], [HX - 2, HY + 6], [HX, HY + 7], [HX + 2, HY + 6], [HX + 7, HY + 8.5]], w: 3, tone: TONE.near, taper: 0.2 }], body: [] }
    case 'band':
      return { head: [{ k: 'path', pts: [[HX - half, top + 8], [HX, top + 6], [HX + half, top + 8]], w: 3.6, tone: TONE.red, taper: 0.8 }, { k: 'path', pts: [[R, top + 8], [R + 6, top + 4]], w: 2.2, tone: TONE.red }], body: [] }
    case 'flower':
      return {
        head: [
          ...[0, 1, 2, 3, 4].map((i): Prim => ({ k: 'disc', c: [R - 3 + Math.cos(i * 1.256) * 3.2, top + 5 + Math.sin(i * 1.256) * 3.2], r: 2.4, tone: TONE.redLight })),
          { k: 'disc', c: [R - 3, top + 5], r: 1.6, tone: TONE.marker },
          { k: 'ring', c: [R - 3, top + 5], r: 5.4, w: 1, tone: TONE.redDark },
        ],
        body: [],
      }
    case 'bow':
      return {
        head: [
          { k: 'fill', pts: [[R - 6, top + 1], [R - 12, top - 4], [R - 12, top + 6]], tone: TONE.red },
          { k: 'fill', pts: [[R - 6, top + 1], [R, top - 4], [R, top + 6]], tone: TONE.red },
          { k: 'poly', pts: [[R - 6, top + 1], [R - 12, top - 4], [R - 12, top + 6]], w: 1.2, over: 0.2 },
          { k: 'poly', pts: [[R - 6, top + 1], [R, top - 4], [R, top + 6]], w: 1.2, over: 0.2 },
        ],
        body: [],
      }
    case 'cap': {
      const cap: Pt[] = [[HX - half + 1, top + 7], [HX - half + 3, top - 2], [HX + half - 3, top - 2], [HX + half - 1, top + 7]]
      return {
        head: [
          { k: 'fill', pts: cap, tone: TONE.kraftM },
          { k: 'hatch', pts: cap, tone: TONE.kraftD, spacing: 2, width: 0.8 },
          { k: 'poly', pts: cap, w: 1.6, over: 0.3 },
          { k: 'path', pts: [[HX - half - 6, top + 7], [HX + half, top + 7]], w: 2.6 },
        ],
        body: [],
      }
    }
    case 'tie':
      return { head: [], body: [{ k: 'fill', pts: [[HX - 2.5, 53], [HX + 2.5, 53], [HX + 3.5, 66], [HX, 70], [HX - 3.5, 66]], tone: TONE.red }, { k: 'poly', pts: [[HX - 2.5, 53], [HX + 2.5, 53], [HX + 3.5, 66], [HX, 70], [HX - 3.5, 66]], w: 1.2, over: 0.2 }] }
    case 'scarf':
      return {
        head: [],
        body: [
          { k: 'fill', pts: [[HX - 15, 50], [HX + 15, 50], [HX + 14, 56], [HX - 14, 56]], tone: TONE.red },
          { k: 'fill', pts: [[HX + 7, 54], [HX + 13, 54], [HX + 16, 68], [HX + 10, 69]], tone: TONE.red },
          { k: 'hatch', pts: [[HX + 7, 54], [HX + 13, 54], [HX + 16, 68], [HX + 10, 69]], tone: TONE.redDark, spacing: 2, width: 0.8 },
          { k: 'poly', pts: [[HX - 15, 50], [HX + 15, 50], [HX + 14, 56], [HX - 14, 56]], w: 1.6, over: 0.4 },
          { k: 'poly', pts: [[HX + 7, 54], [HX + 13, 54], [HX + 16, 68], [HX + 10, 69]], w: 1.4, over: 0.3 },
        ],
      }
    default:
      return { head: [], body: [] }
  }
}

export function kidParts(look: KidLook, mood: KidMood): KidParts {
  const [light, dark] = TONES[look.tone]
  const { pts: head, top, half } = headShape(look.head)
  const bodyPts = roundRectPts(HX - 14, 51, 28, 30, 7)
  const extra = extraPrims(look, top, half)

  const arm = (side: -1 | 1): Prim[] => {
    const sx = HX + side * 13
    let hand: Pt
    let elbow: Pt
    if (mood === 'happy') {
      elbow = [sx + side * 7, 50]
      hand = [sx + side * 9, 40]
    } else if (mood === 'think' && side === 1) {
      elbow = [sx + 6, 66]
      hand = [HX + 6, HY + 13]
    } else if (mood === 'shock') {
      elbow = [sx + side * 9, 58]
      hand = [sx + side * 15, 52]
    } else if (mood === 'sad') {
      elbow = [sx + side * 3, 66]
      hand = [sx + side * 3, 78]
    } else {
      elbow = [sx + side * 5, 64]
      hand = [sx + side * 6, 74]
    }
    return [
      { k: 'path', pts: [[sx, 56], elbow, hand], w: 2.6 },
      { k: 'disc', c: hand, r: 2.6, tone: TONE.white },
      { k: 'ring', c: hand, r: 2.6, w: 1.4 },
    ]
  }

  const eyes: KidLook['eyes'] | KidMood = mood === 'idle' || mood === 'think' ? look.eyes : mood
  return {
    legs: [
      { k: 'hatch', pts: [[22, 95], [58, 95], [60, 99], [20, 99]], tone: TONE.near, spacing: 2.2, width: 0.9, opacity: 0.7 },
      { k: 'fill', pts: roundRectPts(HX - 10, 79, 8, 15, 2.5, 2), tone: TONE.near },
      { k: 'fill', pts: roundRectPts(HX + 2, 79, 8, 15, 2.5, 2), tone: TONE.near },
      { k: 'path', pts: [[HX - 11, 95], [HX - 1, 95]], w: 3 },
      { k: 'path', pts: [[HX + 1, 95], [HX + 11, 95]], w: 3 },
    ],
    body: [
      { k: 'fill', pts: bodyPts, tone: light },
      { k: 'hatch', pts: [[HX + 1, 51], [HX + 14, 51], [HX + 14, 81], [HX - 6, 81]], tone: dark, spacing: 2.4, width: 1 },
      { k: 'loop', pts: bodyPts, w: 2.2 },
      { k: 'disc', c: [HX, 61], r: 1.6, tone: TONE.ink },
      { k: 'disc', c: [HX, 69], r: 1.6, tone: TONE.ink },
      ...extra.body,
    ],
    armL: arm(-1),
    armR: arm(1),
    head: [
      { k: 'fill', pts: head, tone: TONE.white },
      { k: 'hatch', pts: clipHalf(head, 1, 0.7, HX + 5 + HY * 0.7), tone: TONE.far, spacing: 2.2, width: 0.9 },
      { k: 'loop', pts: head, w: 2.3 },
      ...hairPrims(look, top, half),
      ...extra.head,
    ],
    face: [...eyePrims(eyes, mood), ...(look.extra === 'mustache' && mood !== 'happy' ? [] : mouthPrims(mood))],
  }
}
