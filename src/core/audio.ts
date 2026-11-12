// 音效：全部用 WebAudio 即時合成，不需要音檔，離線也能用。
import { settings } from './settings'

export type Sound = 'tap' | 'card' | 'stone' | 'pass' | 'win' | 'lose' | 'error' | 'deal'

let ctx: AudioContext | null = null
let noise: AudioBuffer | null = null

function audio(): AudioContext | null {
  if (settings.volume <= 0) return null
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function noiseBuffer(ac: AudioContext): AudioBuffer {
  if (!noise) {
    noise = ac.createBuffer(1, ac.sampleRate * 0.3, ac.sampleRate)
    const data = noise.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  }
  return noise
}

function tone(ac: AudioContext, freq: number, at: number, dur: number, gain: number, type: OscillatorType = 'sine', endFreq = freq) {
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, at)
  if (endFreq !== freq) osc.frequency.exponentialRampToValueAtTime(endFreq, at + dur)
  g.gain.setValueAtTime(gain * settings.volume, at)
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  osc.connect(g).connect(ac.destination)
  osc.start(at)
  osc.stop(at + dur + 0.02)
}

function hiss(ac: AudioContext, at: number, dur: number, gain: number, freq: number, q = 1) {
  const src = ac.createBufferSource()
  src.buffer = noiseBuffer(ac)
  const filter = ac.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = freq
  filter.Q.value = q
  const g = ac.createGain()
  g.gain.setValueAtTime(gain * settings.volume, at)
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  src.connect(filter).connect(g).connect(ac.destination)
  src.start(at)
  src.stop(at + dur + 0.02)
}

export function playSound(sound: Sound) {
  const ac = audio()
  if (!ac) return
  const t = ac.currentTime + 0.005
  switch (sound) {
    case 'tap':
      hiss(ac, t, 0.04, 0.25, 2600, 2)
      break
    case 'card':
      hiss(ac, t, 0.09, 0.5, 1800, 0.8)
      tone(ac, 180, t, 0.06, 0.15, 'triangle', 90)
      break
    case 'deal':
      hiss(ac, t, 0.05, 0.3, 2400, 1)
      break
    case 'stone':
      tone(ac, 520, t, 0.07, 0.4, 'triangle', 240)
      hiss(ac, t, 0.03, 0.3, 3200, 1.5)
      break
    case 'pass':
      tone(ac, 220, t, 0.12, 0.18, 'sine', 160)
      break
    case 'error':
      tone(ac, 150, t, 0.12, 0.22, 'square', 110)
      break
    case 'win':
      ;[523, 659, 784, 1047].forEach((f, i) => tone(ac, f, t + i * 0.09, 0.28, 0.22, 'triangle'))
      break
    case 'lose':
      ;[392, 330, 262].forEach((f, i) => tone(ac, f, t + i * 0.13, 0.3, 0.2, 'triangle'))
      break
  }
}
