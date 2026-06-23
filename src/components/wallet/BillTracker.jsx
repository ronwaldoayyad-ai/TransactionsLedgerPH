import { useMemo, useState } from 'react'
import { Button, CurrencyInput, EmptyState, Field, Modal, inputClass } from '../ui'
import { MiniCard } from './CardVisual'
import { formatDate, formatPeso, toISODate } from '../../lib/amortization'
import { billState, urgencyBadge } from '../../lib/wallet'

const SUB_TABS = [
  ['pending', 'Pending'],
  ['past_due', 'Past Due'],
  ['paid', 'Paid'],
]
const BADGE_TONE = {
  blue: 'bg-blue-600 text-white',
  orange: 'bg-amber-500 text-white',
  red: 'bg-red-600 text-white',
}
const BORDER = { pending: 'border-l-blue-500', past_due: 'border-l-red-500', paid: 'border-l-emerald-500' }
const PILL = {
  PENDING: 'bg-blue-50 text-blue-700',
  PARTIAL: 'bg-amber-50 text-amber-700',
  PAID: 'bg-emerald-50 text-emerald-700',
}

export default function BillTracker({ cards, bills, payments, wallet }) {
  const today = toISODate(new Date())
  const [sub, setSub] = useState('pending')
  const [billModal, setBillModal] = useState(null) // { initial } | null
  const [payFor, setPayFor] = useState(null) // bill | null
  const [confirmDelete, setConfirmDelete] = useState(null) // bill id

  const cardOf = (id) => cards.find((c) => c.id === id)
  const cardLabel = (id) => {
    const c = cardOf(id)
    return c ? `${c.bankName} ${c.network} •••• ${c.last4}` : 'Card'
  }

  const enriched = useMemo(
    () => bills.map((b) => ({ bill: b, ...billState(b, payments, today) })),
    [bills, payments, today],
  )
  const counts = useMemo(
    () => ({
      pending: enriched.filter((e) => e.status === 'pending').length,
      past_due: enriched.filter((e) => e.status === 'past_due').length,
      paid: enriched.filter((e) => e.status === 'paid').length,
    }),
    [enriched],
  )
  const shown = enriched
    .filter((e) => e.status === sub)
    .sort((a, b) => a.bill.dueDate.localeCompare(b.bill.dueDate))

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="grid grid-cols-3 gap-2">
        {SUB_TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSub(key)}
            className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors duration-150 ${
              sub === key ? 'border-navy-300 bg-navy-50 text-navy-800' : 'cursor-pointer border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {label}
            <span className={`rounded-full px-1.5 text-xs font-semibold ${key === 'past_due' && counts[key] ? 'bg-red-100 text-red-700' : 'bg-slate-200 text-slate-600'}`}>
              {counts[key]}
            </span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState icon="check" title={`No ${SUB_TABS.find(([k]) => k === sub)[1].toLowerCase()} bills`} />
      ) : (
        <div className="space-y-3">
          {shown.map(({ bill, paid, remaining, status, partial }) => {
            const card = cardOf(bill.cardId)
            const badge = urgencyBadge(bill, today)
            const pill = status === 'paid' ? 'PAID' : partial ? 'PARTIAL' : 'PENDING'
            const lastPaid = payments
              .filter((p) => p.billId === bill.id)
              .sort((a, b) => String(b.paidOn).localeCompare(String(a.paidOn)))[0]
            return (
              <div key={bill.id} className={`rounded-xl border border-l-4 border-slate-200 bg-white p-4 ${BORDER[status]}`}>
                <div className="flex flex-wrap items-start gap-3">
                  {card && <MiniCard card={card} />}
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className={`font-bold ${status === 'past_due' ? 'text-red-600' : 'text-slate-900'}`}>
                        Due: {formatDate(bill.dueDate)}
                      </span>
                      {status !== 'paid' && (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${BADGE_TONE[badge.tone]}`}>{badge.label}</span>
                      )}
                    </p>
                    <p className="truncate text-xs text-slate-500">{cardLabel(bill.cardId)}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                      <span className="text-slate-500">Total: <span className="font-semibold text-slate-800">{formatPeso(bill.amountDue)}</span></span>
                      <span className="text-slate-500">
                        Paid: <span className="font-semibold text-slate-800">{formatPeso(paid)}</span>
                        {lastPaid && <span className="text-xs text-slate-400"> on {formatDate(lastPaid.paidOn)}</span>}
                      </span>
                      <span className="ml-auto text-slate-500">
                        Remaining: <span className={`font-semibold ${remaining > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{formatPeso(remaining)}</span>
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${PILL[pill]}`}>{pill}</span>
                    {status !== 'paid' && (
                      <Button variant="gold" className="!min-h-9 !px-3" onClick={() => setPayFor(bill)}>
                        Pay Bill
                      </Button>
                    )}
                    <Button variant="secondary" className="!min-h-9 !px-3" onClick={() => setBillModal({ initial: bill })}>
                      Edit
                    </Button>
                    <Button variant="danger" className="!min-h-9 !px-3" onClick={() => setConfirmDelete(bill.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex justify-center pt-1">
        <Button onClick={() => setBillModal({ initial: null })} disabled={cards.length === 0}>
          + Add New Bill
        </Button>
      </div>

      {billModal && (
        <BillForm
          key={billModal.initial?.id ?? 'new'}
          cards={cards}
          initial={billModal.initial}
          today={today}
          onClose={() => setBillModal(null)}
          onSave={async (data) => {
            if (billModal.initial) await wallet.updateBill(billModal.initial.id, data)
            else await wallet.addBill(data)
          }}
        />
      )}

      {payFor && (
        <PaymentModal
          key={payFor.id}
          bill={payFor}
          remaining={billState(payFor, payments, today).remaining}
          today={today}
          onClose={() => setPayFor(null)}
          onPay={async (amount, paidOn) => {
            await wallet.payBill(payFor.id, { amount, paidOn })
          }}
        />
      )}

      <Modal
        open={!!confirmDelete}
        title="Delete bill?"
        onClose={() => setConfirmDelete(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="danger" onClick={async () => { await wallet.deleteBill(confirmDelete); setConfirmDelete(null) }}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">This removes the bill and its logged payments. It does not adjust the card&apos;s available limit back.</p>
      </Modal>
    </div>
  )
}

function BillForm({ cards, initial, today, onClose, onSave }) {
  const [cardId, setCardId] = useState(initial?.cardId ?? cards[0]?.id ?? '')
  const [amountDue, setAmountDue] = useState(initial?.amountDue ?? 0)
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? today)
  const [saving, setSaving] = useState(false)
  const canSave = cardId && amountDue > 0 && dueDate

  return (
    <Modal
      open
      title={initial ? 'Edit Bill' : 'Add New Bill'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!canSave || saving}
            onClick={async () => {
              setSaving(true)
              await onSave({ cardId, amountDue, dueDate })
              setSaving(false)
              onClose()
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Card" htmlFor="wb-card">
          <select id="wb-card" className={inputClass} value={cardId} onChange={(e) => setCardId(e.target.value)}>
            {cards.map((c) => (
              <option key={c.id} value={c.id}>{c.bankName} {c.network} •••• {c.last4}</option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Amount Due (₱)" htmlFor="wb-amount">
            <CurrencyInput id="wb-amount" value={amountDue} onValueChange={(v) => setAmountDue(v ?? 0)} />
          </Field>
          <Field label="Due Date" htmlFor="wb-due">
            <input id="wb-due" type="date" className={inputClass} value={dueDate ?? ''} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  )
}

function PaymentModal({ remaining, today, onClose, onPay }) {
  const [mode, setMode] = useState('full') // full | partial
  const [amount, setAmount] = useState(remaining)
  const [paidOn, setPaidOn] = useState(today)
  const [saving, setSaving] = useState(false)
  const payAmount = mode === 'full' ? remaining : amount
  const canPay = payAmount > 0 && paidOn

  return (
    <Modal
      open
      title="Log Payment"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant="gold"
            disabled={!canPay || saving}
            onClick={async () => {
              setSaving(true)
              await onPay(payAmount, paidOn)
              setSaving(false)
              onClose()
            }}
          >
            {saving ? 'Saving…' : 'Confirm Payment'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">Remaining balance: <span className="font-mono font-semibold text-slate-900">{formatPeso(remaining)}</span></p>
        <div className="grid grid-cols-2 gap-2">
          {[['full', 'Full Payment'], ['partial', 'Partial Payment']].map(([m, label]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors duration-150 ${
                mode === m ? 'border-navy-300 bg-navy-50 text-navy-800' : 'cursor-pointer border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {mode === 'partial' && (
          <Field label="Amount (₱)" htmlFor="wp-amount">
            <CurrencyInput id="wp-amount" value={amount} onValueChange={(v) => setAmount(v ?? 0)} />
          </Field>
        )}
        <Field label="Payment Date" htmlFor="wp-date">
          <input id="wp-date" type="date" className={inputClass} value={paidOn ?? ''} onChange={(e) => setPaidOn(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
