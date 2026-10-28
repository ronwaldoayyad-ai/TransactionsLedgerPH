import { useId, useMemo, useState } from 'react'
import { Button, CurrencyInput, EmptyState, Field, Modal, inputClass } from '../ui'
import { MiniCard } from './CardVisual'
import WalletDeck from './WalletDeck'
import { buildBillTrackerModel, defaultBillMonth } from '../../lib/billPresentation'

// Apple-like pill buttons, sized to match the urgency badge and status pill.
const PILL_BTN = 'rounded-full px-3 py-0.5 text-xs font-semibold transition-all duration-150 active:scale-[0.94] cursor-pointer'
const BILL_BTN = {
  pay: `${PILL_BTN} bg-emerald-500 text-white hover:bg-emerald-600`,
  edit: `${PILL_BTN} bg-slate-100 text-slate-700 hover:bg-slate-200`,
  delete: `${PILL_BTN} bg-red-50 text-red-600 hover:bg-red-100`,
}
import { formatDate, formatPeso, toISODate } from '../../lib/amortization'
import { accountMask, billState, urgencyBadge } from '../../lib/wallet'

const SUB_TABS = [
  ['pending', 'Pending'],
  ['past_due', 'Past Due'],
  ['paid', 'Paid'],
]
// Per-status colour coding for the sub-tabs (dot + active fill + count badge).
const SUB_COLOR = {
  pending: { dot: 'bg-blue-500', active: 'border-blue-300 bg-blue-50 text-blue-700', badge: 'bg-blue-100 text-blue-700' },
  past_due: { dot: 'bg-red-500', active: 'border-red-300 bg-red-50 text-red-700', badge: 'bg-red-100 text-red-700' },
  paid: { dot: 'bg-emerald-500', active: 'border-emerald-300 bg-emerald-50 text-emerald-700', badge: 'bg-emerald-100 text-emerald-700' },
}
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
  PAST_DUE: 'bg-red-50 text-red-700',
}

