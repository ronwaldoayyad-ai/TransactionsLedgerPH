import Icon from '../Icon'
import { accountColors, accountMask } from '../../lib/wallet'
import { formatPeso } from '../../lib/amortization'

function readableText(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
  if (!m) return '#ffffff'
  const n = parseInt(m[1], 16)
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return lum > 0.6 ? '#0f172a' : '#ffffff'
}

// Account tile for the Coverflow — mirrors CardVisual's anatomy/sizing. Color is
// derived deterministically from the bank (accounts have no color fields).
export function AccountVisual({ account, onClick, className = '', style = {} }) {
  const [c1, c2] = accountColors(account.bankCode || account.bankName)
  const text = readableText(c1)
  const muted = text === '#ffffff' ? 'rgba(255,255,255,0.7)' : 'rgba(15,23,42,0.65)'
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-label={onClick ? `${account.bankName} account ${account.accountNumber}` : undefined}
      className={`relative flex aspect-[1.586] w-full flex-col justify-between overflow-hidden rounded-2xl p-4 text-left shadow-lg ${onClick ? 'cursor-pointer' : ''} ${className}`}
      style={{ backgroundImage: `linear-gradient(135deg, ${c1}, ${c2})`, color: text, ...style }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-base font-bold tracking-wide">{account.bankName || 'Bank'}</p>
          <p className="truncate text-xs" style={{ color: muted }}>
            {account.productType || 'Account'}
          </p>
        </div>
        <Icon name="wallet" className="h-5 w-5 shrink-0 opacity-80" />
      </div>

      <div className="font-mono text-base tracking-[0.12em]">{accountMask(account)}</div>

      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide" style={{ color: muted }}>Available</p>
          <p className="font-mono text-sm font-semibold">{formatPeso(account.availableBalance)}</p>
        </div>
        {account.ownership ? (
          <span className="truncate text-xs" style={{ color: muted }}>{account.ownership}</span>
        ) : null}
      </div>
    </Comp>
  )
}

// Compact thumbnail for the "Accounts on File" list.
export function MiniAccount({ account, className = '' }) {
  const [c1, c2] = accountColors(account.bankCode || account.bankName)
  const text = readableText(c1)
  const short = (account.bankCode || account.bankName || '••').slice(0, 4).toUpperCase()
  return (
    <span
      className={`flex h-12 w-16 shrink-0 flex-col items-center justify-center rounded-lg p-1 shadow-sm ${className}`}
      style={{ backgroundImage: `linear-gradient(135deg, ${c1}, ${c2})`, color: text }}
    >
      <span className="text-xs font-bold leading-tight">{short}</span>
      <span className="text-[9px] tracking-wider opacity-80">•••• {String(account.accountNumber || '').slice(-4) || '••••'}</span>
    </span>
  )
}
