// 背景音樂：不用任何音檔，全部用程式在播放的當下合成（離線也能用）。
// 風格：輕鬆的咖啡廳 lo-fi——電鋼琴和弦、圓圓的貝斯、一條隨興的旋律、很輕的刷子鼓，加一點殘響。
// 不會聽一下就重複：以 8 小節為一段，每段重新抽「和弦進行、要不要換調、編制（分解和弦／柱式和弦、有沒有鼓、有沒有旋律、有沒有長音墊底）」，
// 旋律每次都即興生成（先出一個小動機、再變化、最後收在和弦音上），所以不會像一段錄好的音樂一直循環。
// 開關在設定（settings.music，預設開，跟音效開關分開）；音量固定、比音效小聲。切到背景、換分頁就淡出停掉，回來再淡入。
import { watch } from 'vue'
import { audioContext } from './audio'
import { settings } from './settings'

const BPM = 78
const BEAT = 60 / BPM
const BAR = BEAT * 4
/** 搖擺感：反拍的八分音符晚一點點 */
const SWING = 0.58
const BARS_PER_SECTION = 8
/** 音樂整體多大聲（比音效小聲） */
const LEVEL = 0.42

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12)
const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]
const chance = (p: number) => Math.random() < p

// ── 和弦 ──
const QUALITY: Record<string, number[]> = {
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  dom7: [0, 4, 7, 10],
  six: [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  add9: [0, 4, 7, 14],
  m9: [0, 3, 10, 14],
  maj9: [0, 4, 11, 14],
  sus: [0, 5, 7, 10],
}
/** [和弦根音離主音幾個半音, 和弦種類] */
type Chord = [number, string]
/** 常見又放鬆的和弦進行（四個和弦一組） */
const PROGRESSIONS: Chord[][] = [
  [[0, 'maj7'], [9, 'm7'], [2, 'm7'], [7, 'dom7']],
  [[2, 'm7'], [7, 'dom7'], [0, 'maj7'], [0, 'six']],
  [[5, 'maj7'], [4, 'm7'], [2, 'm7'], [0, 'maj7']],
  [[0, 'maj9'], [5, 'maj7'], [0, 'maj9'], [5, 'maj7']],
  [[9, 'm7'], [5, 'maj7'], [0, 'add9'], [7, 'sus']],
  [[0, 'maj7'], [4, 'm7'], [5, 'maj7'], [5, 'm6']],
  [[2, 'm9'], [7, 'dom7'], [4, 'm7'], [9, 'm7']],
  [[5, 'maj7'], [7, 'add9'], [4, 'm7'], [9, 'm7']],
  [[0, 'six'], [2, 'm7'], [4, 'm7'], [5, 'maj9']],
  [[9, 'm9'], [2, 'm7'], [7, 'sus'], [0, 'maj7']],
]
/** 大調五聲音階（旋律用，怎麼配都不太會難聽） */
const PENTA = [0, 2, 4, 7, 9]

/** 旋律的節奏：一小節 8 個八分音符格子，[從第幾格, 長幾格] */
const RHYTHMS: [number, number][][] = [
  [[0, 2], [2, 1], [3, 3], [6, 2]],
  [[0, 3], [3, 1], [4, 4]],
  [[1, 1], [2, 2], [4, 2], [6, 2]],
  [[0, 1], [1, 1], [2, 2], [5, 3]],
  [[0, 6], [6, 2]],
  [[2, 2], [4, 1], [5, 3]],
  [[0, 2], [3, 2], [5, 1], [6, 2]],
  [[0, 4], [4, 4]],
  [[1, 2], [4, 3]],
]

interface Section {
  key: number
  chords: Chord[]
  /** 每個和弦幾小節 */
  perChord: 1 | 2
  ep: 'block' | 'arp' | 'whole'
  drums: boolean
  melody: boolean
  pad: boolean
  /** 這一段的旋律：[小節, 格子, 長幾格, 音高] */
  tune: [number, number, number, number][]
}

// ── 播放狀態 ──
let ctx: AudioContext | null = null
let out: GainNode | null = null
let dry: GainNode | null = null
let wet: GainNode | null = null
let noise: AudioBuffer | null = null
let timer = 0
let playing = false
let nextBar = 0
let barInSection = 0
let section: Section | null = null
let sectionNo = 0
let key = 60
let voicing: number[] = [55, 60, 64, 67]

/** 8 小節一段：抽和弦進行、編制、旋律 */
function newSection(): Section {
  // 有時換調（往下五度、往上五度、或關係調）
  if (sectionNo > 0 && chance(0.3)) key += pick([5, -5, 7, -7, -3, 3])
  while (key > 64) key -= 12
  while (key < 53) key += 12
  const first = sectionNo === 0
  const s: Section = {
    key,
    chords: pick(PROGRESSIONS),
    perChord: chance(0.65) ? 2 : 1,
    ep: pick(['block', 'block', 'arp', 'whole'] as const),
    // 一開始先安靜一點：第一段沒有鼓、沒有旋律
    drums: !first && chance(0.65),
    melody: !first && chance(0.7),
    pad: chance(0.5),
    tune: [],
  }
  if (s.melody) s.tune = makeTune(s)
  sectionNo++
  return s
}

/** 第幾小節是哪個和弦 */
const chordAt = (s: Section, bar: number): Chord => s.chords[Math.floor(bar / s.perChord) % s.chords.length]
const tonesOf = (s: Section, c: Chord) => QUALITY[c[1]].map((o) => s.key + c[0] + o)

/** 旋律：前兩小節一個小動機，第 3、4 小節照節奏換音再來一次，第 5、6 小節新的，第 7 小節回到動機，第 8 小節收在和弦音上的長音 */
function makeTune(s: Section): Section['tune'] {
  const scale: number[] = []
  for (let m = 62; m <= 86; m++) if (PENTA.includes((((m - s.key) % 12) + 12) % 12)) scale.push(m)
  const nearest = (m: number) => scale.reduce((a, b) => (Math.abs(b - m) < Math.abs(a - m) ? b : a))
  let idx = scale.indexOf(nearest(74))
  const motif = [pick(RHYTHMS), pick(RHYTHMS)]
  const fresh = [pick(RHYTHMS), pick(RHYTHMS)]
  const steps = [-2, -1, -1, 0, 1, 1, 2, 3, -3]
  const out: Section['tune'] = []
  for (let bar = 0; bar < BARS_PER_SECTION; bar++) {
    const chordTones = tonesOf(s, chordAt(s, bar))
    if (bar === BARS_PER_SECTION - 1) {
      // 收尾：落在和弦音上、拉長
      const target = chordTones.map((t) => t + 12 * Math.round((scale[idx] - t) / 12))
      out.push([bar, 0, 6, nearest(target.reduce((a, b) => (Math.abs(b - scale[idx]) < Math.abs(a - scale[idx]) ? b : a)))])
      continue
    }
    // 偶爾整小節休息，留白比較放鬆
    if (bar % 2 === 1 && chance(0.18)) continue
    const rhythm = bar < 4 || bar === 6 ? motif[bar % 2] : fresh[bar % 2]
    for (const [slot, len] of rhythm) {
      idx = Math.max(0, Math.min(scale.length - 1, idx + pick(steps)))
      let m = scale[idx]
      // 重拍貼近和弦音
      if (slot === 0 || slot === 4) {
        const near = chordTones.map((t) => t + 12 * Math.round((m - t) / 12)).reduce((a, b) => (Math.abs(b - m) < Math.abs(a - m) ? b : a))
        if (Math.abs(near - m) <= 2) m = near
      }
      // 太高太低就往回拉
      if (m > 82) idx = Math.max(0, idx - 3)
      if (m < 66) idx = Math.min(scale.length - 1, idx + 3)
      out.push([bar, slot, len, m])
    }
  }
  return out
}

/** 和弦音排得靠近上一個和弦（聽起來比較順、不會跳來跳去） */
function voice(tones: number[]): number[] {
  const center = voicing.reduce((a, b) => a + b, 0) / voicing.length
  const v = tones.map((t) => {
    let m = t
    while (m < center - 6) m += 12
    while (m > center + 6) m -= 12
    return m
  })
  v.sort((a, b) => a - b)
  // 範圍不要太低太高
  while (v[0] < 50) v.forEach((_, i) => (v[i] += 12))
  while (v[v.length - 1] > 76) v.forEach((_, i) => (v[i] -= 12))
  voicing = v
  return v
}

// ── 樂器（每個音現場用振盪器合成） ──
function env(g: AudioParam, t: number, peak: number, attack: number, decayTo: number, decay: number, end: number) {
  g.setValueAtTime(0.0001, t)
  g.exponentialRampToValueAtTime(peak, t + attack)
  g.exponentialRampToValueAtTime(Math.max(0.0001, peak * decayTo), t + attack + decay)
  g.setValueAtTime(Math.max(0.0001, peak * decayTo), Math.max(t + attack + decay, end - 0.05))
  g.exponentialRampToValueAtTime(0.0001, end + 0.35)
}
/** 電鋼琴：FM 合成，按下去那一下有一點鐘聲般的亮，很快變圓 */
function ep(t: number, midi: number, dur: number, vel: number) {
  const c = ctx!
  const f = mtof(midi)
  const car = c.createOscillator()
  const mod = c.createOscillator()
  const modGain = c.createGain()
  const amp = c.createGain()
  car.type = 'sine'
  mod.type = 'sine'
  car.frequency.value = f
  mod.frequency.value = f
  modGain.gain.setValueAtTime(f * 1.5, t)
  modGain.gain.exponentialRampToValueAtTime(f * 0.12, t + 0.5)
  env(amp.gain, t, vel, 0.006, 0.32, 1.2, t + dur)
  mod.connect(modGain).connect(car.frequency)
  car.connect(amp)
  amp.connect(dry!)
  amp.connect(wet!)
  car.start(t)
  mod.start(t)
  car.stop(t + dur + 0.5)
  mod.stop(t + dur + 0.5)
}
/** 長音墊底：兩個稍微走音的三角波、慢慢浮出來、很悶 */
function pad(t: number, midi: number, dur: number, vel: number) {
  const c = ctx!
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 900
  const amp = c.createGain()
  amp.gain.setValueAtTime(0.0001, t)
  amp.gain.exponentialRampToValueAtTime(vel, t + Math.min(1.2, dur * 0.4))
  amp.gain.setValueAtTime(vel, t + dur - 0.2)
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.8)
  lp.connect(amp)
  amp.connect(dry!)
  amp.connect(wet!)
  for (const cents of [-5, 5]) {
    const o = c.createOscillator()
    o.type = 'triangle'
    o.frequency.value = mtof(midi)
    o.detune.value = cents
    o.connect(lp)
    o.start(t)
    o.stop(t + dur + 0.9)
  }
}
/** 貝斯：圓圓的正弦波＋一點點三角波 */
function bass(t: number, midi: number, dur: number, vel: number) {
  const c = ctx!
  const amp = c.createGain()
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 520
  env(amp.gain, t, vel, 0.012, 0.55, 0.6, t + dur)
  lp.connect(amp).connect(dry!)
  for (const [type, g] of [['sine', 1], ['triangle', 0.35]] as const) {
    const o = c.createOscillator()
    const og = c.createGain()
    o.type = type
    o.frequency.value = mtof(midi)
    og.gain.value = g
    o.connect(og).connect(lp)
    o.start(t)
    o.stop(t + dur + 0.4)
  }
}
/** 旋律：柔和的三角波（像木笛／鐵琴之間），帶一點顫音 */
function lead(t: number, midi: number, dur: number, vel: number) {
  const c = ctx!
  const o = c.createOscillator()
  const o2 = c.createOscillator()
  const g2 = c.createGain()
  const lp = c.createBiquadFilter()
  const amp = c.createGain()
  const lfo = c.createOscillator()
  const lfoGain = c.createGain()
  o.type = 'triangle'
  o2.type = 'sine'
  o.frequency.value = mtof(midi)
  o2.frequency.value = mtof(midi) * 2
  g2.gain.value = 0.18
  lp.type = 'lowpass'
  lp.frequency.value = 2400
  lfo.frequency.value = 5
  lfoGain.gain.setValueAtTime(0, t)
  lfoGain.gain.linearRampToValueAtTime(5, t + Math.min(0.4, dur))
  lfo.connect(lfoGain).connect(o.detune)
  env(amp.gain, t, vel, 0.025, 0.6, 0.5, t + dur)
  o.connect(lp)
  o2.connect(g2).connect(lp)
  lp.connect(amp)
  amp.connect(dry!)
  amp.connect(wet!)
  for (const x of [o, o2, lfo]) {
    x.start(t)
    x.stop(t + dur + 0.45)
  }
}
/** 鼓：很輕的大鼓（音高往下掉的正弦波）、刷子小鼓、碎碎的 hi-hat（雜訊濾一濾） */
function kick(t: number, vel: number) {
  const c = ctx!
  const o = c.createOscillator()
  const amp = c.createGain()
  o.frequency.setValueAtTime(110, t)
  o.frequency.exponentialRampToValueAtTime(46, t + 0.12)
  amp.gain.setValueAtTime(vel, t)
  amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.28)
  o.connect(amp).connect(dry!)
  o.start(t)
  o.stop(t + 0.3)
}
function hiss(t: number, vel: number, type: BiquadFilterType, freq: number, decay: number, toWet = false) {
  const c = ctx!
  const src = c.createBufferSource()
  src.buffer = noise
  src.playbackRate.value = 0.9 + Math.random() * 0.2
  const f = c.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  f.Q.value = 0.7
  const amp = c.createGain()
  amp.gain.setValueAtTime(0.0001, t)
  amp.gain.exponentialRampToValueAtTime(vel, t + 0.008)
  amp.gain.exponentialRampToValueAtTime(0.0001, t + decay)
  src.connect(f).connect(amp).connect(dry!)
  if (toWet) amp.connect(wet!)
  src.start(t, Math.random() * 0.5)
  src.stop(t + decay + 0.05)
}