export default function BillTracker({ cards, accounts, bills, payments, wallet }) {
  const today = toISODate(new Date())
  const [sub, setSub] = useState('pending')
  const [billModal, setBillModal] = useState(null) // { initial } | null
  const [payFor, setPayFor] = useState(null) // bill | null
  const [confirmDelete, setConfirmDelete] = useState(null) // bill id

  const [view, setView] = useState('cards')
  const [expandedByStatus, setExpandedByStatus] = useState({})
  const model = useMemo(() => buildBillTrackerModel(bills, payments, today), [bills, payments, today])
  const cardsById = useMemo(() => new Map(cards.map(card => [card.id, card])), [cards])
  const groups = model.groups[sub]
  const initialMonth = defaultBillMonth(groups, today)
  const openMonths = expandedByStatus[sub] ?? (initialMonth ? [initialMonth] : [])
  const toggleMonth = key => setExpandedByStatus(previous => ({ ...previous, [sub]: openMonths.includes(key) ? openMonths.filter(month => month !== key) : [...openMonths, key] }))
  const changeAllMonths = open => setExpandedByStatus(previous => ({ ...previous, [sub]: open ? groups.map(group => group.key) : [] }))
  const onEdit = row => setBillModal({ initial: row.bill, payment: row.status === 'paid' ? row.lastPaid : null })

  return (
    <div className="wallet-bills space-y-4">
      <div className="wallet-bill-statuses grid grid-cols-3 gap-2" role="group" aria-label="Filter bills by status">
        {SUB_TABS.map(([key, label]) => (
          <button type="button" key={key} onClick={() => setSub(key)} aria-pressed={sub === key}
            className={`wallet-bill-filter rounded-xl border transition-colors duration-150 ${sub === key ? SUB_COLOR[key].active : 'cursor-pointer border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
            <span className="wallet-bill-filter-label"><span className={`h-2 w-2 shrink-0 rounded-full ${SUB_COLOR[key].dot}`} />{label}<span className={`rounded-full px-1.5 text-xs font-semibold ${SUB_COLOR[key].badge}`}>{model.summary[key].count}</span></span>
            <strong className="wallet-bill-filter-total">{formatPeso(model.summary[key].amount)}</strong>
            <span className="wallet-bill-filter-caption">{key === 'paid' ? 'Payments recorded' : 'Remaining due'}</span>
          </button>
        ))}
      </div>
      <p className="text-xs leading-relaxed text-slate-500">Grouped by bill due month. Pending and Past Due show unpaid balances; Paid shows payments on fully settled bills.</p>
      <div className="wallet-bill-toolbar">
        <div className="wallet-bill-view" role="group" aria-label="Bill view">
          {[['cards', 'Cards'], ['list', 'List']].map(([key, label]) => <button type="button" key={key} aria-pressed={view === key} onClick={() => setView(key)}>{label}</button>)}
        </div>
        <div className="wallet-bill-expand"><button type="button" disabled={!groups.length || groups.every(group => openMonths.includes(group.key))} onClick={() => changeAllMonths(true)}>Expand all</button><button type="button" disabled={!groups.some(group => openMonths.includes(group.key))} onClick={() => changeAllMonths(false)}>Collapse all</button></div>
      </div>
      {groups.length === 0 ? <EmptyState icon="check" title={`No ${SUB_TABS.find(([key]) => key === sub)[1].toLowerCase()} bills`} /> : (
        <div className="space-y-3">
          {groups.map(group => <BillMonth key={sub + '-' + group.key} group={group} expanded={openMonths.includes(group.key)} onToggle={() => toggleMonth(group.key)} view={view} cardsById={cardsById} today={today} onPay={setPayFor} onEdit={onEdit} onDelete={setConfirmDelete} />)}
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
          accounts={accounts}
          initial={billModal.initial}
          payment={billModal.payment}
          today={today}
          onClose={() => setBillModal(null)}
          onSave={async (data) => {
            if (billModal.initial) await wallet.updateBill(billModal.initial.id, data)
            else await wallet.addBill(data)
          }}
          onSavePayment={async (patch) => {
            if (billModal.payment) await wallet.updatePayment(billModal.payment.id, patch)
          }}
        />
      )}

      {payFor && (
        <PaymentModal
          key={payFor.id}
          accounts={accounts}
          remaining={billState(payFor, payments, today).remaining}
          today={today}
          onClose={() => setPayFor(null)}
          onPay={async (amount, paidOn, note, accountId) => {
            await wallet.payBill(payFor.id, { amount, paidOn, note, accountId })
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

function BillMonth({ group, expanded, onToggle, view, cardsById, today, onPay, onEdit, onDelete }) {
  const id = useId()
  const [activeBillId, setActiveBillId] = useState(null)
  const activeIndex = Math.max(0, group.rows.findIndex(row => row.id === activeBillId))
  const paid = group.rows[0].status === 'paid'
  const item = row => <BillItem row={row} card={cardsById.get(row.bill.cardId)} today={today} view={view} onPay={onPay} onEdit={onEdit} onDelete={onDelete} />
  return <section className="wallet-bill-month" data-bill-month={group.key}>
    <h3><button type="button" className="wallet-bill-month-toggle" id={id + '-toggle'} aria-expanded={expanded} aria-controls={id + '-content'} onClick={onToggle}>
      <span className="wallet-bill-month-title"><strong>{group.label}</strong><small>{group.rows.length} {group.rows.length === 1 ? 'bill' : 'bills'} · Due month</small></span>
      <span className="wallet-bill-month-amount"><strong>{formatPeso(group.summary.amount)}</strong><small>{paid ? 'Payments recorded' : 'Remaining due'}</small></span>
      <span aria-hidden="true" className="wallet-bill-chevron">{expanded ? '−' : '+'}</span>
    </button></h3>
    {expanded && <div id={id + '-content'} role="region" aria-labelledby={id + '-toggle'} className="wallet-bill-month-content">
      <dl className="wallet-bill-month-totals">
        <div><dt>Billed total</dt><dd>{formatPeso(group.summary.billed)}</dd></div>
        <div><dt>Payments recorded</dt><dd>{formatPeso(group.summary.paid)}</dd></div>
        <div><dt>Remaining due</dt><dd>{formatPeso(group.summary.remaining)}</dd></div>
      </dl>
      {view === 'cards' ? <WalletDeck items={group.rows} activeIndex={activeIndex} onSelect={index => setActiveBillId(group.rows[index].id)} renderItem={item} interactive label={group.label + ' bills'} hint={group.rows.length === 1 ? 'One bill in this month.' : 'Swipe left or right, or use the arrows to view each bill.'} /> : <div className="wallet-bill-list">{group.rows.map(row => <div key={row.id}>{item(row)}</div>)}</div>}
    </div>}
  </section>
}

function BillItem({ row, card, today, view, onPay, onEdit, onDelete }) {
  const { bill, paid, remaining, status, partial, lastPaid } = row
  const badge = urgencyBadge(bill, today)
  const pill = status === 'paid' ? 'PAID' : partial ? 'PARTIAL' : status === 'past_due' ? 'PAST_DUE' : 'PENDING'
  return <article className={`wallet-bill-item wallet-bill-item-${view} ${BORDER[status]} ${status === 'paid' ? 'is-paid' : ''}`} aria-label={`${card?.bankName || 'Card'} bill due ${formatDate(bill.dueDate)}`}>
    <header className="wallet-bill-item-header">
      {card && <MiniCard card={card} />}
      <div className="wallet-bill-identity"><strong>{card?.bankName || 'Card unavailable'}</strong><small>{card ? `${card.network} •••• ${card.last4}` : 'Original bill retained'}</small></div>
      <span className={`wallet-bill-pill ${PILL[pill]}`}>{pill.replace('_', ' ')}</span>
    </header>
    <div className="wallet-bill-hero"><span>{status === 'paid' ? 'Payments recorded' : 'Remaining due'}</span><strong>{formatPeso(status === 'paid' ? paid : remaining)}</strong></div>
    <div className="wallet-bill-due"><span>Due <strong>{formatDate(bill.dueDate)}</strong></span>{status !== 'paid' && <span className={`wallet-bill-urgency ${BADGE_TONE[badge.tone]}`}>{badge.label}</span>}</div>
    <dl className="wallet-bill-item-totals"><div><dt>Billed</dt><dd>{formatPeso(bill.amountDue)}</dd></div><div><dt>Paid</dt><dd>{formatPeso(paid)}</dd></div></dl>
    {lastPaid && <p className="wallet-bill-last-payment">Last payment · {formatDate(lastPaid.paidOn)}</p>}
    <footer className="wallet-bill-actions">
      {status !== 'paid' && <button type="button" className={BILL_BTN.pay} onClick={() => onPay(bill)}>Pay Bill</button>}
      <button type="button" className={BILL_BTN.edit} onClick={() => onEdit(row)}>Edit</button>
      <button type="button" className={BILL_BTN.delete} onClick={() => onDelete(bill.id)}>Delete</button>
    </footer>
  </article>
}

function BillForm({ cards, accounts = [], initial, payment = null, today, onClose, onSave, onSavePayment }) {
  const [cardId, setCardId] = useState(initial?.cardId ?? cards[0]?.id ?? '')
  const [amountDue, setAmountDue] = useState(initial?.amountDue ?? 0)
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? today)
  // When editing a paid bill, also edit its latest payment's source + note.
  const [accountId, setAccountId] = useState(payment?.accountId ?? '')
  const [note, setNote] = useState(payment?.note ?? '')
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
              if (payment) await onSavePayment({ note: note.trim(), accountId: accountId || null })
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
        {payment && (
          <>
            <Field
              label="Payment Account"
              htmlFor="wb-account"
              hint="Changing this refunds the old account and debits the new one."
            >
              <select id="wb-account" className={inputClass} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">None</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{accountMask(a)}</option>
                ))}
              </select>
            </Field>
            <Field label="Notes" htmlFor="wb-note">
              <textarea id="wb-note" rows={2} className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
            </Field>
          </>
        )}
      </div>
    </Modal>
  )
}

function PaymentModal({ accounts = [], remaining, today, onClose, onPay }) {
  const [mode, setMode] = useState('full') // full | partial
  const [amount, setAmount] = useState(remaining)
  const [paidOn, setPaidOn] = useState(today)
  const [note, setNote] = useState('')
  const [accountId, setAccountId] = useState('')
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
              await onPay(payAmount, paidOn, note.trim(), accountId || null)
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
        <Field
          label="Payment Account"
          htmlFor="wp-account"
          hint={accounts.length === 0 ? 'No accounts yet — add one in the Accounts tab.' : 'The amount is deducted from this account.'}
        >
          <select id="wp-account" className={inputClass} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">None</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{accountMask(a)}</option>
            ))}
          </select>
        </Field>
        <Field label="Notes" htmlFor="wp-note">
          <textarea
            id="wp-note"
            rows={2}
            className={inputClass}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional"
          />
        </Field>
      </div>
    </Modal>
  )
}
