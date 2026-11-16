// 開機加載畫面（畫面本身寫在 index.html）收尾：
//   1. 進度條補滿
//   2. 牌扇、小棋盤停在和主畫面插圖一樣的姿勢（牌翻正面、扇開；棋盤只留兩顆子）
//   3. 主畫面開始進場，牌扇和棋盤各自飛到主畫面「撲克牌」「棋盤」插圖的位置，背景同時淡掉
//   4. 落定後換成主畫面真正的插圖，移除加載畫面
import { reducedMotion } from './motion'

// ── 字型與進度條 ──
// 中文字型兩個字重各約 1MB。以前要等畫面用到才開始下載，而且只等畫面上已經用到的那一個：
// 進度條跑到七成就停住等字型（看起來卡在 2/3），另一個字重進主畫面後才開始下載（粗體字晚到）。
// 現在一開機就三個字型一起下載，進度條照真正下載完幾個往前走，等待時慢慢往前爬不會停住。
const FONTS = ['900 1em "Noto Sans TC"', '500 1em "Noto Sans TC"', '400 1em "Alfa Slab One"']
/** 程式載好時進度條的位置（之前由 index.html 的 CSS 動畫跑到這裡） */
const BASE = 0.3
let fontsDone: Promise<void> = Promise.resolve()
let loaded = 0
/** 開機一開始就呼叫：三個字型同時開始下載 */
export function startFontLoads() {
  const fonts = document.fonts
  if (!fonts?.load) return
  fontsDone = Promise.all(
    FONTS.map((spec) =>
      fonts
        .load(spec, '一A1')
        .catch(() => [])
        .then(() => void loaded++),
    ),
  ).then(() => undefined)
}

/** 進度條：照時間穩穩往前走（越接近終點越慢，最多到九成二），每下載好一個字型就至少到那一格；全部好了才補滿 */
let barRaf = 0
function runBar(fill: HTMLElement) {
  const cs = getComputedStyle(fill)
  const m = new DOMMatrixReadOnly(cs.transform === 'none' ? undefined : cs.transform)
  let shown = Math.max(0, Math.min(1, m.a))
  fill.getAnimations().forEach((a) => a.cancel())
  fill.style.animation = 'none'
  const t0 = performance.now()
  const tick = (now: number) => {
    const byTime = BASE + (0.92 - BASE) * (1 - Math.exp(-(now - t0) / 2500))
    const byCount = BASE + (loaded / FONTS.length) * (1 - BASE)
    const goal = Math.max(byTime, byCount)
    shown += (goal - shown) * 0.1
    fill.style.transform = `scaleX(${shown})`
    barRaf = requestAnimationFrame(tick)
  }
  barRaf = requestAnimationFrame(tick)
}

const wait = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms))
const EASE = 'cubic-bezier(.22,1,.36,1)'

/** 把正在跑的 CSS 動畫停在現在的樣子，再用 transition 補到目標 */
function settle(el: Element, target: Partial<Record<'transform' | 'opacity', string>>, ms: number) {
  const box = el as SVGElement | HTMLElement
  const cs = getComputedStyle(box)
  const now = { transform: cs.transform, opacity: cs.opacity }
  box.getAnimations().forEach((a) => a.cancel())
  box.style.animation = 'none'
  box.style.transform = now.transform === 'none' ? '' : now.transform
  box.style.opacity = now.opacity
  void box.getBoundingClientRect()
  box.style.transition = `transform ${ms}ms ${EASE}, opacity ${ms}ms ease`
  if (target.transform !== undefined) box.style.transform = target.transform
  if (target.opacity !== undefined) box.style.opacity = target.opacity
}

/** 插圖（viewBox 200×150、置中縮放）實際畫出來的範圍；扣掉進場動畫還沒走完的位移 */
function contentBox(el: Element, lift = 0) {
  const r = el.getBoundingClientRect()
  const k = Math.min(r.width / 200, r.height / 150)
  return { x: r.left + (r.width - 200 * k) / 2, y: r.top - lift + (r.height - 150 * k) / 2, k }
}
function liftOf(el: Element | null) {
  if (!el) return 0
  const m = new DOMMatrixReadOnly(getComputedStyle(el).transform === 'none' ? undefined : getComputedStyle(el).transform)
  return m.m42
}

