// 重新產生 Android App 的圖示、開機畫面，以及 Play 商店用的 512 圖示（`npm run icons`）。
// 圖案：米白紙底上，一張往左斜的撲克牌（紅心 A）＋一塊鈷藍小棋盤＋一顆黑棋子（一副牌、一盤棋）。
// 需要 Playwright 的 Chromium（本機沒有的話：npx playwright install chromium）；找不到瀏覽器時設定 CHROMIUM_PATH。
// 產生的圖檔會提交進 Git，平常打包不用跑這支。
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'

const require = createRequire(import.meta.url)
let pw
for (const name of ['playwright', 'playwright-core']) {
  try {
    pw = require(name)
    break
  } catch {
    // 換下一個
  }
}
if (!pw) throw new Error('找不到 playwright：先 npm i -D playwright 再跑一次')

const PAPER = '#EFE9DC'
const CARD = '#FBF8F1'
const INK = '#141414'
const RED = '#FF4A1C'
const BLUE = '#2340D9'
const RES = 'android/app/src/main/res'

/** 圖案本身（512 × 512 的座標），sc＝縮放（圓形、自適應圖示要留邊） */
const art = (sc) => {
  const grid = [1, 2, 3]
    .map((k) => `<line x1="${210 + k * 50}" y1="190" x2="${210 + k * 50}" y2="390" /><line x1="210" y1="${190 + k * 50}" x2="410" y2="${190 + k * 50}" />`)
    .join('')
  return `<g transform="translate(256 256) scale(${sc}) translate(-256 -256)">
  <g transform="rotate(7 310 290)">
    <rect x="222" y="202" width="200" height="200" rx="10" fill="${INK}" />
    <rect x="210" y="190" width="200" height="200" rx="10" fill="${BLUE}" stroke="${INK}" stroke-width="12" />
    <g stroke="${CARD}" stroke-width="5" opacity="0.75">${grid}</g>
  </g>
  <g transform="rotate(-11 190 250)">
    <rect x="114" y="112" width="170" height="240" rx="18" fill="${INK}" />
    <rect x="100" y="98" width="170" height="240" rx="18" fill="${CARD}" stroke="${INK}" stroke-width="12" />
    <text x="122" y="152" font-family="Georgia, 'Times New Roman', serif" font-weight="900" font-size="46" fill="${RED}">A</text>
    <path d="M185 300 C140 262 128 238 128 216 C128 196 143 182 161 182 C172 182 180 188 185 197 C190 188 198 182 209 182 C227 182 242 196 242 216 C242 238 230 262 185 300 Z" fill="${RED}" />
  </g>
  <circle cx="368" cy="372" r="58" fill="${INK}" transform="translate(9 11)" />
  <circle cx="368" cy="372" r="58" fill="${INK}" stroke="${CARD}" stroke-width="6" />
  <circle cx="348" cy="350" r="13" fill="${CARD}" opacity="0.55" />
</g>`
}
const svg = (inner, bg = null, clip = null) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">${clip ? `<defs><clipPath id="c">${clip}</clipPath></defs>` : ''}<g ${clip ? 'clip-path="url(#c)"' : ''}>${bg ? `<rect width="512" height="512" fill="${bg}"/>` : ''}${inner}</g></svg>`

const rounded = '<rect width="512" height="512" rx="112"/>'
const circle = '<circle cx="256" cy="256" r="256"/>'
const SQUARE = svg(art(0.92), PAPER, rounded)
const ROUND = svg(art(0.8), PAPER, circle)
// 自適應圖示（Android 8 以上）：前景放在 108dp 的中間 72dp 裡，外圈會被裁掉，所以縮小
const FOREGROUND = svg(art(0.62))
const FULL = svg(art(0.92), PAPER)

const jobs = []
for (const [d, s] of Object.entries({ mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 })) {
  jobs.push([`${RES}/mipmap-${d}/ic_launcher.png`, s, s, SQUARE, true])
  jobs.push([`${RES}/mipmap-${d}/ic_launcher_round.png`, s, s, ROUND, true])
}
for (const [d, s] of Object.entries({ mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 })) {
  jobs.push([`${RES}/mipmap-${d}/ic_launcher_foreground.png`, s, s, FOREGROUND, true])
}
jobs.push(['store/icon-512.png', 512, 512, FULL, false])

// 開機畫面（App 打開到遊戲載入完之前那一下）：紙底＋圖案，之後接到遊戲自己的加載畫面
const splash = (w, h) => {
  const s = Math.round(Math.min(w, h) * 0.42)
  return `<div style="width:${w}px;height:${h}px;background:${PAPER};display:flex;align-items:center;justify-content:center"><div style="width:${s}px;height:${s}px">${svg(art(1))}</div></div>`
}
const splashSizes = {
  'drawable/splash.png': [480, 320],
  'drawable-land-mdpi/splash.png': [480, 320],
  'drawable-land-hdpi/splash.png': [800, 480],
  'drawable-land-xhdpi/splash.png': [1280, 720],
  'drawable-land-xxhdpi/splash.png': [1600, 960],
  'drawable-land-xxxhdpi/splash.png': [1920, 1280],
  'drawable-port-mdpi/splash.png': [320, 480],
  'drawable-port-hdpi/splash.png': [480, 800],
  'drawable-port-xhdpi/splash.png': [720, 1280],
  'drawable-port-xxhdpi/splash.png': [960, 1600],
  'drawable-port-xxxhdpi/splash.png': [1280, 1920],
}

const exe = process.env.CHROMIUM_PATH
const b = await pw.chromium.launch(exe ? { executablePath: exe } : {})
const pg = await b.newPage()
const shot = async (file, w, h, html, transparent) => {
  await pg.setViewportSize({ width: w, height: h })
  await pg.setContent(`<html><body style="margin:0;background:transparent;overflow:hidden"><div style="width:${w}px;height:${h}px">${html}</div></body></html>`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  await pg.screenshot({ path: file, omitBackground: transparent, clip: { x: 0, y: 0, width: w, height: h } })
}
for (const [f, w, h, s, t] of jobs) await shot(f, w, h, s, t)
for (const [f, [w, h]] of Object.entries(splashSizes)) await shot(`${RES}/${f}`, w, h, splash(w, h), false)
await b.close()

fs.writeFileSync(`${RES}/values/ic_launcher_background.xml`, `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${PAPER}</color>\n</resources>\n`)
console.log('圖示、開機畫面都產生好了')
