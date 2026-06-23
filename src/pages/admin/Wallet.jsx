import { useMemo, useState } from 'react'
import { useWallet } from '../../hooks/useWallet'
import { PageHeader } from '../../components/AppShell'
import Icon from '../../components/Icon'
import { Button, Card, CardHeader, EmptyState, Modal } from '../../components/ui'
import { CardVisual, MiniCard } from '../../components/wallet/CardVisual'
import CardForm from '../../components/wallet/CardForm'
import BillTracker from '../../components/wallet/BillTracker'
import WalletAnalytics from '../../components/wallet/WalletAnalytics'
import { formatDate, formatPeso } from '../../lib/amortization'
import { portfolioTotals } from '../../lib/wallet'

// Black/white text for contrast against a banner color.
function readable(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
  if (!m) return '#ffffff'
  const n = parseInt(m[1], 16)
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return lum > 0.6 ? '#0f172a' : '#ffffff'
}

const TABS = [
  ['cards', 'My Cards'],
  ['bills', 'Bill Tracker'],
  ['analytics', 'Analytics'],
]

export default function Wallet() {
  const wallet = useWallet()
  const { cards, bills, payments, loading, error, reload } = wallet
  const [tab, setTab] = useState('cards')
  const [selectedId, setSelectedId] = useState(null)
  const [cardModal, setCardModal] = useState(null) // { initial } | null
  const [confirmDelete, setConfirmDelete] = useState(null) // card id

  const totals = useMemo(() => portfolioTotals(cards), [cards])
  const selected = cards.find((c) => c.id === selectedId) ?? cards[0] ?? null

  return (
    <>
      <PageHeader
        title="Card & Bills Wallet"
        subtitle="Track your cards, bills, and payments. Private to your account."
        action={
          <button
            onClick={reload}
            className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors duration-200 hover:bg-slate-50"
          >
            <Icon name="refresh" className="h-4 w-4" />
            Refresh
          </button>
        }
      />

      {error && (
        <p role="alert" className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
          <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
          Wallet sync issue: {error}
        </p>
      )}

      {/* Summary tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[2fr_2fr_3fr]">
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Credit Limit</p>
          <p className="mt-1 font-mono text-3xl font-bold text-slate-900">{formatPeso(totals.creditLimit)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Available Limit</p>
          <p className="mt-1 font-mono text-3xl font-bold text-emerald-600">{formatPeso(totals.availableLimit)}</p>
        </Card>
        <Card className="hidden p-5 lg:block">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cards · Bills</p>
          <p className="mt-1 font-mono text-3xl font-bold text-navy-800">
            {cards.length} · {bills.length}
          </p>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
        {/* LEFT: tabs */}
        <div className="min-w-0">
          <div className="mb-4 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
            {TABS.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150 ${
                  tab === key ? 'bg-white text-navy-700 shadow-sm' : 'cursor-pointer text-slate-500 hover:text-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {loading ? (
            <Card><EmptyState icon="clock" title="Loading wallet…" /></Card>
          ) : tab === 'cards' ? (
            <MyCards
              cards={cards}
              selected={selected}
              setSelectedId={setSelectedId}
              onAdd={() => setCardModal({ initial: null })}
              onEdit={(c) => setCardModal({ initial: c })}
              onDelete={(id) => setConfirmDelete(id)}
            />
          ) : tab === 'bills' ? (
            <BillTracker cards={cards} bills={bills} payments={payments} wallet={wallet} />
          ) : (
            <WalletAnalytics cards={cards} bills={bills} payments={payments} />
          )}
        </div>

        {/* RIGHT: cards on file */}
        <Card className="self-start">
          <CardHeader title="Cards on File" />
          {cards.length === 0 ? (
            <EmptyState icon="wallet" title="No cards yet" body="Add a card to get started." />
          ) : (
            // Dynamic height — grows to fit every card, no inner scrollbar. Hover
            // a row to reveal ▲/▼ reorder controls (kept in sync with the stack).
            <ul className="space-y-2 p-3">
              {cards.map((c, i) => (
                <li key={c.id} className="group relative">
                  <div
                    className={`flex items-center gap-2 rounded-xl border p-3 transition-colors duration-150 ${
                      selected?.id === c.id ? 'border-navy-300 bg-navy-50/50' : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <button
                      onClick={() => {
                        setSelectedId(c.id)
                        setTab('cards')
                      }}
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
                    >
                      <MiniCard card={c} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">{c.bankName} •••• {c.last4}</p>
                        <p className="truncate text-xs text-slate-500">{c.network} {c.tier}</p>
                      </div>
                      <div className="shrink-0 text-right text-[11px] leading-tight">
                        <p className="text-slate-500">Limit: {formatPeso(c.creditLimit)}</p>
                        <p className="font-semibold text-emerald-600">Avail: {formatPeso(c.availableLimit)}</p>
                      </div>
                    </button>
                    <div className="flex shrink-0 flex-col gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                      <button
                        onClick={() => wallet.moveCard(c.id, 'up')}
                        disabled={i === 0}
                        aria-label="Move card up"
                        className="flex h-5 w-5 cursor-pointer items-center justify-center rounded text-xs text-slate-400 transition-colors hover:bg-slate-100 hover:text-navy-700 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => wallet.moveCard(c.id, 'down')}
                        disabled={i === cards.length - 1}
                        aria-label="Move card down"
                        className="flex h-5 w-5 cursor-pointer items-center justify-center rounded text-xs text-slate-400 transition-colors hover:bg-slate-100 hover:text-navy-700 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                      >
                        ▼
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {cardModal && (
        <CardForm
          key={cardModal.initial?.id ?? 'new'}
          open
          initial={cardModal.initial}
          onClose={() => setCardModal(null)}
          onSave={async (data) => {
            if (cardModal.initial) return await wallet.updateCard(cardModal.initial.id, data)
            const res = await wallet.addCard(data)
            if (res?.error) return res.error
            if (res?.card) setSelectedId(res.card.id)
            return null
          }}
        />
      )}

      <Modal
        open={!!confirmDelete}
        title="Delete card?"
        onClose={() => setConfirmDelete(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="danger" onClick={async () => { await wallet.deleteCard(confirmDelete); setConfirmDelete(null); setSelectedId(null) }}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">This permanently removes the card and all of its bills and payments.</p>
      </Modal>
    </>
  )
}

function MyCards({ cards, selected, setSelectedId, onAdd, onEdit, onDelete }) {
  if (cards.length === 0) {
    return (
      <Card>
        <EmptyState icon="wallet" title="No cards yet" body="Add your first card to build your wallet." />
        <div className="flex justify-center pb-5">
          <Button onClick={onAdd}>+ Add New Card</Button>
        </div>
      </Card>
    )
  }
  const n = cards.length
  const activeIndex = Math.max(0, cards.findIndex((c) => c.id === selected?.id))
  // Custom circular index: wraps past either end (infinite loop).
  const go = (i) => setSelectedId(cards[((i % n) + n) % n].id)

  return (
    <div className="space-y-5">
      {/* Coverflow — 3D tilted carousel, no scrollbar. Each card's signed
          circular offset from the active card drives a perspective rotateY +
          depth + scale. Click a side card (or a nav arrow) to bring it center. */}
      <div className="relative h-[280px] select-none" style={{ perspective: '1300px' }}>
        {cards.map((c, i) => {
          let off = i - activeIndex
          if (off > n / 2) off -= n
          if (off < -n / 2) off += n
          const abs = Math.abs(off)
          const hidden = abs > 2
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => go(i)}
              aria-label={`Show ${c.bankName} card`}
              className="absolute left-1/2 top-1/2 w-72 cursor-pointer transition-all duration-500 ease-[cubic-bezier(0.25,0.8,0.3,1)]"
              style={{
                transform: `translate(-50%, -50%) translateX(${off * 132}px) translateZ(${-abs * 90}px) rotateY(${off * -38}deg) scale(${1 - abs * 0.05})`,
                zIndex: 100 - abs,
                opacity: hidden ? 0 : 1 - abs * 0.18,
                pointerEvents: hidden ? 'none' : 'auto',
                filter: off === 0 ? 'none' : 'brightness(0.82)',
              }}
            >
              <CardVisual card={c} className={off === 0 ? 'shadow-2xl ring-1 ring-black/10' : 'shadow-xl'} />
            </button>
          )
        })}
        {n > 1 && (
          <>
            <NavArrow side="left" onClick={() => go(activeIndex - 1)} />
            <NavArrow side="right" onClick={() => go(activeIndex + 1)} />
          </>
        )}
      </div>

      {selected && <CardDetail card={selected} onEdit={onEdit} onDelete={onDelete} />}

      <div className="flex justify-center">
        <Button onClick={onAdd}>+ Add New Card</Button>
      </div>
    </div>
  )
}

// Apple-like frosted-glass navigation arrow.
function NavArrow({ side, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === 'left' ? 'Previous card' : 'Next card'}
      className={`absolute top-1/2 z-[200] flex h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-white/60 bg-white/30 text-slate-700 shadow-lg backdrop-blur-md transition-all duration-200 hover:bg-white/70 active:scale-95 ${
        side === 'left' ? 'left-1 sm:left-2' : 'right-1 sm:right-2'
      }`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d={side === 'left' ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} />
      </svg>
    </button>
  )
}

function CardDetail({ card, onEdit, onDelete }) {
  return (
    <Card className="overflow-hidden">
      {/* Flush edge-to-edge banner. Gradient flows "to left" so the primary
          color sits at the right, giving high contrast behind the bank logo. */}
      <div
        className="flex items-center justify-between gap-3 px-5 py-4"
        style={{
          background: `linear-gradient(to left, ${card.primaryColor}, ${card.secondaryColor})`,
          color: readable(card.secondaryColor),
        }}
      >
        <h2 className="min-w-0 truncate text-lg font-bold">
          {[card.bankName, card.category, card.network, card.tier].filter(Boolean).join(' ')} (•• {card.last4})
        </h2>
        {card.bankLogo ? (
          <img src={card.bankLogo} alt={card.bankName} className="h-8 max-w-[28%] shrink-0 object-contain object-right" />
        ) : (
          <span className="shrink-0 text-base font-bold" style={{ color: readable(card.primaryColor) }}>
            {card.bankName}
          </span>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 px-5 py-5">
        <Detail label="Credit Limit" value={formatPeso(card.creditLimit)} />
        <Detail label="Available Limit" value={formatPeso(card.availableLimit)} valueClass="text-emerald-600" />
        <Detail label="Card Tier" value={card.tier} />
        <Detail label="Network" value={card.network} />
        {card.category ? <Detail label="Card Category" value={card.category} /> : null}
        <Detail label="Statement Date" value={card.statementDate || '—'} />
        <Detail label="Due Date" value={card.dueDate || '—'} />
        {card.naffl ? (
          <Detail label="Annual Membership Fee" value="Waived for Life" valueClass="text-emerald-600" />
        ) : (
          <>
            <Detail label="Annual Membership Fee" value={formatPeso(card.amf)} />
            <Detail label="Anniversary Date" value={card.amfDate ? formatDate(card.amfDate) : '—'} />
          </>
        )}
      </dl>
      <div className="flex flex-wrap gap-2 border-t border-slate-100 px-5 py-4">
        <Button variant="secondary" onClick={() => onEdit(card)}>Edit Card</Button>
        <Button variant="danger" onClick={() => onDelete(card.id)}>Delete Card</Button>
      </div>
    </Card>
  )
}

function Detail({ label, value, valueClass = 'text-slate-900' }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className={`mt-0.5 font-semibold ${valueClass}`}>{value}</dd>
    </div>
  )
}
