// Lightweight, dependency-free chat sounds synthesized with the Web Audio API
// (no audio files to ship or fetch). Short, soft "modern messenger" blips for
// sending, receiving, and reacting. Honours a localStorage mute preference.

const MUTE_KEY = 'chat-sound-muted'

let ctx = null

function getCtx() {
  if (typeof window === 'undefined') return null
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  if (!ctx) ctx = new AC()
  // Browsers start the context suspended until a user gesture; resume on use.
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

export function isMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

export function setMuted(muted) {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
  } catch {
    /* ignore */
  }
}

// One enveloped oscillator voice. Optional pitch glide via `freqTo`.
function voice(c, { freq, freqTo, type = 'sine', start = 0, dur = 0.12, gain = 0.06 }) {
  const t0 = c.currentTime + start
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (freqTo) osc.frequency.exponentialRampToValueAtTime(freqTo, t0 + dur)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g).connect(c.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.03)
}

function play(voices) {
  if (isMuted()) return
  const c = getCtx()
  if (!c) return
  voices.forEach((v) => voice(c, v))
}

// Outgoing: a quick upward "swoosh" pop.
export function playSend() {
  play([{ freq: 520, freqTo: 900, type: 'sine', dur: 0.13, gain: 0.06 }])
}

// Incoming: a gentle two-note descending chime.
export function playReceive() {
  play([
    { freq: 880, type: 'sine', dur: 0.12, gain: 0.06 },
    { freq: 620, type: 'sine', start: 0.1, dur: 0.16, gain: 0.06 },
  ])
}

// Reaction: a soft little bubble tick.
export function playReaction() {
  play([{ freq: 1000, freqTo: 1320, type: 'triangle', dur: 0.08, gain: 0.05 }])
}
