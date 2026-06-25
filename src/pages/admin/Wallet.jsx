import { useState } from 'react'
import { useWallet } from '../../hooks/useWallet'
import { PageHeader } from '../../components/AppShell'
import Icon from '../../components/Icon'
import { Button, Card, CardHeader, EmptyState, Modal } from '../../components/ui'
import { CardVisual, MiniCard } from '../../components/wallet/CardVisual'
import { AccountVisual, MiniAccount } from '../../components/wallet/AccountVisual'
import CardForm from '../../components/wallet/CardForm'
import AccountForm from '../../components/wallet/AccountForm'
import AccountTxnForm from '../../components/wallet/AccountTxnForm'
import BillTracker from '../../components/wallet/BillTracker'
import WalletAnalytics from '../../components/wallet/WalletAnalytics'
import { formatDate, formatPeso, toISODate } from '../../lib/amortization'
import { accountColors, accountMask, accountTotals, cardAgeLabel, portfolioTotals } from '../../lib/wallet'

// Black/white text for contrast against a banner color.
function readable(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
  if (!m) return '#ffffff'
  const n = parseInt(m[1], 16)
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return lum > 0.6 ? '#0f172a' : '#ffffff'
}

const TABS = [
  ['cards', 'Credit Cards'],
  ['accounts', 'Accounts'],
  ['bills', 'Bills Tracker'],
  ['analytics', 'Analytics'],
]