/** 第幾個八分音符格子在什麼時間（反拍晚一點） */
const slotTime = (barT: number, slot: number) => barT + (Math.floor(slot / 2) + (slot % 2 ? SWING : 0)) * BEAT
/** 每個音的力度帶一點點隨機（像真人彈） */
const human = (v: number) => v * (0.85 + Math.random() * 0.3)

/** 排一小節要彈的音 */
function scheduleBar(t: number) {
  if (!section || barInSection >= BARS_PER_SECTION) {
    section = newSection()
    barInSection = 0
  }
  const s = section
  const bar = barInSection
  const chord = chordAt(s, bar)
  const chordStart = bar % s.perChord === 0
  const v = voice(tonesOf(s, chord))
  // 電鋼琴
  if (s.ep === 'block') {
    const hits: [number, number][] = chance(0.5) ? [[0, 5], [5, 3]] : [[0, 3], [3, 2], [6, 2]]
    for (const [slot, len] of hits) for (const m of v) ep(slotTime(t, slot) + Math.random() * 0.012, m, len * BEAT * 0.5, human(slot === 0 ? 0.075 : 0.05))
  } else if (s.ep === 'arp') {
    const order = chance(0.5) ? [0, 1, 2, 3, 2, 1, 0, 1] : [0, 2, 1, 3, 2, 3, 1, 2]
    order.forEach((k, slot) => ep(slotTime(t, slot), v[k], BEAT * 0.9, human(slot % 2 ? 0.045 : 0.06)))
  } else if (chordStart) {
    for (const m of v) ep(t + Math.random() * 0.015, m, BAR * s.perChord * 0.9, human(0.07))
  }
  // 長音墊底
  if (s.pad && chordStart) for (const m of v.slice(0, 3)) pad(t, m - 12 * (m > 64 ? 1 : 0), BAR * s.perChord, 0.018)
  // 貝斯
  let root = s.key + chord[0] - 24
  while (root > 47) root -= 12
  while (root < 36) root += 12
  bass(t, root, BEAT * 1.6, human(0.2))
  bass(slotTime(t, 4), chance(0.5) ? root + 7 : root, BEAT * 1.2, human(0.15))
  if (chance(0.45)) {
    // 往下一個和弦的根音走一步（經過音）
    const next = chordAt(s, bar + 1)
    let nr = s.key + next[0] - 24
    while (nr > 47) nr -= 12
    while (nr < 36) nr += 12
    bass(slotTime(t, 7), nr + (chance(0.5) ? -1 : 1), BEAT * 0.45, human(0.11))
  }
  // 鼓
  if (s.drums) {
    kick(t, human(0.16))
    if (chance(0.5)) kick(slotTime(t, 5), human(0.1))
    for (const b of [2, 6]) hiss(slotTime(t, b), human(0.035), 'bandpass', 1900, 0.2, true)
    for (let slot = 0; slot < 8; slot++) if (!chance(0.12)) hiss(slotTime(t, slot), human(slot % 2 ? 0.012 : 0.02), 'highpass', 7200, 0.05)
  }
  // 旋律
  for (const [b, slot, len, m] of s.tune) if (b === bar) lead(slotTime(t, slot) + Math.random() * 0.01, m, len * BEAT * 0.5 * 0.92, human(0.06))
  barInSection++
}