/** 手機直拿時（和 index.html、App.vue 的「請轉成橫向」同一個條件） */
const PORTRAIT = '(orientation: portrait) and (max-width: 700px)'
/** 等到手機轉成橫向（本來就是橫向就馬上往下） */
function untilLandscape(): Promise<void> {
  const mq = window.matchMedia?.(PORTRAIT)
  if (!mq?.matches) return Promise.resolve()
  return new Promise((ok) => {
    const check = () => {
      if (mq.matches) return
      mq.removeEventListener('change', check)
      ok()
    }
    mq.addEventListener('change', check)
  })
}

export async function finishBoot() {
  const boot = document.getElementById('boot')
  const root = document.documentElement
  if (!boot) {
    root.classList.remove('booting')
    document.getElementById('boot-rotate')?.remove()
    return
  }
  // 直拿時先只顯示「請轉成橫向」，轉過來才開始加載動畫（動畫在直拿時是暫停的）
  await untilLandscape()
  document.getElementById('boot-rotate')?.remove()
  const started = performance.now()
  const fillEl = boot.querySelector<HTMLElement>('.fill')
  if (fillEl && !reducedMotion()) runBar(fillEl)
  // 三個字型都下載好才進主畫面（進去後粗體字不會晚到）；網路太慢最多等 6 秒，之後字型照樣會補上
  await Promise.race([fontsDone, wait(6000)])
  await (document.fonts?.ready ?? Promise.resolve())
  await wait(Math.max(0, 900 - (performance.now() - started))) // 至少轉一下，不要一閃而過
  cancelAnimationFrame(barRaf)
  await new Promise((ok) => requestAnimationFrame(ok))

  const cardsArt = document.querySelector('.home .panel.cards .art')
  const boardArt = document.querySelector('.home .panel.board .art')
  const fan = boot.querySelector('.fan')
  const goban = boot.querySelector('.goban')
  const bar = boot.querySelector<HTMLElement>('.bar')!
  const bg = boot.querySelector<HTMLElement>('.bg')!

  // 減少動態，或不是停在主畫面：直接淡掉
  cancelAnimationFrame(barRaf)
  if (reducedMotion() || !cardsArt || !boardArt || !fan || !goban) {
    root.classList.remove('booting')
    boot.style.transition = 'opacity 300ms ease'
    boot.style.opacity = '0'
    await wait(320)
    boot.remove()
    return
  }

  // 1. 進度條補滿
  settle(boot.querySelector('.fill')!, { transform: 'scaleX(1)' }, 260)
  await wait(260)

  // 2. 停在主畫面插圖的姿勢
  boot.querySelectorAll<SVGGElement>('.fc').forEach((g) => {
    settle(g, { transform: `rotate(${g.style.getPropertyValue('--a').trim() || '0deg'})` }, 420)
    settle(g.querySelector('.face')!, { transform: 'scaleX(1)' }, 260)
    settle(g.querySelector('.back')!, { transform: 'scaleX(0)' }, 200)
  })
  boot.querySelectorAll('.drop, .ring').forEach((el) => settle(el, { opacity: '0' }, 260))
  bar.style.transition = `opacity 240ms ease, transform 320ms ${EASE}`
  bar.style.opacity = '0'
  bar.style.transform = 'translate(-50%, 1.2vmin)'
  await wait(380)

  // 3. 主畫面開始進場（插圖先藏著），牌扇、棋盤飛過去
  root.classList.add('boot-handoff')
  root.classList.remove('booting')
  await new Promise((ok) => requestAnimationFrame(ok))
  const fly = (from: Element, to: Element, delay: number) => {
    const a = contentBox(from)
    const b = contentBox(to, liftOf(to.closest('.panel')))
    const el = from as SVGElement
    el.style.transition = `transform 700ms ${EASE} ${delay}ms`
    el.style.transform = `translate(${b.x - a.x}px, ${b.y - a.y}px) scale(${b.k / a.k})`
  }
  fly(fan, cardsArt, 0)
  fly(goban, boardArt, 70)
  bg.style.transition = 'opacity 520ms ease 120ms'
  bg.style.opacity = '0'
  await wait(800)

  // 4. 換成主畫面真正的插圖
  root.classList.remove('boot-handoff')
  boot.remove()
}
