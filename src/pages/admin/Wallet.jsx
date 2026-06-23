import { useMemo, useState } from 'react'
import { useWallet } from '../../hooks/useWallet'
import { PageHeader } from '../../components/AppShell'
import Icon from '../../components/Icon'
import { Button, Card, CardHeader, EmptyState, Modal } from '../../components/ui'
import { CardVisual, MiniCard } from '../../components/wallet/CardVisual'
import CardForm from '../../components/wallet/CardForm'
import BillTracker from '../../components/wallet/BillTracker'
import WalletAnalytics from '../../components/wallet/WalletAnalytics'
import { formatPeso } from '../../lib/amortization'
import { portfolioTotals } from '../../lib/wallet'

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
            <ul className="max-h-[32rem] space-y-2 overflow-y-auto p-3">
              {cards.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => {
                      setSelectedId(c.id)
                      setTab('cards')
                    }}
                    className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors duration-150 ${
                      selected?.id === c.id ? 'border-navy-300 bg-navy-50/50' : 'cursor-pointer border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <MiniCard card={c} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{c.bankName} •••• {c.last4}</p>
                      <p className="truncate text-xs text-slate-500">{c.network} {c.tier}</p>
                    </div>
                    <div className="shrink-0 text-right text-xs">
                      <p className="text-slate-500">Limit: {formatPeso(c.creditLimit)}</p>
                      <p className="font-semibold text-emerald-600">Avail: {formatPeso(c.availableLimit)}</p>
                    </div>
                  </button>
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
            if (cardModal.initial) await wallet.updateCard(cardModal.initial.id, data)
            else {
              const c = await wallet.addCard(data)
              if (c) setSelectedId(c.id)
            }
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
  return (
    <div className="space-y-5">
      {/* Overlapping interactive stack */}
      <div className="flex justify-center overflow-x-auto px-4 py-8">
        <div className="flex">
          {cards.map((c, i) => {
            const active = selected?.id === c.id
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedId(c.id)}
                aria-label={`Select ${c.bankName} card`}
                className={`w-64 shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${i > 0 ? '-ml-40' : ''} ${
                  active ? '-translate-y-10 scale-105' : 'cursor-pointer hover:-translate-y-3'
                }`}
                style={{ zIndex: active ? 50 : i + 1 }}
              >
                <CardVisual card={c} />
              </button>
            )
          })}
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <Card>
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-lg font-bold text-slate-900">
              {selected.bankName} {selected.network} {selected.tier} (•• {selected.last4})
            </h2>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 px-5 py-5">
            <Detail label="Credit Limit" value={formatPeso(selected.creditLimit)} />
            <Detail label="Available Limit" value={formatPeso(selected.availableLimit)} valueClass="text-emerald-600" />
            <Detail label="Card Tier" value={selected.tier} />
            <Detail label="Network" value={selected.network} />
            {selected.category ? <Detail label="Card Category" value={selected.category} /> : null}
            <Detail label="Statement Date" value={selected.statementDate || '—'} />
            <Detail label="Due Date" value={selected.dueDate || '—'} />
          </dl>
          <div className="flex flex-wrap gap-2 border-t border-slate-100 px-5 py-4">
            <Button variant="secondary" onClick={() => onEdit(selected)}>Edit Card</Button>
            <Button variant="danger" onClick={() => onDelete(selected.id)}>Delete Card</Button>
          </div>
        </Card>
      )}

      <div className="flex justify-center">
        <Button onClick={onAdd}>+ Add New Card</Button>
      </div>
    </div>
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