export default function Wallet() {
  const wallet = useWallet()
  const { cards, accounts, bills, payments, loading, error, reload } = wallet
  const [tab, setTab] = useState('cards')
  const [selectedId, setSelectedId] = useState(null)
  const [selectedAccountId, setSelectedAccountId] = useState(null)
  const [cardModal, setCardModal] = useState(null)
  const [accountModal, setAccountModal] = useState(null)
  const [txnModal, setTxnModal] = useState(null) // { kind, account } | null
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(null)

  const totals = portfolioTotals(cards)
  const accTotals = accountTotals(accounts, payments)
  const selected = cards.find((c) => c.id === selectedId) ?? cards[0] ?? null
  const selectedAccount = accounts.find((a) => a.id === selectedAccountId) ?? accounts[0] ?? null
  const isAccounts = tab === 'accounts'

  return (
    <>
      <PageHeader
        title="Cards & Bills Wallet"
        subtitle="Track your cards, accounts, bills, and payments. Private to your account."
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
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cards · Accounts · Bills</p>
          <p className="mt-1 font-mono text-3xl font-bold text-navy-800">
            {cards.length} · {accounts.length} · {bills.length}
          </p>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Available Balance</p>
          <p className="mt-1 font-mono text-3xl font-bold text-emerald-600">{formatPeso(accTotals.available)}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Deducted</p>
          <p className="mt-1 font-mono text-3xl font-bold text-red-600">{formatPeso(accTotals.deducted)}</p>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
        {/* LEFT: tabs */}
        <div className="min-w-0">
          <div className="mb-4 grid grid-cols-4 gap-1 rounded-xl bg-slate-100 p-1">
            {TABS.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`rounded-lg px-2 py-2 text-sm font-medium transition-colors duration-150 ${
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
          ) : tab === 'accounts' ? (
            <AccountsView
              accounts={accounts}
              selected={selectedAccount}
              setSelectedAccountId={setSelectedAccountId}
              onAdd={() => setAccountModal({ initial: null })}
              onEdit={(a) => setAccountModal({ initial: a })}
              onDelete={(id) => setConfirmDeleteAccount(id)}
              onAddTxn={(kind, account) => setTxnModal({ kind, account })}
            />
          ) : tab === 'bills' ? (
            <BillTracker cards={cards} accounts={accounts} bills={bills} payments={payments} wallet={wallet} />
          ) : (
            <WalletAnalytics cards={cards} accounts={accounts} bills={bills} payments={payments} />
          )}
        </div>

        {/* RIGHT: cards / accounts on file */}
        <Card className="self-start">
          <CardHeader title={isAccounts ? 'Accounts on File' : 'Cards on File'} />
          {isAccounts ? (
            accounts.length === 0 ? (
              <EmptyState icon="wallet" title="No accounts yet" body="Add an account to get started." />
            ) : (
              <OnFileList
                items={accounts}
                selectedId={selectedAccount?.id}
                onSelect={(a) => { setSelectedAccountId(a.id); setTab('accounts') }}
                onMove={wallet.moveAccount}
                thumb={(a) => <MiniAccount account={a} />}
                main={(a) => (
                  <>
                    <p className="truncate text-sm font-semibold text-slate-900">{accountMask(a)}</p>
                    <p className="truncate text-xs text-slate-500">{a.bankName} {a.productType}</p>
                  </>
                )}
                meta={(a) => (
                  <>
                    <p className="text-slate-500">Available</p>
                    <p className="font-semibold text-emerald-600">{formatPeso(a.availableBalance)}</p>
                  </>
                )}
              />
            )
          ) : cards.length === 0 ? (
            <EmptyState icon="wallet" title="No cards yet" body="Add a card to get started." />
          ) : (
            <OnFileList
              items={cards}
              selectedId={selected?.id}
              onSelect={(c) => { setSelectedId(c.id); setTab('cards') }}
              onMove={wallet.moveCard}
              thumb={(c) => <MiniCard card={c} />}
              main={(c) => (
                <>
                  <p className="truncate text-sm font-semibold text-slate-900">{c.bankName} •••• {c.last4}</p>
                  <p className="truncate text-xs text-slate-500">{c.network} {c.tier}</p>
                </>
              )}
              meta={(c) => (
                <>
                  <p className="text-slate-500">Limit: {formatPeso(c.creditLimit)}</p>
                  <p className="font-semibold text-emerald-600">Avail: {formatPeso(c.availableLimit)}</p>
                </>
              )}
            />
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

      {accountModal && (
        <AccountForm
          key={accountModal.initial?.id ?? 'new'}
          open
          initial={accountModal.initial}
          onClose={() => setAccountModal(null)}
          onSave={async (data) => {
            if (accountModal.initial) return await wallet.updateAccount(accountModal.initial.id, data)
            const res = await wallet.addAccount(data)
            if (res?.error) return res.error
            if (res?.account) setSelectedAccountId(res.account.id)
            return null
          }}
        />
      )}

      {txnModal && (
        <AccountTxnForm
          key={`${txnModal.kind}-${txnModal.account?.id}`}
          kind={txnModal.kind}
          accounts={accounts}
          defaultAccountId={txnModal.account?.id}
          today={toISODate(new Date())}
          onClose={() => setTxnModal(null)}
          onSave={(data) => wallet.addAccountTxn(data)}
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

      <Modal
        open={!!confirmDeleteAccount}
        title="Delete account?"
        onClose={() => setConfirmDeleteAccount(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDeleteAccount(null)}>Cancel</Button>
            <Button variant="danger" onClick={async () => { await wallet.deleteAccount(confirmDeleteAccount); setConfirmDeleteAccount(null); setSelectedAccountId(null) }}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">This permanently removes the account. Payments made from it are kept but their source account is cleared.</p>
      </Modal>
    </>
  )
}

// Shared Coverflow carousel: 3D tilted, no scrollbar, infinite loop, frosted
// nav arrows, click a side item to bring it center. onSelect receives the index.
function Coverflow({ items, activeIndex, onSelect, renderItem }) {
  const n = items.length
  const go = (i) => onSelect(((i % n) + n) % n)
  return (
    <div className="relative h-[280px] select-none" style={{ perspective: '1300px' }}>
      {items.map((it, i) => {
        let off = i - activeIndex
        if (off > n / 2) off -= n
        if (off < -n / 2) off += n
        const abs = Math.abs(off)
        const hidden = abs > 2
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => go(i)}
            aria-label="Select"
            className="absolute left-1/2 top-1/2 w-72 cursor-pointer transition-all duration-500 ease-[cubic-bezier(0.25,0.8,0.3,1)]"
            style={{
              transform: `translate(-50%, -50%) translateX(${off * 132}px) translateZ(${-abs * 90}px) rotateY(${off * -38}deg) scale(${1 - abs * 0.05})`,
              zIndex: 100 - abs,
              opacity: hidden ? 0 : 1 - abs * 0.18,
              pointerEvents: hidden ? 'none' : 'auto',
              filter: off === 0 ? 'none' : 'brightness(0.82)',
            }}
          >
            {renderItem(it, off === 0)}
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
  )
}

function MyCards({ cards, selected, setSelectedId, onAdd, onEdit, onDelete }) {
  if (cards.length === 0) {
    return (
      <Card>
        <EmptyState icon="wallet" title="No cards yet" body="Add your first card to build your wallet." />
        <div className="flex justify-center pb-5"><Button onClick={onAdd}>+ Add New Card</Button></div>
      </Card>
    )
  }
  const activeIndex = Math.max(0, cards.findIndex((c) => c.id === selected?.id))
  return (
    <div className="space-y-5">
      <Coverflow
        items={cards}
        activeIndex={activeIndex}
        onSelect={(i) => setSelectedId(cards[i].id)}
        renderItem={(c, active) => <CardVisual card={c} className={active ? 'shadow-2xl ring-1 ring-black/10' : 'shadow-xl'} />}
      />
      {selected && <CardDetail card={selected} onEdit={onEdit} onDelete={onDelete} />}
      <div className="flex justify-center"><Button onClick={onAdd}>+ Add New Card</Button></div>
    </div>
  )
}

function AccountsView({ accounts, selected, setSelectedAccountId, onAdd, onEdit, onDelete, onAddTxn }) {
  if (accounts.length === 0) {
    return (
      <Card>
        <EmptyState icon="wallet" title="No accounts yet" body="Add a deposit/source account to track balances and payments." />
        <div className="flex justify-center pb-5"><Button onClick={onAdd}>+ Add Account</Button></div>
      </Card>
    )
  }
  const activeIndex = Math.max(0, accounts.findIndex((a) => a.id === selected?.id))
  return (
    <div className="space-y-5">
      <Coverflow
        items={accounts}
        activeIndex={activeIndex}
        onSelect={(i) => setSelectedAccountId(accounts[i].id)}
        renderItem={(a, active) => <AccountVisual account={a} className={active ? 'shadow-2xl ring-1 ring-black/10' : 'shadow-xl'} />}
      />
      {selected && <AccountDetail account={selected} onEdit={onEdit} onDelete={onDelete} onAddTxn={onAddTxn} />}
      <div className="flex justify-center"><Button onClick={onAdd}>+ Add Account</Button></div>
    </div>
  )
}

// Apple-like frosted-glass navigation arrow.
function NavArrow({ side, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === 'left' ? 'Previous' : 'Next'}
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

// Reusable right-column list with hover ▲/▼ reorder.
function OnFileList({ items, selectedId, onSelect, onMove, thumb, main, meta }) {
  return (
    <ul className="space-y-2 p-3">
      {items.map((it, i) => (
        <li key={it.id} className="group relative">
          <div
            className={`flex items-center gap-2 rounded-xl border p-3 transition-colors duration-150 ${
              selectedId === it.id ? 'border-navy-300 bg-navy-50/50' : 'border-slate-200 hover:bg-slate-50'
            }`}
          >
            <button onClick={() => onSelect(it)} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left">
              {thumb(it)}
              <div className="min-w-0 flex-1">{main(it)}</div>
              <div className="shrink-0 text-right text-[11px] leading-tight">{meta(it)}</div>
            </button>
            <div className="flex shrink-0 flex-col gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
              <button onClick={() => onMove(it.id, 'up')} disabled={i === 0} aria-label="Move up" className="flex h-5 w-5 cursor-pointer items-center justify-center rounded text-xs text-slate-400 transition-colors hover:bg-slate-100 hover:text-navy-700 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent">▲</button>
              <button onClick={() => onMove(it.id, 'down')} disabled={i === items.length - 1} aria-label="Move down" className="flex h-5 w-5 cursor-pointer items-center justify-center rounded text-xs text-slate-400 transition-colors hover:bg-slate-100 hover:text-navy-700 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent">▼</button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}

function CardDetail({ card, onEdit, onDelete }) {
  return (
    <Card className="overflow-hidden">
      <div
        className="flex items-center justify-between gap-3 px-5 py-4"
        style={{ background: `linear-gradient(to left, ${card.primaryColor}, ${card.secondaryColor})`, color: readable(card.secondaryColor) }}
      >
        <h2 className="min-w-0 truncate text-lg font-bold">
          {[card.bankName, card.category, card.network, card.tier].filter(Boolean).join(' ')} (•• {card.last4})
        </h2>
        {card.bankLogo ? (
          <img src={card.bankLogo} alt={card.bankName} className="h-8 max-w-[28%] shrink-0 object-contain object-right" />
        ) : (
          <span className="shrink-0 text-base font-bold" style={{ color: readable(card.primaryColor) }}>{card.bankName}</span>
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
        <Detail label="Card Activation Date" value={card.activationDate ? formatDate(card.activationDate) : '—'} />
        <Detail label="Card Expiry Date" value={card.expiryDate ? formatDate(card.expiryDate) : '—'} />
        <Detail
          label="In Your Possession"
          value={card.activationDate ? cardAgeLabel(card.activationDate, toISODate(new Date())) : '—'}
          valueClass="text-navy-700"
        />
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

function AccountDetail({ account, onEdit, onDelete, onAddTxn }) {
  const [c1, c2] = accountColors(account.bankCode || account.bankName)
  return (
    <Card className="overflow-hidden">
      <div
        className="flex items-center justify-between gap-3 px-5 py-4"
        style={{ background: `linear-gradient(to left, ${c1}, ${c2})`, color: readable(c2) }}
      >
        <h2 className="min-w-0 truncate text-lg font-bold">
          {[account.bankName, account.productType].filter(Boolean).join(' ')} ({accountMask(account)})
        </h2>
        <span className="shrink-0 text-base font-bold" style={{ color: readable(c1) }}>{account.bankCode || account.bankName}</span>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 px-5 py-5">
        <Detail label="Account Number" value={account.accountNumber || '—'} />
        <Detail label="Product Type" value={account.productType || '—'} />
        <Detail label="Bank Name" value={account.bankName || '—'} />
        <Detail label="Bank Code" value={account.bankCode || '—'} />
        <Detail label="Swift Code" value={account.swiftCode || '—'} />
        <Detail label="Branch of Account" value={account.branch || '—'} />
        <Detail label="Ownership" value={account.ownership || '—'} />
        <Detail label="Debit Card Number" value={account.debitCardNumber || '—'} />
        <Detail label="Available Balance" value={formatPeso(account.availableBalance)} valueClass="text-emerald-600" />
        <Detail label="Maintaining Balance" value={formatPeso(account.maintainingBalance)} />
      </dl>
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-5 py-4">
        <Button variant="success" onClick={() => onAddTxn('income', account)}>
          <Icon name="plus" className="h-4 w-4" />Add Income
        </Button>
        <Button variant="secondary" onClick={() => onAddTxn('expense', account)}>
          <Icon name="plus" className="h-4 w-4" />Add Expense
        </Button>
        <span className="ml-auto flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => onEdit(account)}>Edit Account</Button>
          <Button variant="danger" onClick={() => onDelete(account.id)}>Delete Account</Button>
        </span>
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
