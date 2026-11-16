// 開機加載畫面（畫面本身寫在 index.html）收尾：
//   1. 進度條補滿
//   2. 牌扇、小棋盤停在和主畫面插圖一樣的姿勢（牌翻正面、扇開；棋盤只留兩顆子）
//   3. 主畫面開始進場，牌扇和棋盤各自飛到主畫面「撲克牌」「棋盤」插圖的位置，背景同時淡掉
//   4. 落定後換成主畫面真正的插圖，移除加載畫面
import { reducedMotion } from './motion'

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
  const fonts = document.fonts?.ready ?? Promise.resolve()
  await Promise.race([fonts, wait(4000)]) // 字型萬一卡住也不要一直擋著
  await wait(Math.max(0, 1300 - (performance.now() - started))) // 至少轉一下，不要一閃而過
  await new Promise((ok) => requestAnimationFrame(ok))

  const cardsArt = document.querySelector('.home .panel.cards .art')
  const boardArt = document.querySelector('.home .panel.board .art')
  const fan = boot.querySelector('.fan')
  const goban = boot.querySelector('.goban')
  const bar = boot.querySelector<HTMLElement>('.bar')!
  const bg = boot.querySelector<HTMLElement>('.bg')!

  // 減少動態，或不是停在主畫面：直接淡掉
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
