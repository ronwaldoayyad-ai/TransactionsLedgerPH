import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { PageHeader } from '../../components/AppShell'
import { Badge, Button, Card, CardHeader } from '../../components/ui'
import Icon from '../../components/Icon'
import { formatDate, toISODate } from '../../lib/amortization'
import { effectiveStatus, isReceivable } from '../../lib/transactions'
import { NextPaymentDueCard, PaymentDueBreakdown } from '../../components/PaymentDueSummary'

// How many upcoming due dates to surface, to keep the picker from crowding.
const UPCOMING_LIMIT = 5

// Small labelled checkbox row used by both the borrower and due-date pickers.
function CheckRow({ checked, onChange, children, trailing }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition-colors duration-150 hover:bg-navy-50/60">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 text-navy-700 focus:ring-navy-600"
      />
      <span className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium text-slate-800">
        {children}
      </span>
      {trailing}
    </label>
  )
}

function SelectionCount({ n }) {
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
      {n} selected
    </span>
  )
}

export default function PaymentDue() {
  const { users, transactions, paymentDueConfig, setPaymentDueOverride, clearPaymentDueOverride } =
    useApp()
  const config = paymentDueConfig
  const today = toISODate(new Date())

  // Borrowers = general users. Sorted by name for a stable, scannable list.
  const borrowers = useMemo(
    () =>
      users
        .filter((u) => u.role === 'user')
        .sort((a, b) => a.name.localeCompare(b.name)),
    [users],
  )

  // Every receivable installment (past due or upcoming — paid/refunded/
  // cancelled excluded), which is the universe both pickers draw from.
  const receivable = useMemo(
    () => transactions.filter((t) => isReceivable(t, today)),
    [transactions, today],
  )

  const countByBorrower = useMemo(() => {
    const m = new Map()
    for (const t of receivable) m.set(t.userId, (m.get(t.userId) ?? 0) + 1)
    return m
  }, [receivable])

  // Only borrowers who actually have money outstanding are worth selecting.
  const activeBorrowers = useMemo(
    () => borrowers.filter((b) => (countByBorrower.get(b.id) ?? 0) > 0),
    [borrowers, countByBorrower],
  )

  // Valid due dates for a given set of borrowers: every past-due date plus the
  // next five upcoming dates, each tagged. Pure — reused by the picker and by
  // the handlers that prune stale selections when the borrower set changes.
  const validDatesFor = (borrowerSet) => {
    const map = new Map() // date -> 'past_due' | 'upcoming'
    for (const t of receivable) {
      if (!borrowerSet.has(t.userId)) continue
      map.set(t.dueDate, effectiveStatus(t, today) === 'past_due' ? 'past_due' : 'upcoming')
    }
    const all = [...map.entries()].map(([date, kind]) => ({ date, kind }))
    const pastDue = all
      .filter((d) => d.kind === 'past_due')
      .sort((a, b) => a.date.localeCompare(b.date))
    const upcoming = all
      .filter((d) => d.kind === 'upcoming')
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, UPCOMING_LIMIT)
    return [...pastDue, ...upcoming].sort((a, b) => a.date.localeCompare(b.date))
  }

  // --- Selection state -------------------------------------------------------
  // Seed once from data available at mount (synchronous in mock mode): an
  // applied override restores its own borrowers/dates; otherwise everything
  // starts selected, matching the "all borrowers and dates" default.
  const [selectedBorrowers, setSelectedBorrowers] = useState(() =>
    config && config.dueDates.length
      ? new Set(config.allBorrowers ? activeBorrowers.map((b) => b.id) : config.borrowerIds)
      : new Set(activeBorrowers.map((b) => b.id)),
  )
  const [selectedDates, setSelectedDates] = useState(() =>
    config && config.dueDates.length
      ? new Set(config.dueDates)
      : new Set(validDatesFor(new Set(activeBorrowers.map((b) => b.id))).map((d) => d.date)),
  )
  const [status, setStatus] = useState('')
  const [flash, setFlash] = useState(false)
  const [saving, setSaving] = useState(false)
  const flashTimer = useRef(null)

  // Due dates offered for the currently-selected borrowers.
  const dateOptions = useMemo(
    () => validDatesFor(selectedBorrowers),
    // validDatesFor closes over receivable/today, both in the dep list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [receivable, selectedBorrowers, today],
  )

  // Prune selected dates that a borrower-set change just removed. Called from
  // the borrower handlers (an event handler, not an effect).
  const pruneDatesFor = (borrowerSet) => {
    const valid = new Set(validDatesFor(borrowerSet).map((d) => d.date))
    setSelectedDates((prev) => {
      const next = new Set([...prev].filter((d) => valid.has(d)))
      return next.size === prev.size ? prev : next
    })
  }

  // --- Live preview ----------------------------------------------------------
  // The exact set of installments a targeted borrower would sum: selected
  // borrowers ∩ selected dates, receivable only.
  const previewItems = useMemo(
    () =>
      receivable.filter(
        (t) => selectedBorrowers.has(t.userId) && selectedDates.has(t.dueDate),
      ),
    [receivable, selectedBorrowers, selectedDates],
  )

  const summary = useMemo(() => {
    const pastDue = previewItems.filter((t) => effectiveStatus(t, today) === 'past_due')
    const upcoming = previewItems.filter((t) => effectiveStatus(t, today) !== 'past_due')
    const total = previewItems.reduce((s, t) => s + t.amount, 0)
    const pastDueTotal = pastDue.reduce((s, t) => s + t.amount, 0)
    const upcomingTotal = upcoming.reduce((s, t) => s + t.amount, 0)
    const nextDate = upcoming.reduce(
      (min, t) => (min == null || t.dueDate < min ? t.dueDate : min),
      null,
    )
    return {
      total,
      pastDueTotal,
      upcomingTotal,
      count: previewItems.length,
      pastDueCount: pastDue.length,
      upcomingCount: upcoming.length,
      nextDate,
    }
  }, [previewItems, today])

  // --- Actions ---------------------------------------------------------------
  const allBorrowersSelected =
    activeBorrowers.length > 0 && selectedBorrowers.size === activeBorrowers.length
  const allDatesSelected =
    dateOptions.length > 0 && selectedDates.size === dateOptions.length

  const toggleBorrower = (id, on) => {
    const next = new Set(selectedBorrowers)
    if (on) next.add(id)
    else next.delete(id)
    setSelectedBorrowers(next)
    pruneDatesFor(next)
    setStatus('Borrower selection updated')
  }

  const toggleAllBorrowers = () => {
    const next = allBorrowersSelected ? new Set() : new Set(activeBorrowers.map((b) => b.id))
    setSelectedBorrowers(next)
    pruneDatesFor(next)
    setStatus(allBorrowersSelected ? 'Cleared all borrowers' : 'Selected all borrowers')
  }

  const toggleDate = (date, on) => {
    setSelectedDates((prev) => {
      const next = new Set(prev)
      if (on) next.add(date)
      else next.delete(date)
      return next
    })
    setStatus('Due date selection updated')
  }

  const toggleAllDates = () => {
    setSelectedDates(allDatesSelected ? new Set() : new Set(dateOptions.map((d) => d.date)))
    setStatus(allDatesSelected ? 'Cleared all due dates' : 'Selected all due dates')
  }

  const triggerFlash = () => {
    setFlash(true)
    clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlash(false), 700)
  }
  useEffect(() => () => clearTimeout(flashTimer.current), [])

  const canApply = selectedBorrowers.size > 0 && selectedDates.size > 0

  const apply = async () => {
    if (!canApply || saving) return
    setSaving(true)
    setStatus('Saving…')
    const ok = await setPaymentDueOverride({
      allBorrowers: allBorrowersSelected,
      borrowerIds: [...selectedBorrowers],
      dueDates: [...selectedDates],
    })
    setSaving(false)
    if (!ok) {
      setStatus('Could not save — check the sync error above (a migration may be missing)')
      return
    }
    triggerFlash()
    const who = allBorrowersSelected
      ? 'all borrowers'
      : `${selectedBorrowers.size} borrower${selectedBorrowers.size === 1 ? '' : 's'}`
    setStatus(`Applied — ${who} will now see this summary`)
  }

  const reset = async () => {
    if (saving) return
    setSaving(true)
    const ok = await clearPaymentDueOverride()
    setSaving(false)
    const allIds = new Set(activeBorrowers.map((b) => b.id))
    setSelectedBorrowers(allIds)
    setSelectedDates(new Set(validDatesFor(allIds).map((d) => d.date)))
    triggerFlash()
    setStatus(
      ok
        ? 'Reset — reverted to all borrowers and default due dates'
        : 'Could not clear the override — check the sync error above',
    )
  }

  const overrideActive = !!config && config.dueDates.length > 0

  return (
    <>
      <PageHeader
        title="Payment Due"
        subtitle="Control how the borrower's Next Payment Due tile is calculated — by borrower and due date."
        action={
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Live · auto-sync
          </span>
        }
      />

      <div className="grid gap-6 xl:grid-cols-2">
        {/* -------------------- Left: selection controls -------------------- */}
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <Icon name="users" className="h-4 w-4 text-navy-700" />
                  Borrowers
                </span>
              }
              action={
                <button
                  type="button"
                  onClick={toggleAllBorrowers}
                  disabled={activeBorrowers.length === 0}
                  className="cursor-pointer text-sm font-medium text-navy-700 transition-colors duration-200 hover:text-navy-900 disabled:cursor-not-allowed disabled:text-slate-300"
                >
                  {allBorrowersSelected ? 'Clear all' : 'Select all'}
                </button>
              }
            />
            <div className="p-3">
              {activeBorrowers.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-slate-500">
                  No borrowers with outstanding installments.
                </p>
              ) : (
                <div className="grid gap-1 sm:grid-cols-2">
                  {activeBorrowers.map((b) => (
                    <CheckRow
                      key={b.id}
                      checked={selectedBorrowers.has(b.id)}
                      onChange={(on) => toggleBorrower(b.id, on)}
                      trailing={
                        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-slate-100 px-1.5 text-xs font-semibold text-slate-500">
                          {countByBorrower.get(b.id) ?? 0}
                        </span>
                      }
                    >
                      <span className="truncate">{b.name}</span>
                    </CheckRow>
                  ))}
                </div>
              )}
            </div>
            <div className="border-t border-slate-100 px-5 py-3">
              <SelectionCount n={selectedBorrowers.size} />
            </div>
          </Card>

          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <Icon name="clock" className="h-4 w-4 text-navy-700" />
                  Due Dates
                </span>
              }
              action={
                <button
                  type="button"
                  onClick={toggleAllDates}
                  disabled={dateOptions.length === 0}
                  className="cursor-pointer text-sm font-medium text-navy-700 transition-colors duration-200 hover:text-navy-900 disabled:cursor-not-allowed disabled:text-slate-300"
                >
                  {allDatesSelected ? 'Clear all' : 'Select all'}
                </button>
              }
            />
            <div className="p-3">
              {dateOptions.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-slate-500">
                  {selectedBorrowers.size === 0
                    ? 'Select one or more borrowers to see their due dates.'
                    : 'No past-due or upcoming dates for this selection.'}
                </p>
              ) : (
                <div className="grid gap-1 sm:grid-cols-2">
                  {dateOptions.map(({ date, kind }) => (
                    <CheckRow
                      key={date}
                      checked={selectedDates.has(date)}
                      onChange={(on) => toggleDate(date, on)}
                      trailing={
                        <Badge status={kind === 'past_due' ? 'past_due' : 'upcoming'}>
                          {kind === 'past_due' ? 'past due' : 'upcoming'}
                        </Badge>
                      }
                    >
                      <span className="truncate">{formatDate(date)}</span>
                    </CheckRow>
                  ))}
                </div>
              )}
            </div>
            <div className="border-t border-slate-100 px-5 py-3">
              <SelectionCount n={selectedDates.size} />
            </div>
          </Card>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={apply} disabled={!canApply || saving}>
              <Icon name="check" className="h-4 w-4" />
              {saving ? 'Saving…' : 'Apply Settings'}
            </Button>
            <Button variant="secondary" onClick={reset} disabled={saving}>
              <Icon name="refresh" className="h-4 w-4" />
              Reset
            </Button>
            {status && (
              <span className="inline-flex items-center gap-1.5 text-sm text-slate-500" role="status">
                <Icon name="refresh" className="h-3.5 w-3.5 text-slate-400" />
                {status}
              </span>
            )}
          </div>
        </div>

        {/* -------------------- Right: live preview -------------------- */}
        <div className="flex flex-col gap-6">
          <div>
            <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Icon name="file" className="h-4 w-4" />
              Borrower Preview
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white">
                <span className="h-1.5 w-1.5 rounded-full bg-white" />
                LIVE
              </span>
            </p>

            {/* The exact tile the borrower sees — shared component. */}
            <NextPaymentDueCard summary={summary} flash={flash} emptyText="No payments selected" />
          </div>

          <PaymentDueBreakdown
            summary={summary}
            flash={flash}
            borrowersTargeted={selectedBorrowers.size}
            footer={
              overrideActive ? (
                <span className="inline-flex items-center gap-1.5 text-emerald-700">
                  <Icon name="check" className="h-3.5 w-3.5" />
                  Override live for{' '}
                  {config.allBorrowers
                    ? 'all borrowers'
                    : `${config.borrowerIds.length} borrower${config.borrowerIds.length === 1 ? '' : 's'}`}{' '}
                  · applied {formatDate(config.appliedAt.slice(0, 10))}
                </span>
              ) : (
                <span>No override applied — borrowers see the default auto-calculation.</span>
              )
            }
          />
        </div>
      </div>
    </>
  )
}