/** 每 0.1 秒看一次：快輪到的小節先排好（排到 0.6 秒後） */
function tick() {
  if (!ctx || !playing) return
  while (nextBar < ctx.currentTime + 0.6) {
    scheduleBar(nextBar)
    nextBar += BAR
  }
}

/** 混音：乾聲＋殘響，最後一個溫和的壓縮器 */
function build(c: AudioContext) {
  if (out) return
  out = c.createGain()
  out.gain.value = 0.0001
  const comp = c.createDynamicsCompressor()
  comp.threshold.value = -18
  comp.ratio.value = 3
  comp.attack.value = 0.01
  comp.release.value = 0.25
  const tone = c.createBiquadFilter()
  tone.type = 'lowpass'
  tone.frequency.value = 6500
  out.connect(tone).connect(comp).connect(c.destination)
  dry = c.createGain()
  dry.connect(out)
  // 殘響：用雜訊做一段慢慢消失的「房間聲」
  const len = Math.floor(c.sampleRate * 2.4)
  const ir = c.createBuffer(2, len, c.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3)
  }
  const conv = c.createConvolver()
  conv.buffer = ir
  const wetOut = c.createGain()
  wetOut.gain.value = 0.32
  wet = c.createGain()
  wet.connect(conv).connect(wetOut).connect(out)
  noise = c.createBuffer(1, c.sampleRate, c.sampleRate)
  const nd = noise.getChannelData(0)
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1
}

