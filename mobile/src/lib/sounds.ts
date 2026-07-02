import AsyncStorage from '@react-native-async-storage/async-storage'
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio'

// Chat sounds — bundled WAVs rendered by scripts/generate-sounds.mjs to match
// the web app's Web Audio blips. Mute preference uses the same key semantics
// as the web (localStorage → AsyncStorage), cached in memory for sync checks.
const MUTE_KEY = 'chat-sound-muted'
let muted = false
AsyncStorage.getItem(MUTE_KEY)
  .then((v) => {
    muted = v === '1'
  })
  .catch(() => {})

// Respect the hardware silent switch; don't interrupt the user's music.
setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => {})

const players = {
  send: createAudioPlayer(require('../../assets/sounds/send.wav')),
  receive: createAudioPlayer(require('../../assets/sounds/receive.wav')),
  reaction: createAudioPlayer(require('../../assets/sounds/reaction.wav')),
}

function play(name: keyof typeof players) {
  if (muted) return
  try {
    const p = players[name]
    p.seekTo(0)
    p.play()
  } catch {
    // never let a sound failure break the chat
  }
}

export const isMuted = () => muted
export function setMuted(next: boolean) {
  muted = next
  AsyncStorage.setItem(MUTE_KEY, next ? '1' : '0').catch(() => {})
}

export const playSend = () => play('send')
export const playReceive = () => play('receive')
export const playReaction = () => play('reaction')
