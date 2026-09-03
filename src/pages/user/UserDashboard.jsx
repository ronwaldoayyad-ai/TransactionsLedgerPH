import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import { useNotifications } from '../../context/NotificationsContext'
import { PageHeader } from '../../components/AppShell'
import { Badge, Button, Card, CardHeader, EmptyState, PulseBadge, StatCard, Switch } from '../../components/ui'
import Icon from '../../components/Icon'
import PaymentList from '../../components/PaymentList'
import DuesOverview from '../../components/DuesOverview'
import SwipeCoverflow from '../../components/SwipeCoverflow'
import BorrowerScheduleTable from '../../components/BorrowerScheduleTable'
import RefreshButton from '../../components/RefreshButton'
import { NextPaymentDueCard, PaymentDueBreakdown, PaymentDueCardStack } from '../../components/PaymentDueSummary'
import { buildDueSummary } from '../../lib/paymentDueSummary'
import { usePersistedState } from '../../hooks/usePersistedState'
import { setPageEntry } from '../../lib/pageStateStore'
import { formatDate, formatPeso, toISODate } from '../../lib/amortization'
import { effectiveStatus } from '../../lib/transactions'
import { overrideForBorrower, rowForBorrower, PAYMENT_DUE_COLORS } from '../../lib/paymentDueConfig'