let starting = false
async function start() {
  if (playing || starting || !settings.music || document.visibilityState === 'hidden') return
  const c = audioContext()
  if (!c) return
  if (c.state !== 'running') {
    starting = true
    try {
      await c.resume()
    } catch {
      // 還不能出聲（還沒點過畫面）：等下一次點
    }
    starting = false
    // 等待的時候狀態可能變了（TypeScript 看不出來，要轉一下型別）
    if ((c.state as string) !== 'running' || playing || !settings.music || (document.visibilityState as string) === 'hidden') return
  }
  ctx = c
  build(c)
  playing = true
  section = null
  barInSection = 0
  nextBar = c.currentTime + 0.15
  const g = out!.gain
  g.cancelScheduledValues(c.currentTime)
  g.setValueAtTime(Math.max(0.0001, g.value), c.currentTime)
  g.exponentialRampToValueAtTime(LEVEL, c.currentTime + 2.5)
  window.clearInterval(timer)
  timer = window.setInterval(tick, 100)
  tick()
}
function stop() {
  if (!playing || !ctx || !out) return
  playing = false
  window.clearInterval(timer)
  const g = out.gain
  g.cancelScheduledValues(ctx.currentTime)
  g.setValueAtTime(Math.max(0.0001, g.value), ctx.currentTime)
  g.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6)
}

/** 開機時呼叫一次：第一次點畫面（瀏覽器規定要先點一下才能出聲）就開始放；設定開關、切走回來跟著停／放 */
export function initMusic() {
  const unlock = () => void start()
  window.addEventListener('pointerdown', unlock, true)
  window.addEventListener('keydown', unlock, true)
  watch(
    () => settings.music,
    (on) => {
      if (on) void start()
      else stop()
    },
  )
  document.addEventListener('visibilitychange', () => (document.visibilityState === 'hidden' ? stop() : void start()))
  window.addEventListener('obod:pause', stop)
  window.addEventListener('obod:resume', () => void start())
}
