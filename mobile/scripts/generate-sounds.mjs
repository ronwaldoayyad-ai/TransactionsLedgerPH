// Renders the web app's Web Audio chat blips (src/lib/chatSounds.js) into
// bundled WAV assets — RN has no Web Audio API. Zero deps; run once:
//   node scripts/generate-sounds.mjs
// Output is committed under assets/sounds/.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RATE = 44100
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'sounds')

// One enveloped oscillator voice — numeric mirror of chatSounds.js `voice()`.
// gain: exp ramp 0.0001 → peak over 12ms, then exp decay → 0.0001 at dur.
function renderVoice(buf, { freq, freqTo, type = 'sine', start = 0, dur = 0.12, gain = 0.06 }) {
  const n0 = Math.floor(start * RATE)
  const n1 = Math.min(buf.length, Math.floor((start + dur + 0.03) * RATE))
  const attack = 0.012
  let phase = 0
  for (let i = n0; i < n1; i++) {
    const t = (i - n0) / RATE
    // Exponential pitch glide (matches exponentialRampToValueAtTime).
    const f = freqTo ? freq * Math.pow(freqTo / freq, Math.min(1, t / dur)) : freq
    phase += (2 * Math.PI * f) / RATE
    const osc =
      type === 'triangle' ? (2 / Math.PI) * Math.asin(Math.sin(phase)) : Math.sin(phase)
    // Envelope
    let env
    if (t < attack) env = 0.0001 * Math.pow(gain / 0.0001, t / attack)
    else if (t < dur) env = gain * Math.pow(0.0001 / gain, (t - attack) / (dur - attack))
    else env = 0
    buf[i] += osc * env
  }
}

function writeWav(name, voices) {
  const total = Math.max(...voices.map((v) => (v.start ?? 0) + v.dur + 0.05))
  const buf = new Float64Array(Math.ceil(total * RATE))
  voices.forEach((v) => renderVoice(buf, v))

  // 16-bit PCM mono WAV
  const pcm = Buffer.alloc(buf.length * 2)
  for (let i = 0; i < buf.length; i++) {
    const s = Math.max(-1, Math.min(1, buf[i]))
    pcm.writeInt16LE(Math.round(s * 32767), i * 2)
  }
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16) // PCM chunk size
  header.writeUInt16LE(1, 20) // PCM format
  header.writeUInt16LE(1, 22) // mono
  header.writeUInt32LE(RATE, 24)
  header.writeUInt32LE(RATE * 2, 28) // byte rate
  header.writeUInt16LE(2, 32) // block align
  header.writeUInt16LE(16, 34) // bits per sample
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)

  const file = join(OUT, `${name}.wav`)
  writeFileSync(file, Buffer.concat([header, pcm]))
  console.log(`wrote ${file} (${((44 + pcm.length) / 1024).toFixed(1)} KB)`)
}

mkdirSync(OUT, { recursive: true })
// Same three voices as the web (send / receive / reaction).
writeWav('send', [{ freq: 520, freqTo: 900, type: 'sine', dur: 0.13, gain: 0.06 }])
writeWav('receive', [
  { freq: 880, type: 'sine', dur: 0.12, gain: 0.06 },
  { freq: 620, type: 'sine', start: 0.1, dur: 0.16, gain: 0.06 },
])
writeWav('reaction', [{ freq: 1000, freqTo: 1320, type: 'triangle', dur: 0.08, gain: 0.05 }])
