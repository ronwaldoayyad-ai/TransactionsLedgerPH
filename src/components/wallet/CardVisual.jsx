import { useState } from 'react'
import { cardNetworkSvg } from '../../lib/wallet'

// Pick black/white text for contrast against the card's primary color so
// user-chosen light gradients stay readable.
function readableText(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
  if (!m) return '#ffffff'
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.6 ? '#0f172a' : '#ffffff'
}

function NetworkLogo({ src, className }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) return null // FR1.6: hide on failure, no text fallback
  return <img src={src} alt="" onError={() => setFailed(true)} className={className} />
}

// The physical card face. Aspect ratio ~1.586 (ISO/IEC 7810 ID-1). A flex
// column distributes the three rows top/middle/bottom so nothing overlaps or
// gets clipped, regardless of the card's rendered width.
export function CardVisual({ card, onClick, className = '', style = {} }) {
  const text = readableText(card.primaryColor)
  const muted = text === '#ffffff' ? 'rgba(255,255,255,0.7)' : 'rgba(15,23,42,0.65)'
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-label={onClick ? `${card.bankName} card ending ${card.last4}` : undefined}
      className={`relative flex aspect-[1.586] w-full flex-col justify-between overflow-hidden rounded-2xl p-4 text-left shadow-lg ${onClick ? 'cursor-pointer' : ''} ${className}`}
      style={{
        backgroundImage: `linear-gradient(135deg, ${card.primaryColor}, ${card.secondaryColor})`,
        color: text,
        ...style,
      }}
    >
      {/* Top: bank + menu glyph */}
      <div className="flex items-start justify-between gap-2">
        {card.bankLogo ? (
          <img src={card.bankLogo} alt={card.bankName} className="h-6 max-w-[55%] object-contain object-left" />
        ) : (
          <span className="truncate text-base font-bold tracking-wide">{card.bankName || 'Bank'}</span>
        )}
        <span aria-hidden className="shrink-0 text-base leading-none opacity-70">≋</span>
      </div>

      {/* Middle: chip + masked number */}
      <div className="space-y-2">
        <div
          className="h-6 w-9 rounded-md"
          style={{ background: text === '#ffffff' ? 'rgba(255,255,255,0.55)' : 'rgba(15,23,42,0.25)' }}
        />
        <div className="font-mono text-base tracking-[0.15em]" style={{ color: text }}>
          {(card.first6 || '••••••').slice(0, 6)} •••• {(card.last4 || '••••').slice(0, 4)}
        </div>
      </div>

      {/* Bottom: tier · category | network */}
      <div className="flex items-end justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 text-xs font-semibold sm:text-sm">
          <span className="truncate">{card.tier}</span>
          {card.category ? (
            <>
              <span style={{ color: muted }}>|</span>
              <span style={{ color: muted }} className="truncate font-medium">
                {card.category}
              </span>
            </>
          ) : null}
        </div>
        <NetworkLogo
          key={card.networkLogo || card.network}
          src={card.networkLogo || cardNetworkSvg(card.network)}
          className="h-6 max-h-6 w-10 shrink-0 object-contain object-right"
        />
      </div>
    </Comp>
  )
}

// Compact thumbnail (Cards on File list + bill rows): gradient tile with the
// bank logo or short name and the last 4.
export function MiniCard({ card, className = '' }) {
  const text = readableText(card.primaryColor)
  const short = (card.bankName || '••').split(/\s+/)[0].slice(0, 4).toUpperCase()
  return (
    <span
      className={`flex h-12 w-16 shrink-0 flex-col items-center justify-center rounded-lg p-1 shadow-sm ${className}`}
      style={{ backgroundImage: `linear-gradient(135deg, ${card.primaryColor}, ${card.secondaryColor})`, color: text }}
    >
      {card.bankLogo ? (
        <img src={card.bankLogo} alt={card.bankName} className="max-h-7 max-w-full object-contain" />
      ) : (
        <span className="text-xs font-bold leading-tight">{short}</span>
      )}
      <span className="text-[9px] tracking-wider opacity-80">•••• {card.last4 || '••••'}</span>
    </span>
  )
}
