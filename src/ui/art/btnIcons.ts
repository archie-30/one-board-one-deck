// 按鈕圓圈裡的小圖示（64×64）：線條為主，主要按鈕會改成紙色線條放在紅底上
import { circlePts, roundRectPts, type Prim, type Pt } from './ink'

export type BtnIcon = 'play' | 'tutor' | 'book' | 'gear' | 'back' | 'again' | 'exit' | 'bulb' | 'pass' | 'cards' | 'board' | 'score' | 'stone' | 'sound'

const W = 4.2
const P = (pts: Pt[], w = W): Prim => ({ k: 'path', pts, w, taper: 0.45 })

function gear(): Pt[] {
  const pts: Pt[] = []
  for (let i = 0; i < 16; i++) {
    const r = i % 2 === 0 ? 20 : 14.5
    for (const off of [-0.12, 0.12]) {
      const a = (i / 16) * Math.PI * 2 + off
      pts.push([32 + Math.cos(a) * r, 32 + Math.sin(a) * r])
    }
  }
  return pts
}

/** fill 參數是「實心部分」的顏色，交給元件決定（一般按鈕是墨色、主要按鈕是紙色） */
export function btnIcon(name: BtnIcon, fill: string): Prim[] {
  switch (name) {
    case 'play':
      return [{ k: 'fill', pts: [[22, 16], [48, 32], [22, 48]], tone: fill }, { k: 'poly', pts: [[22, 16], [48, 32], [22, 48]], w: 3, tone: fill, over: 0.4 }]
    case 'tutor':
      return [
        { k: 'poly', pts: [[19, 47], [44, 16], [51, 22], [26, 53]], w: 3.4, tone: fill, over: 0.6 },
        { k: 'fill', pts: [[19, 47], [26, 53], [15, 57]], tone: fill },
        { ...P([[38, 23], [45, 29]], 3), tone: fill },
      ]
    case 'book':
      return [
        { k: 'path', pts: [[32, 20], [22, 16], [10, 18], [10, 46], [22, 44], [32, 48]], w: 3.6, tone: fill, taper: 0.3 },
        { k: 'path', pts: [[32, 20], [42, 16], [54, 18], [54, 46], [42, 44], [32, 48]], w: 3.6, tone: fill, taper: 0.3 },
        { ...P([[32, 21], [32, 47]], 3), tone: fill },
      ]
    case 'gear':
      return [{ k: 'poly', pts: gear(), w: 3, tone: fill, over: 0.2 }, { k: 'ring', c: [32, 32], r: 6, w: 3.2, tone: fill }]
    case 'back':
      return [{ ...P([[36, 16], [20, 32], [36, 48]]), tone: fill }, { ...P([[21, 32], [50, 32]]), tone: fill }]
    case 'again':
      return [{ k: 'path', pts: circlePts(32, 33, 15, -0.5, -5.3, 20), w: W, tone: fill, taper: 0.45 }, { ...P([[48, 14], [47, 25], [36, 23]]), tone: fill }]
    case 'exit':
      return [{ k: 'path', pts: [[30, 15], [15, 15], [15, 49], [30, 49]], w: 3.4, tone: fill }, { ...P([[26, 32], [52, 32]]), tone: fill }, { ...P([[42, 22], [52, 32], [42, 42]]), tone: fill }]
    case 'bulb': {
      const b: Pt[] = [[32, 12], [22, 16], [18, 26], [22, 34], [25, 40], [39, 40], [42, 34], [46, 26], [42, 16]]
      return [{ k: 'poly', pts: b, w: 3, tone: fill, over: 0.3 }, { ...P([[26, 46], [38, 46]], 3.4), tone: fill }, { ...P([[28, 52], [36, 52]], 3.4), tone: fill }]
    }
    case 'pass':
      return [
        { k: 'loop', pts: roundRectPts(22, 24, 22, 30, 4, 2), w: 3.2, tone: fill },
        { k: 'path', pts: [[10, 26], [18, 14], [32, 9], [46, 12], [54, 20]], w: 3.4, tone: fill, taper: 0.4 },
        { ...P([[54, 20], [44, 21]], 3.4), tone: fill },
        { ...P([[54, 20], [54, 10]], 3.4), tone: fill },
      ]
    case 'cards':
      return [
        { k: 'loop', pts: roundRectPts(12, 16, 22, 32, 4, 2).map(([x, y]) => rot([x, y], [23, 32], -0.25)), w: 3, tone: fill },
        { k: 'fill', pts: roundRectPts(28, 15, 22, 32, 4, 2).map(([x, y]) => rot([x, y], [39, 31], 0.2)), tone: 'var(--btn-face)' },
        { k: 'loop', pts: roundRectPts(28, 15, 22, 32, 4, 2).map(([x, y]) => rot([x, y], [39, 31], 0.2)), w: 3, tone: fill },
      ]
    case 'board':
      return [
        { k: 'poly', pts: [[12, 12], [52, 12], [52, 52], [12, 52]], w: 3, tone: fill, over: 0.6 },
        { ...P([[12, 32], [52, 32]], 1.8), tone: fill },
        { ...P([[32, 12], [32, 52]], 1.8), tone: fill },
        { k: 'disc', c: [32, 32], r: 6.5, tone: fill },
        { k: 'ring', c: [42, 22], r: 6, w: 2.4, tone: fill },
      ]
    case 'score':
      return [
        { k: 'poly', pts: [[16, 10], [46, 10], [48, 54], [18, 54]], w: 3, tone: fill, over: 0.5 },
        { ...P([[23, 21], [40, 20]], 2.4), tone: fill },
        { ...P([[23, 30], [40, 29]], 2.4), tone: fill },
        { ...P([[30, 43], [35, 48], [52, 30]], 4.4), tone: 'var(--color-red)' },
      ]
    case 'stone':
      return [{ k: 'disc', c: [32, 32], r: 16, tone: fill }, { k: 'ring', c: [32, 32], r: 16, w: 3, tone: fill }]
    case 'sound':
      return [
        { k: 'poly', pts: [[12, 26], [20, 26], [32, 16], [32, 48], [20, 38], [12, 38]], w: 3, tone: fill, over: 0.3 },
        { k: 'path', pts: circlePts(32, 32, 10, -0.8, 0.8, 8), w: 3, tone: fill },
        { k: 'path', pts: circlePts(32, 32, 18, -0.8, 0.8, 10), w: 3, tone: fill },
      ]
  }
}

function rot([x, y]: Pt, [cx, cy]: Pt, a: number): Pt {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]
}
