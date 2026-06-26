import { useState } from 'react'

// Round avatar: shows the user's saved picture when present and loadable,
// otherwise a deterministic coloured circle with their initial (a clean,
// gender-neutral fallback — we don't store gender, so we don't guess it).
const PALETTE = [
  'bg-rose-100 text-rose-700',
  'bg-amber-100 text-amber-700',
  'bg-emerald-100 text-emerald-700',
  'bg-sky-100 text-sky-700',
  'bg-violet-100 text-violet-700',
  'bg-indigo-100 text-indigo-700',
  'bg-teal-100 text-teal-700',
  'bg-fuchsia-100 text-fuchsia-700',
]

function colorFor(seed) {
  const s = String(seed || '')
  let h = 0
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}

export default function Avatar({ user, size = 40, className = '' }) {
  const [failedUrl, setFailedUrl] = useState(null)
  const dim = { width: size, height: size }
  const name = user?.name || ''
  const url = user?.avatarUrl
  // Show the photo unless this exact URL has already failed to load.
  if (url && url !== failedUrl) {
    return (
      <img
        src={url}
        alt={name}
        style={dim}
        onError={() => setFailedUrl(url)}
        className={`shrink-0 rounded-full border border-slate-200 bg-slate-100 object-cover ${className}`}
      />
    )
  }
  return (
    <span
      style={{ ...dim, fontSize: Math.round(size * 0.42) }}
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${colorFor(name || user?.id)} ${className}`}
      aria-hidden="true"
    >
      {(name.charAt(0) || '?').toUpperCase()}
    </span>
  )
}
