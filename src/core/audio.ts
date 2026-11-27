// 音效播放：聲音本身在 sfx.ts 用程式算出來（不用外部音檔，離線也能用）。
// 波形在背景執行緒（sfxWorker.ts）算，開 App 後就把全部聲音先算好；主畫面不會因為算聲音而卡頓。
// 每個聲音算 3 個稍微不同的版本輪流播，播放時再加一點點音高變化（音樂音除外）。
//   撲克牌：洗牌、發牌（滑過桌面）、出牌（拍在桌上）、翻牌、抽起手牌、收牌、敲桌子過牌
//   棋盤：棋子落在木頭棋盤、從棋罐拿棋子、提子丟進盒蓋、西洋棋／象棋走子與吃子、拿起棋子
//   介面：按鈕、卡片滑動、錯誤、贏、輸、和局、答對
import { renderSfx, SFX_NAMES, type SfxName } from './sfx'
import { buzz } from './haptics'
import { settings } from './settings'

export type Sound = SfxName

const VARIANTS = 3
/** 有音高的音樂音：不加隨機的音高變化（不然每次音準不一樣） */
const MUSICAL = new Set<SfxName>(['win', 'lose', 'draw', 'correct'])
let ctx: AudioContext | null = null
let out: GainNode | null = null
const cache = new Map<SfxName, (AudioBuffer | undefined)[]>()
const turn = new Map<SfxName, number>()

function context(): AudioContext | null {
  try {
    ctx ??= new AudioContext()
    return ctx
  } catch {
    return null
  }
}
/** 背景音樂跟音效共用同一個 AudioContext */
export const audioContext = context
function audio(): AudioContext | null {
  if (settings.volume <= 0) return null
  const ac = context()
  if (ac && ac.state === 'suspended') void ac.resume()
  return ac
}

/** 總輸出：當作限幅器，很多聲音疊在一起時把峰值壓住，不會破音 */
function master(ac: AudioContext): AudioNode {
  if (!out) {
    const comp = ac.createDynamicsCompressor()
    comp.threshold.value = -10
    comp.knee.value = 6
    comp.ratio.value = 12
    comp.attack.value = 0.002
    comp.release.value = 0.12
    out = ac.createGain()
    out.connect(comp).connect(ac.destination)
  }
  out.gain.value = settings.volume
  return out
}

// ── 背景計算 ──
let worker: Worker | null | undefined
/** 正在算的聲音：算好時要通知的人 */
const waiting = new Map<string, ((b: AudioBuffer) => void)[]>()
const keyOf = (name: SfxName, v: number) => `${name}#${v}`

function store(ac: AudioContext, name: SfxName, v: number, data: Float32Array): AudioBuffer {
  const buf = ac.createBuffer(1, data.length, ac.sampleRate)
  buf.getChannelData(0).set(data)
  let list = cache.get(name)
  if (!list) cache.set(name, (list = []))
  list[v] = buf
  return buf
}
function getWorker(ac: AudioContext): Worker | null {
  if (worker !== undefined) return worker
  try {
    worker = new Worker(new URL('./sfxWorker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<{ name: SfxName; v: number; data: Float32Array }>) => {
      const { name, v, data } = e.data
      const buf = store(ac, name, v, data)
      const key = keyOf(name, v)
      for (const fn of waiting.get(key) ?? []) fn(buf)
      waiting.delete(key)
    }
    worker.onerror = () => {
      worker = null
    }
  } catch {
    worker = null
  }
  return worker
}
/** 要某個版本的聲音：算好了就馬上給；還沒就請背景去算，算好再給（沒有背景執行緒時才在這裡算） */
function request(ac: AudioContext, name: SfxName, v: number, done?: (b: AudioBuffer) => void) {
  const have = cache.get(name)?.[v]
  if (have) return done?.(have)
  const w = getWorker(ac)
  if (!w) {
    const buf = store(ac, name, v, renderSfx(name, ac.sampleRate, v + 1))
    return done?.(buf)
  }
  const key = keyOf(name, v)
  const list = waiting.get(key)
  if (list) {
    if (done) list.push(done)
    return
  }
  waiting.set(key, done ? [done] : [])
  w.postMessage({ name, sr: ac.sampleRate, v })
}

/** 開完 App 就請背景把所有聲音先算好 */
export function warmSounds() {
  const ac = context()
  if (!ac) return
  for (const name of SFX_NAMES) for (let v = 0; v < VARIANTS; v++) request(ac, name, v)
}

/** 同一種聲音正在響幾個、上次什麼時候播的（發牌時很多張牌同時落地，疊在一起會破音） */
const active = new Map<SfxName, number>()
const lastAt = new Map<SfxName, number>()
/** 同一種聲音兩次至少隔多久（毫秒）；太近就不再疊一個 */
const MIN_GAP: Partial<Record<SfxName, number>> = { deal: 60, card: 50, collect: 50, stone: 40, piece: 40 }

function start(ac: AudioContext, sound: SfxName, buf: AudioBuffer) {
  const src = ac.createBufferSource()
  src.buffer = buf
  if (!MUSICAL.has(sound)) src.playbackRate.value = 1 + (Math.random() * 2 - 1) * 0.04
  // 同一種聲音同時響越多個，每個就越小聲，加起來才不會爆
  const n = active.get(sound) ?? 0
  active.set(sound, n + 1)
  const g = ac.createGain()
  g.gain.value = 1 / Math.sqrt(1 + n)
  src.connect(g).connect(master(ac))
  src.onended = () => active.set(sound, Math.max(0, (active.get(sound) ?? 1) - 1))
  src.start(ac.currentTime + 0.002)
}

/** 暫時全部靜音（補播連線對局時快轉用） */
let muted = false
export const setMuted = (v: boolean) => (muted = v)

export function playSound(sound: Sound) {
  if (muted) return
  // 震動反饋：跟著音效一起（音效關掉也照樣震，設定裡另外有開關）
  buzz(sound)
  const ac = audio()
  if (!ac) return
  const now = performance.now()
  if (now - (lastAt.get(sound) ?? -1e9) < (MIN_GAP[sound] ?? 0)) return
  lastAt.set(sound, now)
  const k = ((turn.get(sound) ?? 0) + 1) % VARIANTS
  turn.set(sound, k)
  // 還沒算好：等背景算完再播，太晚（超過 0.15 秒）就不播了，免得聲音和畫面對不上
  request(ac, sound, k, (buf) => {
    if (performance.now() - now < 150) start(ac, sound, buf)
  })
}