export default function UserDashboard() {
  const { session, loans, payments, transactions, paymentDueOverrides } = useApp()
  const { unreadCount } = useNotifications()
  const navigate = useNavigate()
  const [hidePaid, setHidePaid] = usePersistedState('dashboard.hidePaid', true)
  const myPayments = payments.filter((p) => p.userId === session.user.id)
  // Balances and progress derive from the shared transactions store, which the
  // admin updates from the Overall Transactions ledger.
  const myTxns = transactions.filter((t) => t.userId === session.user.id)
  // Receivable = anything still owed (not Paid / Refunded / Cancelled), across
  // both installments and straight transactions.
  const unpaidTxns = myTxns.filter((t) => !['paid', 'refunded', 'cancelled'].includes(t.status))

  // A loan whose ledger records were all deleted by the admin disappears from
  // the borrower's dashboard entirely. Straight transactions have no loan or
  // disclosure — they live in the Straight Transactions view, not here.
  const myLoans = loans.filter(
    (l) =>
      l.userId === session.user.id &&
      l.txnType !== 'straight' &&
      myTxns.some((t) => t.loanId === l.id),
  )

  const txnsFor = (loanId) => myTxns.filter((t) => t.loanId === loanId)
  // Loan list ordering: newest-first by Transaction Date (from the ledger,
  // falling back to the loan record).
  const loanTxnDate = (loan) => txnsFor(loan.id)[0]?.txnDate ?? loan.txnDate ?? ''
  const sortedLoans = [...myLoans].sort((a, b) => loanTxnDate(b).localeCompare(loanTxnDate(a)))
  const paidCountFor = (loanId) => txnsFor(loanId).filter((t) => t.status === 'paid').length
  const isFullyPaid = (loanId) => {
    const txns = txnsFor(loanId)
    return txns.length > 0 && txns.every((t) => t.status === 'paid')
  }
  // A loan is "settled" when none of its installments are still owed — paid,
  // refunded, and cancelled all count as settled for the hide toggle.
  const isSettled = (loanId) => {
    const txns = txnsFor(loanId)
    return txns.length > 0 && txns.every((t) => ['paid', 'refunded', 'cancelled'].includes(t.status))
  }
  // Optional toggle: hide loans whose installments are all paid/refunded/cancelled.
  const visibleLoans = hidePaid ? sortedLoans.filter((l) => !isSettled(l.id)) : sortedLoans

  const today = toISODate(new Date())

  // Per-loan status for the "Number of Loans" breakdown. Priority: any still-owed
  // installment makes the loan Active; otherwise the settled loan is classified
  // by its terminal installment statuses. Buckets are mutually exclusive and
  // sum to the total loan count.
  const loanCategory = (loanId) => {
    const txns = txnsFor(loanId)
    if (txns.length === 0) return 'active'
    if (txns.some((t) => ['unpaid', 'past_due'].includes(effectiveStatus(t, today)))) return 'active'
    if (txns.every((t) => t.status === 'paid')) return 'paid'
    if (txns.some((t) => t.status === 'refunded')) return 'refunded'
    if (txns.some((t) => t.status === 'cancelled')) return 'cancelled'
    return 'paid'
  }
  const loanStatusCounts = myLoans.reduce(
    (acc, l) => {
      acc[loanCategory(l.id)] += 1
      return acc
    },
    { paid: 0, active: 0, refunded: 0, cancelled: 0 },
  )

  const totalNetProceeds = myLoans.reduce((s, l) => s + l.disclosure.netProceeds, 0)
  const outstanding = unpaidTxns.reduce((s, t) => s + t.amount, 0)
  // Next Payment Due = every Past Due item plus the Unpaid items falling on the
  // next (earliest) upcoming due date — across installments and straight.
  //
  // Admin override: from the Payment Due page the admin can pin an exact set of
  // due dates for this borrower; when active, the tile sums only that borrower's
  // receivable installments landing on those dates instead of the default calc.
  const myOverride = overrideForBorrower(paymentDueOverrides, session.user.id)
  const overrideActive = !!myOverride
  const overrideDates = overrideActive ? new Set(myOverride.dueDates) : null

  const defaultPastDue = unpaidTxns.filter((t) => effectiveStatus(t, today) === 'past_due')
  const defaultUpcoming = unpaidTxns.filter((t) => effectiveStatus(t, today) === 'unpaid')
  const defaultNextDate = defaultUpcoming.reduce(
    (min, t) => (min == null || t.dueDate < min ? t.dueDate : min),
    null,
  )
  const nextDueItems = overrideActive
    ? unpaidTxns.filter((t) => overrideDates.has(t.dueDate))
    : [
        ...defaultPastDue,
        ...(defaultNextDate ? defaultUpcoming.filter((t) => t.dueDate === defaultNextDate) : []),
      ]
  // Summary consumed by the shared Next Payment Due card + breakdown (identical
  // to the admin Payment Due preview): totals, the selected due dates, and the
  // most recent one "to date" to highlight.
  const nextDueSummary = buildDueSummary(nextDueItems, today)

  // Next Payment Due card: admin-defined only (no default). Sums the borrower's
  // receivable installments on the admin's separate "next" due-date set. When
  // unset, the borrower sees just the Current card (no stack).
  const overrideRow = rowForBorrower(paymentDueOverrides, session.user.id)
  const nextCardDates = new Set(overrideRow?.nextDueDates ?? [])
  const hasNextCard = nextCardDates.size > 0
  const nextCardItems = hasNextCard ? unpaidTxns.filter((t) => nextCardDates.has(t.dueDate)) : []
  const nextCardSummary = buildDueSummary(nextCardItems, today)

  // Which card is in front (0 = Current, 1 = Next); drives the coupled breakdown.
  const [activeDueCard, setActiveDueCard] = useState(0)
  const activeIndex = hasNextCard ? activeDueCard : 0
  const activeSummary = activeIndex === 1 ? nextCardSummary : nextDueSummary
  // The individual transactions behind the active card, listed in full by the
  // Transactions Detailed Breakdown tile. Past due first, then by due date.
  const activeLabel = activeIndex === 1 ? 'Next' : 'Current'
  const activeAccent = activeIndex === 1 ? PAYMENT_DUE_COLORS.next : PAYMENT_DUE_COLORS.current
  const activeItems = [...(activeIndex === 1 ? nextCardItems : nextDueItems)].sort((a, b) => {
    const ap = effectiveStatus(a, today) === 'past_due' ? 0 : 1
    const bp = effectiveStatus(b, today) === 'past_due' ? 0 : 1
    return ap - bp || a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id)
  })

  // Totals split by transaction type (across all of the borrower's records).
  const straightTxns = myTxns.filter((t) => t.type === 'Straight')
  const installmentTxns = myTxns.filter((t) => t.type === 'Installment')
  const straightTotal = straightTxns.reduce((s, t) => s + t.amount, 0)
  const installmentTotal = installmentTxns.reduce((s, t) => s + t.amount, 0)

  // Clickable tiles: pre-seed the destination page's persisted filters (read on
  // mount by usePersistedState), then navigate.
  const goNextDue = () => {
    setPageEntry('consolidated.statusSel', new Set(['past_due', 'due', 'upcoming']))
    setPageEntry('consolidated.dueDateSel', new Set(nextDueItems.map((t) => t.dueDate)))
    setPageEntry('consolidated.typeSel', new Set())
    setPageEntry('consolidated.hideSettled', true)
    navigate('/portal/consolidated')
  }
  const goNextCard = () => {
    setPageEntry('consolidated.statusSel', new Set(['past_due', 'due', 'upcoming']))
    setPageEntry('consolidated.dueDateSel', new Set(nextCardItems.map((t) => t.dueDate)))
    setPageEntry('consolidated.typeSel', new Set())
    setPageEntry('consolidated.hideSettled', true)
    navigate('/portal/consolidated')
  }
  const goInstallments = () => {
    setPageEntry('consolidated.statusSel', new Set())
    setPageEntry('consolidated.dueDateSel', new Set())
    setPageEntry('consolidated.typeSel', new Set(['Installment']))
    setPageEntry('consolidated.hideSettled', false) // show all installments, including settled
    navigate('/portal/consolidated')
  }

  return (
    <>
      <PageHeader
        title={`Welcome back, ${session.user.name.split(' ')[0]}`}
        subtitle="Here is the latest on your loans and payments."
        action={
          <div className="flex flex-wrap gap-2">
            <Link to="/portal/invoices">
              <Button variant="secondary">
                <Icon name="file" className="h-4 w-4" />
                My Invoices
              </Button>
            </Link>
            <Link to="/portal/payment-logs">
              <Button variant="secondary">
                <Icon name="scroll" className="h-4 w-4" />
                Payment Logs
              </Button>
            </Link>
            <Link to="/portal/notifications" className="relative">
              <Button variant="secondary">
                <Icon name="bell" className="h-4 w-4" />
                Notifications
              </Button>
              {unreadCount > 0 && (
                <PulseBadge count={unreadCount} className="-right-1.5" ringClass="ring-white" />
              )}
            </Link>
            <RefreshButton />
          </div>
        }
      />

      {/* Featured: Current / Next Payment Due. When the admin has pinned a Next
          set, the two cards stack (swipe / arrow keys / dots to switch) and the
          Detailed Breakdown follows the active card. Otherwise just Current. */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {hasNextCard ? (
          <PaymentDueCardStack
            active={activeIndex}
            onSwitch={setActiveDueCard}
            cards={[
              {
                summary: nextDueSummary,
                title: 'Current Payment Due',
                bg: PAYMENT_DUE_COLORS.current,
                onClick: goNextDue,
                emptyText: 'No current payment due',
              },
              {
                summary: nextCardSummary,
                title: 'Next Payment Due',
                bg: PAYMENT_DUE_COLORS.next,
                onClick: goNextCard,
                emptyText: 'No next payment set',
              },
            ]}
          />
        ) : (
          <NextPaymentDueCard
            summary={nextDueSummary}
            onClick={goNextDue}
            highlight
            title="Current Payment Due"
            bg={PAYMENT_DUE_COLORS.current}
          />
        )}
        <PaymentDueBreakdown summary={activeSummary} label={activeLabel} accent={activeAccent} />
      </div>

      {/* Full list of the transactions behind the active card. The pill mirrors
          the Detailed Breakdown label so it's clear which selection is shown. */}
      <div className="mt-4">
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Icon name="list" className="h-4 w-4 text-navy-700" />
                Transactions Detailed Breakdown
                <span
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-600"
                  style={activeAccent ? { backgroundColor: activeAccent } : undefined}
                >
                  {activeLabel}
                </span>
              </span>
            }
            subtitle={`Every item making up the ${activeLabel} Payment Due total`}
          />
          {activeItems.length === 0 ? (
            <EmptyState
              icon="clock"
              title="No transactions to show"
              body={
                activeIndex === 1
                  ? 'Your administrator has not set a Next Payment Due yet.'
                  : 'You have no current payment due right now.'
              }
            />
          ) : (
            <BorrowerScheduleTable transactions={activeItems} showTxnDate />
          )}
        </Card>
      </div>

      {/* Dues Overview — interactive donut of the borrower's overall payment
          status, with per-loan drill-down and insight cards. */}
      {myLoans.length > 0 && (
        <div className="mt-4">
          <DuesOverview myTxns={myTxns} myLoans={myLoans} />
        </div>
      )}

      {/* Swipeable stat tiles — 3D coverflow (swipe / drag or tap a side card),
          contained in a card so the tilted neighbours don't spill off-screen. */}
      <Card className="mt-4 overflow-hidden">
        <CardHeader title="Summary" subtitle="Your transaction totals" />
        <div className="py-4">
          <SwipeCoverflow
            items={[
            {
              id: 'installments',
              icon: 'wallet',
              label: 'Total Installment Transactions',
              value: formatPeso(installmentTotal),
              hint: `${installmentTxns.length} installment${installmentTxns.length === 1 ? '' : 's'}`,
              accent: 'text-navy-800 bg-navy-50',
              onActivate: goInstallments,
            },
            {
              id: 'straight',
              icon: 'list',
              label: 'Total Straight Transactions',
              value: formatPeso(straightTotal),
              hint: `${straightTxns.length} item${straightTxns.length === 1 ? '' : 's'}`,
              accent: 'text-violet-700 bg-violet-50',
              onActivate: () => navigate('/portal/straight'),
            },
            {
              id: 'outstanding',
              icon: 'trendingUp',
              label: 'Outstanding Balance',
              value: formatPeso(outstanding),
              accent: 'text-gold-600 bg-amber-50',
            },
            {
              id: 'proceeds',
              icon: 'wallet',
              label: 'Net Proceeds Received',
              value: formatPeso(totalNetProceeds),
              hint: 'After fees & deductions',
            },
          ]}
          onActivate={(t) => t.onActivate?.()}
            renderItem={(t) => (
              <StatCard icon={t.icon} label={t.label} value={t.value} hint={t.hint} accent={t.accent} />
            )}
          />
        </div>
      </Card>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="p-5">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-600">Number of Loans</p>
              <p className="mt-1.5 font-mono text-2xl font-semibold text-slate-900">
                {myLoans.length}
              </p>
            </div>
            <span className="shrink-0 rounded-lg bg-navy-50 p-2.5 text-navy-800">
              <Icon name="scroll" className="h-5 w-5" />
            </span>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-slate-100 pt-3">
            {[
              { key: 'paid', label: 'Fully Paid', dot: 'bg-emerald-500', text: 'text-emerald-700' },
              { key: 'active', label: 'Active', dot: 'bg-sky-500', text: 'text-sky-700' },
              { key: 'refunded', label: 'Refunded', dot: 'bg-blue-500', text: 'text-blue-700' },
              { key: 'cancelled', label: 'Cancelled', dot: 'bg-teal-500', text: 'text-teal-700' },
            ].map((row) => (
              <div key={row.key} className="flex items-center justify-between gap-2">
                <dt className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span className={`h-1.5 w-1.5 rounded-full ${row.dot}`} />
                  {row.label}
                </dt>
                <dd
                  className={`font-mono text-xs font-semibold ${
                    loanStatusCounts[row.key] ? row.text : 'text-slate-400'
                  }`}
                >
                  {loanStatusCounts[row.key]}
                </dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="My Loan Schedules"
            subtitle="Read-only view of your active loans"
            action={
              myLoans.length > 0 && (
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                    <Switch
                      checked={hidePaid}
                      onChange={setHidePaid}
                      label={hidePaid ? 'Show all loans' : 'Hide fully paid, refunded, or cancelled loans'}
                    />
                    {hidePaid ? 'Show all transactions' : 'Hide fully paid/refunded/cancelled'}
                  </label>
                  <Link
                    to="/portal/consolidated"
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-navy-200 bg-navy-50 px-3 py-1.5 text-sm font-medium text-navy-800 transition-colors duration-200 hover:bg-navy-100"
                  >
                    <Icon name="list" className="h-4 w-4" />
                    Consolidated Transactions
                  </Link>
                </div>
              )
            }
          />
          {myLoans.length === 0 ? (
            <EmptyState
              title="No loans assigned yet"
              body="Your administrator will assign your loan schedule once finalized. It will appear here automatically."
            />
          ) : visibleLoans.length === 0 ? (
            <EmptyState
              icon="check"
              title="All loans settled"
              body="Every loan is paid, refunded, or cancelled. Turn off the toggle to see them again."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {visibleLoans.map((loan) => {
                const totalCount = txnsFor(loan.id).length
                const paidCount = paidCountFor(loan.id)
                const progress = Math.round((paidCount / totalCount) * 100)
                const fullyPaid = isFullyPaid(loan.id)
                return (
                  <li key={loan.id}>
                    <Link
                      to={`/portal/loans/${loan.id}`}
                      className={`block cursor-pointer px-5 py-4 transition-colors duration-200 ${
                        fullyPaid
                          ? 'border-l-4 border-emerald-500 bg-emerald-50/60 hover:bg-emerald-50'
                          : 'hover:bg-navy-50/50'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="flex items-center gap-2 font-semibold text-slate-900">
                            {loan.label}
                            {fullyPaid && (
                              <Badge status="paid">
                                <Icon name="check" className="h-3 w-3" />
                                Fully Paid
                              </Badge>
                            )}
                          </p>
                          <p className="text-xs text-slate-500">
                            Availed {formatDate(loanTxnDate(loan))} · {loan.id} ·{' '}
                            {loan.durationMonths} months ·{' '}
                            {(loan.monthlyRate * 100).toFixed(4)}% monthly add-on
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-sm font-semibold text-slate-900">
                            {formatPeso(loan.principal)}
                          </p>
                          <p className="text-xs text-slate-500">principal</p>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center gap-3">
                        <div
                          className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"
                          role="progressbar"
                          aria-valuenow={progress}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`${loan.label} repayment progress`}
                        >
                          <div
                            className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <span
                          className={`text-xs font-medium ${fullyPaid ? 'text-emerald-700' : 'text-slate-600'}`}
                        >
                          {paidCount}/{totalCount} paid
                        </span>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Recent Payments"
            subtitle="View and download your submitted proofs"
            action={
              <Link
                to="/portal/payments"
                className="cursor-pointer text-sm font-medium text-navy-700 transition-colors duration-200 hover:text-navy-900"
              >
                View all
              </Link>
            }
          />
          <PaymentList
            payments={myPayments}
            defaultTab="all"
            emptyBody="Your submitted proofs will appear here."
          />
        </Card>
      </div>
    </>
  )
}
