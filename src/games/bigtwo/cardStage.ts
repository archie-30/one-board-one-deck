// 牌桌動畫器：每一張牌都是一個獨立的「精靈」，有自己的位置、角度、大小與正反面。
// 要動一張牌時給它一個目標姿勢與時間，它會沿著弧線飛過去、在空中翻面、落地時壓扁一下。
// 每一幀直接改 transform，不經過 Vue，所以 52 張牌一起動也很順。
// 這裡只負責動畫，不懂任何遊戲規則。

import { reducedMotion } from '@/core/motion'

export interface Pose {
  x: number
  y: number
  /** 角度（度） */
  r: number
  /** 大小倍率 */
  s: number
  /** 0 = 背面，1 = 正面 */
  f: number
  /** 疊放順序 */
  z: number
}

export interface MoveOpts {
  delay?: number
  dur?: number
  /** 飛行時往上拱起的高度（px） */
  arc?: number
  /** 飛行中的疊放順序（通常要在最上面） */
  flightZ?: number
  /** 落地時壓扁一下 */
  land?: boolean
  instant?: boolean
}

interface Sprite {
  el: HTMLElement | null
  cur: Pose
  from: Pose
  to: Pose
  start: number
  dur: number
  arc: number
  flightZ: number
  land: boolean
  active: boolean
  landedAt: number
  shownFace: boolean | null
}

const LAND_MS = 160
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
const easeBack = (t: number) => {
  const c1 = 1.2
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export class CardStage {
  private sprites = new Map<number, Sprite>()
  private raf = 0
  private get reduced() {
    return reducedMotion()
  }
  /** 有牌落地時呼叫（拿來放音效） */
  onLand: ((id: number) => void) | null = null

  attach(id: number, el: HTMLElement | null) {
    const s = this.sprite(id)
    s.el = el
    s.shownFace = null
    if (el) this.apply(s, performance.now())
  }

  pose(id: number): Pose {
    return { ...this.sprite(id).cur }
  }

  /** 這張牌最後要停的姿勢（飛行中途也回傳終點，不會拿到翻面一半、壓扁一半的樣子） */
  target(id: number): Pose {
    return { ...this.sprite(id).to }
  }

  /** 讓一張牌移到新的姿勢 */
  move(id: number, to: Pose, opts: MoveOpts = {}) {
    const s = this.sprite(id)
    const same = !s.active && Math.abs(s.to.x - to.x) < 0.5 && Math.abs(s.to.y - to.y) < 0.5 && Math.abs(s.to.r - to.r) < 0.5 && s.to.s === to.s && s.to.f === to.f
    if (same) {
      if (s.to.z !== to.z) {
        s.to.z = to.z
        s.cur.z = to.z
        this.apply(s, performance.now())
      }
      return
    }
    if (opts.instant || this.reduced) {
      s.cur = { ...to }
      s.to = { ...to }
      s.active = false
      this.apply(s, performance.now())
      return
    }
    s.from = { ...s.cur }
    s.to = { ...to }
    s.start = performance.now() + (opts.delay ?? 0)
    s.dur = opts.dur ?? 280
    s.arc = opts.arc ?? 0
    s.flightZ = opts.flightZ ?? Math.max(to.z, s.cur.z)
    s.land = opts.land ?? false
    s.active = true
    this.kick()
  }

  destroy() {
    cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  private sprite(id: number): Sprite {
    let s = this.sprites.get(id)
    if (!s) {
      const p: Pose = { x: 0, y: 0, r: 0, s: 1, f: 0, z: 0 }
      s = { el: null, cur: { ...p }, from: { ...p }, to: { ...p }, start: 0, dur: 1, arc: 0, flightZ: 0, land: false, active: false, landedAt: -1e9, shownFace: null }
      this.sprites.set(id, s)
    }
    return s
  }

  private kick() {
    if (!this.raf) this.raf = requestAnimationFrame(this.tick)
  }

  private tick = (now: number) => {
    this.raf = 0
    let busy = false
    for (const [id, s] of this.sprites) {
      if (s.active) {
        busy = true
        const t = Math.min(1, Math.max(0, (now - s.start) / s.dur))
        if (t <= 0) continue
        const p = easeOut(t)
        const lift = Math.sin(Math.PI * t)
        s.cur = {
          x: lerp(s.from.x, s.to.x, p),
          y: lerp(s.from.y, s.to.y, p) - s.arc * lift,
          r: lerp(s.from.r, s.to.r, easeBack(t)),
          s: lerp(s.from.s, s.to.s, p) * (1 + (s.arc ? 0.1 : 0.03) * lift),
          // 翻面發生在飛行中段
          f: lerp(s.from.f, s.to.f, Math.min(1, Math.max(0, (t - 0.2) / 0.55))),
          z: t < 1 ? s.flightZ : s.to.z,
        }
        if (t >= 1) {
          s.active = false
          s.cur = { ...s.to }
          if (s.land) {
            s.landedAt = now
            this.onLand?.(id)
          }
        }
        this.apply(s, now)
      } else if (now - s.landedAt < LAND_MS) {
        busy = true
        this.apply(s, now)
      }
    }
    if (busy) this.kick()
  }

  private apply(s: Sprite, now: number) {
    const el = s.el
    if (!el) return
    const c = s.cur
    const face = c.f > 0.5
    // 翻面：用水平縮放模擬牌轉過來
    const sx = Math.max(0.04, Math.abs(Math.cos(Math.PI * c.f)))
    let sq = 1
    const since = now - s.landedAt
    if (since >= 0 && since < LAND_MS) {
      const k = 1 - since / LAND_MS
      sq = 1 + 0.07 * k * Math.sin((since / LAND_MS) * Math.PI)
    }
    el.style.transform = `translate3d(${c.x}px, ${c.y}px, 0) rotate(${c.r}deg) scale(${c.s * sx * sq}, ${(c.s * (2 - sq))})`
    el.style.zIndex = String(Math.round(c.z))
    if (s.shownFace !== face) {
      s.shownFace = face
      el.dataset.face = face ? '1' : '0'
    }
  }
}
