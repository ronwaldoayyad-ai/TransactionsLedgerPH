import { useMemo, useRef, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { usePersistedState } from '../../hooks/usePersistedState'
import { PageHeader } from '../../components/AppShell'
import Icon from '../../components/Icon'
import RefreshButton from '../../components/RefreshButton'
import { Badge, Button, Card, CardHeader, EmptyState, Modal, MultiSelect, Switch, inputClass } from '../../components/ui'
import Pagination from '../../components/Pagination'
import { usePagination } from '../../hooks/usePagination'
import { downloadCSV, formatDate, formatPeso, toISODate } from '../../lib/amortization'
import { STATUS_LABELS, effectiveStatus } from '../../lib/transactions'
import { parseCSV, parseCSVAmount, parseCSVDate } from '../../lib/csv'

const IMPORT_HEADERS = ['Borrower', 'Txn Date', 'Item Description', 'Amount', 'Type', 'Due Date', 'Date Paid', 'Status']
// Loan-level columns (repeat per row; first non-empty value per loan wins).
// When present, the import creates a real loan per group so it appears in
// My Loan Schedules with a full Loan Disclosure Statement.
const LOAN_HEADERS = [
  'Principal Amount', 'Monthly Add-on Rate', 'Duration', 'First Payment Date',
  'DST', 'Processing Fee', 'Notarial Fee', 'Total Deductions', 'Net Proceeds',
]

const dateCellClass =
  'min-h-8 w-[7.2rem] cursor-pointer rounded-md border border-slate-200 bg-transparent px-1.5 py-1 text-[11px] text-slate-700 transition-colors duration-200 hover:border-slate-400 focus:border-navy-600 focus:outline-2 focus:outline-navy-600/20'

const descCellClass =
  'min-h-8 w-[11rem] cursor-text truncate rounded-md border border-slate-200 bg-transparent px-1.5 py-1 text-xs text-slate-700 transition-colors duration-200 hover:border-slate-400 focus:border-navy-600 focus:outline-2 focus:outline-navy-600/20'

// --- Find & Replace (Item Description) helpers ---------------------------
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Case transforms applied to each matched substring (or, when Find is empty,
// the whole description). Proper Case capitalizes after word separators but
// leaves apostrophes alone ("henry's" → "Henry's"); Sentence case capitalizes
// the first letter and any letter after sentence-ending punctuation.
const CASE_TRANSFORMS = {
  upper: (s) => s.toUpperCase(),
  lower: (s) => s.toLowerCase(),
  proper: (s) =>
    s.toLowerCase().replace(/(^|[\s\-/&(,.])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase()),
  sentence: (s) => {
    const lower = s.toLowerCase()
    return lower.replace(/(^\s*|[.!?]\s+)([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase())
  },
}

const REPLACE_MODES = [
  { value: 'text', label: 'Replace with text' },
  { value: 'upper', label: 'UPPERCASE' },
  { value: 'lower', label: 'lowercase' },
  { value: 'proper', label: 'Proper Case' },
  { value: 'sentence', label: 'Sentence case' },
]

// Compute the new description for one row, or null when nothing would change.
// With a Find term, the replacement/transform applies to each match; with an
// empty Find, a case transform applies to the entire description.
function computeReplacement(desc, { find, replace, mode, matchCase }) {
  if (!find) {
    if (mode === 'text') return null // nothing to find, nothing to replace
    const next = CASE_TRANSFORMS[mode](desc)
    return next !== desc ? next : null
  }
  let re
  try {
    re = new RegExp(escapeRegExp(find), matchCase ? 'g' : 'gi')
  } catch {
    return null
  }
  const next = desc.replace(re, (m) => (mode === 'text' ? replace : CASE_TRANSFORMS[mode](m)))
  return next !== desc ? next : null
}

// Overall Transactions ledger: every amortization installment across all
// borrowers, filterable, with editable dates and single/bulk status updates.
// Status written here is the same store the borrower views read from.
export default function Transactions() {
  const {
    users, transactions, setTransactionStatus, updateTransaction, archiveTransactions,
    replaceTransactionDescriptions, importTransactions, importLoans,
  } = useApp()
  const borrowers = users.filter((u) => u.role === 'user')
  const today = toISODate(new Date())

  // Filters & sort survive navigating to other sections (reset on Refresh).
  const [query, setQuery] = usePersistedState('txn.query', '')
  // Multi-select filters: empty set = no filter ("All").
  const [borrowerSel, setBorrowerSel] = usePersistedState('txn.borrowerSel', () => new Set())
  const [statusSel, setStatusSel] = usePersistedState('txn.statusSel', () => new Set())
  const [txnDateSel, setTxnDateSel] = usePersistedState('txn.txnDateSel', () => new Set())
  const [dueDateSel, setDueDateSel] = usePersistedState('txn.dueDateSel', () => new Set())
  const [datePaidSel, setDatePaidSel] = usePersistedState('txn.datePaidSel', () => new Set())
  // Type filter (Installment / Straight): surfaced in the mobile filter sheet;
  // empty set = all, so it's inert on desktop where no control exposes it.
  const [typeSel, setTypeSel] = usePersistedState('txn.typeSel', () => new Set())
  // Sorting applies after filtering, so it works on any filtered view.
  const [sortKey, setSortKey] = usePersistedState('txn.sortKey', 'dueDate') // dueDate | txnDate
  const [sortDir, setSortDir] = usePersistedState('txn.sortDir', 'asc')
  // Hide settled (Paid/Refunded/Cancelled) transactions when on. Default ON.
  const [hideSettled, setHideSettled] = usePersistedState('txn.hideSettled', true)
  const [selected, setSelected] = useState(() => new Set())
  const [bulkStatus, setBulkStatus] = useState('paid')
  // Mobile-only UI: a filter bottom sheet and a per-row status action sheet
  // (the desktop table's inline controls don't fit a phone width).
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [actionTxn, setActionTxn] = useState(null)
  const importInputRef = useRef(null)
  const [importPreview, setImportPreview] = useState(null) // { rows, errors }
  const [importing, setImporting] = useState(false)
  const [importNotice, setImportNotice] = useState('')
  // Find & Replace (Item Description). `frDeselected` holds ids the admin
  // unchecked in the preview, so "select all" is the default (empty set).
  const [frOpen, setFrOpen] = useState(false)
  const [frFind, setFrFind] = useState('')
  const [frReplace, setFrReplace] = useState('')
  const [frMode, setFrMode] = useState('text') // text | upper | lower | proper | sentence
  const [frMatchCase, setFrMatchCase] = useState(false)
  const [frScope, setFrScope] = useState('all') // all | filtered
  const [frDeselected, setFrDeselected] = useState(() => new Set())

  const nameOf = (userId) => users.find((u) => u.id === userId)?.name ?? userId

  const filtered = useMemo(
    () =>
      transactions
        .filter((t) => {
          if (hideSettled && ['paid', 'refunded', 'cancelled'].includes(t.status)) return false
          if (borrowerSel.size > 0 && !borrowerSel.has(t.userId)) return false
          if (statusSel.size > 0 && !statusSel.has(effectiveStatus(t, today))) return false
          if (typeSel.size > 0 && !typeSel.has(t.type)) return false
          if (txnDateSel.size > 0 && !txnDateSel.has(t.txnDate)) return false
          if (dueDateSel.size > 0 && !dueDateSel.has(t.dueDate)) return false
          if (datePaidSel.size > 0 && !datePaidSel.has(t.datePaid ?? '__none__')) return false
          if (query) {
            const haystack = `${nameOf(t.userId)} ${t.description} ${t.loanId}`.toLowerCase()
            if (!haystack.includes(query.toLowerCase())) return false
          }
          return true
        })
        .sort((a, b) => {
          const dir = sortDir === 'asc' ? 1 : -1
          return (
            (a[sortKey] ?? '').localeCompare(b[sortKey] ?? '') * dir || a.id.localeCompare(b.id)
          )
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nameOf derives from users
    [transactions, borrowerSel, statusSel, typeSel, txnDateSel, dueDateSel, datePaidSel, query, users, today, sortKey, sortDir, hideSettled],
  )

  // Distinct date options come from the full ledger, not the filtered view.
  const dateOptions = useMemo(() => {
    const collect = (get) =>
      [...new Set(transactions.map(get).filter(Boolean))]
        .sort()
        .map((d) => ({ value: d, label: formatDate(d) }))
    return {
      txn: collect((t) => t.txnDate),
      due: collect((t) => t.dueDate),
      paid: [
        { value: '__none__', label: '— not paid' },
        ...collect((t) => t.datePaid),
      ],
    }
  }, [transactions])

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('asc')
    }
  }
  const sortArrow = (key) => (sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '')

  // Live aggregate of the Amount column for whatever filters are applied.
  const filteredTotal = useMemo(() => filtered.reduce((s, t) => s + t.amount, 0), [filtered])

  // Mobile filter sheet is single-select per group, mapped onto the shared
  // multi-select Sets: one selection => a one-item Set, "All" => empty Set.
  // (A Set carrying a desktop multi-selection collapses to "All" here.)
  const activeFilterCount =
    borrowerSel.size + statusSel.size + typeSel.size +
    txnDateSel.size + dueDateSel.size + datePaidSel.size

  // Paginate the visible rows; select-all / totals still operate on the full
  // filtered set, so paging never changes what an action applies to.
  const pag = usePagination(filtered, 15)

  const filteredIds = filtered.map((t) => t.id)
  const allSelected = filtered.length > 0 && filteredIds.every((id) => selected.has(id))
  const selectedInView = filteredIds.filter((id) => selected.has(id))

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allSelected) filteredIds.forEach((id) => next.delete(id))
      else filteredIds.forEach((id) => next.add(id))
      return next
    })
  }

  const toggleOne = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const applyBulk = () => {
    setTransactionStatus(selectedInView, bulkStatus)
    setSelected(new Set())
  }

  const deleteSelected = () => {
    archiveTransactions(selectedInView)
    setSelected(new Set())
  }

  // --- CSV import: parse, match borrowers, validate, preview, then insert.
  const handleImportFile = async (file) => {
    if (!file) return
    const text = await file.text()
    const { headers, rows } = parseCSV(text)
    const col = (name) => headers.findIndex((h) => h.toLowerCase() === name.toLowerCase())
    const idx = {
      borrower: col('Borrower'),
      txnDate: col('Txn Date'),
      description: col('Item Description'),
      amount: col('Amount'),
      type: col('Type'),
      dueDate: col('Due Date'),
      datePaid: col('Date Paid'),
      status: col('Status'),
    }
    const missing = Object.entries(idx).filter(([, i]) => i < 0)
    if (missing.length > 0) {
      setImportPreview({
        rows: [],
        errors: [`Missing column header(s): ${missing.map(([k]) => k).join(', ')}. Expected: ${IMPORT_HEADERS.join(', ')}`],
      })
      return
    }

    // Loan-grouped mode when the loan-level columns are present.
    const loanIdx = Object.fromEntries(LOAN_HEADERS.map((h) => [h, col(h)]))
    const groupedMode = loanIdx['Principal Amount'] >= 0

    const statusKey = (v) => {
      const k = String(v ?? '').trim().toLowerCase().replace(/\s+/g, '_')
      return Object.keys(STATUS_LABELS).includes(k) ? k : null
    }
    // Strip a trailing "(n of N)" counter — tolerant of missing/extra spaces
    // ("(1 of 12)", "(13of 12)", "( 2 of 12 )") so the loan label is clean.
    const baseLabel = (desc) => desc.replace(/\s*\(\s*\d+\s*of\s*\d+\s*\)\s*$/i, '').trim()
    const stamp = Date.now()
    const valid = []
    const errors = []
    // Grouping keys off loan-column PRESENCE, not the description: a row that
    // carries a Principal Amount starts a new loan; rows with the loan columns
    // left blank attach to the loan opened above them (the template's "fill
    // loan fields on the first row only" convention). This is immune to
    // description typos and "(n of N)" formatting differences between rows.
    const loanGroups = []
    let current = null

    rows.forEach((cells, i) => {
      const rowNo = i + 2 // 1-based + header row
      const who = String(cells[idx.borrower] ?? '').trim().toLowerCase()
      const borrower = users.find(
        (u) => u.role === 'user' && (u.name.toLowerCase() === who || u.email.toLowerCase() === who),
      )
      if (!borrower) return errors.push(`Row ${rowNo}: no borrower matches "${cells[idx.borrower]}" (use the exact name or email)`)
      const amount = parseCSVAmount(cells[idx.amount])
      if (amount == null || amount < 0) return errors.push(`Row ${rowNo}: invalid amount "${cells[idx.amount]}"`)
      const txnDate = parseCSVDate(cells[idx.txnDate])
      if (!txnDate) return errors.push(`Row ${rowNo}: invalid Txn Date "${cells[idx.txnDate]}"`)
      const dueDate = parseCSVDate(cells[idx.dueDate])
      if (!dueDate) return errors.push(`Row ${rowNo}: invalid Due Date "${cells[idx.dueDate]}"`)
      const status = statusKey(cells[idx.status]) ?? 'unpaid'
      let datePaid = parseCSVDate(cells[idx.datePaid])
      // keep the date↔status pairing consistent (LGR-3/LGR-4)
      if (status === 'paid' && !datePaid) datePaid = dueDate
      if (['unpaid', 'cancelled', 'past_due'].includes(status)) datePaid = null
      const description = String(cells[idx.description] ?? '').trim() || 'Imported item'
      const isStraight = /straight/i.test(String(cells[idx.type] ?? ''))
      const row = {
        id: `imp-${stamp}-${i + 1}`,
        loanId: null,
        userId: borrower.id,
        n: i + 1,
        description,
        amount,
        type: isStraight ? 'Straight' : 'Installment',
        txnDate,
        dueDate,
        status,
        datePaid,
        archivedAt: null,
      }
      valid.push(row)
      if (!groupedMode) return

      const lv = (h) => String(cells[loanIdx[h]] ?? '').trim()
      const startsLoan = lv('Principal Amount') !== ''

      if (startsLoan) {
        const principal = parseCSVAmount(lv('Principal Amount'))
        if (principal == null || principal <= 0) {
          errors.push(`Row ${rowNo}: invalid Principal Amount "${cells[loanIdx['Principal Amount']]}" for loan "${baseLabel(description)}"`)
          current = null // rows below can't attach to an invalid loan
          return
        }
        const ratePct = parseCSVAmount(lv('Monthly Add-on Rate')) ?? 0
        const durationCol = Math.floor(Number(lv('Duration')))
        const netProceeds = parseCSVAmount(lv('Net Proceeds'))
        current = {
          loan: {
            userId: borrower.id,
            label: baseLabel(description) || 'Imported Loan',
            principal,
            monthlyRate: ratePct / 100,
            durationCol: Number.isInteger(durationCol) && durationCol > 0 ? durationCol : null,
            txnDate,
            firstPaymentDate: parseCSVDate(lv('First Payment Date')) ?? dueDate,
            dst: parseCSVAmount(lv('DST')) ?? 0,
            processingFee: parseCSVAmount(lv('Processing Fee')) ?? 0,
            notarialFee: parseCSVAmount(lv('Notarial Fee')) ?? 0,
            // Net Proceeds < principal ⇒ fees were deducted from proceeds.
            deductFromProceeds: netProceeds == null ? true : netProceeds < principal - 0.005,
            straight: isStraight,
          },
          rows: [],
        }
        loanGroups.push(current)
      }

      if (!current) {
        errors.push(`Row ${rowNo}: "${description}" has no loan to attach to — the loan's first row must include Principal Amount (and the other loan columns).`)
        return
      }
      // Sequential numbering within the loan guarantees a unique (loan, n).
      current.rows.push({ ...row, n: current.rows.length + 1 })
    })

    if (!groupedMode) {
      setImportPreview({ mode: 'records', rows: valid, groups: [], errors })
      return
    }

    // Finalize each group: duration defaults to the row count; straight loans
    // are single-payment. Build the final loan shape importLoans expects.
    const finalGroups = loanGroups.map((g) => {
      const { durationCol, straight, ...loanRest } = g.loan
      const isStraight = straight && g.rows.length === 1
      return {
        loan: {
          ...loanRest,
          txnType: isStraight ? 'straight' : 'installment',
          durationMonths: isStraight ? 1 : Math.min(Math.max(durationCol ?? g.rows.length, 1), 60),
        },
        rows: g.rows,
      }
    })
    setImportPreview({ mode: 'loans', rows: valid, groups: finalGroups, errors })
  }

  // Template pre-filled with real borrower names so rows match on import.
  // Includes the loan-level columns so imports create full loans with a
  // disclosure statement (values repeat on each row of the same loan).
  const downloadTemplate = () => {
    const borrowers = users.filter((u) => u.role === 'user')
    const name = (i) => borrowers[i % Math.max(borrowers.length, 1)]?.name ?? 'Juan Dela Cruz'
    const lines = [
      [...IMPORT_HEADERS, ...LOAN_HEADERS].join(','),
      `${name(0)},2026-01-01,"HENRY'S-FUJIFILM XA5 (1 of 3)","2,499.17",Installment,2026-06-10,2026-06-10,Paid,"7,200.00",1.8934,3,2026-06-10,54.00,150.00,0.00,204.00,"6,996.00"`,
      `${name(0)},2026-01-01,"HENRY'S-FUJIFILM XA5 (2 of 3)","2,499.17",Installment,2026-07-10,,Unpaid,,,,,,,,,`,
      `${name(0)},2026-01-01,"HENRY'S-FUJIFILM XA5 (3 of 3)","2,499.17",Installment,2026-08-10,,Unpaid,,,,,,,,,`,
      `${name(1)},2026-01-04,GRAB,"1,000.00",Straight,2026-02-10,2026-02-08,Paid,"1,000.00",0,1,2026-02-10,0.00,0.00,0.00,0.00,"1,000.00"`,
    ]
    downloadCSV('transactions-import-template.csv', lines.join('\n'))
  }

  const confirmImport = async () => {
    setImporting(true)
    const result =
      importPreview.mode === 'loans'
        ? await importLoans(importPreview.groups)
        : await importTransactions(importPreview.rows)
    setImporting(false)
    if (result.error) {
      setImportPreview((prev) => ({ ...prev, errors: [`Import failed: ${result.error}`, ...prev.errors] }))
      return
    }
    setImportNotice(
      importPreview.mode === 'loans'
        ? `${result.loanCount} loan${result.loanCount === 1 ? '' : 's'} with ${result.txnCount} installment${result.txnCount === 1 ? '' : 's'} imported.`
        : `${importPreview.rows.length} record${importPreview.rows.length === 1 ? '' : 's'} imported.`,
    )
    setImportPreview(null)
    setTimeout(() => setImportNotice(''), 6000)
  }

  const exportCSV = () => {
    const header = 'Borrower,Loan,Item Description,Txn Date,Amount,Type,Due Date,Date Paid,Status'
    const rows = filtered.map(
      (t) =>
        `"${nameOf(t.userId)}",${t.loanId ?? ''},"${t.description}",${t.txnDate},${t.amount.toFixed(2)},${t.type},${t.dueDate},${t.datePaid ?? ''},${STATUS_LABELS[effectiveStatus(t, today)]}`,
    )
    rows.push(`FILTERED TOTAL,,,,${filteredTotal.toFixed(2)},,,,`)
    downloadCSV(
      `overall-transactions-${today}.csv`,
      [header, ...rows].join('\n'),
    )
  }

  const statusCounts = useMemo(() => {
    const counts = {}
    filtered.forEach((t) => {
      const s = effectiveStatus(t, today)
      counts[s] = (counts[s] ?? 0) + 1
    })
    return counts
  }, [filtered, today])

  // --- Find & Replace: live preview over the chosen scope ------------------
  const openFindReplace = () => {
    setFrFind('')
    setFrReplace('')
    setFrMode('text')
    setFrMatchCase(false)
    setFrScope('all')
    setFrDeselected(new Set())
    setFrOpen(true)
  }

  // Rows whose Item Description would change under the current terms.
  const frMatches = useMemo(() => {
    if (!frOpen) return []
    const source = frScope === 'filtered' ? filtered : transactions
    const out = []
    for (const t of source) {
      const after = computeReplacement(t.description, {
        find: frFind.trim(),
        replace: frReplace,
        mode: frMode,
        matchCase: frMatchCase,
      })
      if (after != null) out.push({ id: t.id, userId: t.userId, before: t.description, after })
    }
    return out
  }, [frOpen, frFind, frReplace, frMode, frMatchCase, frScope, filtered, transactions])

  // A replacement that would blank the description is not applicable (the
  // ledger requires a non-empty item description).
  const frSelectable = frMatches.filter((m) => m.after.trim())
  const frApplicable = frSelectable.filter((m) => !frDeselected.has(m.id))
  const frEmptyCount = frMatches.length - frSelectable.length
  const frAllChecked = frSelectable.length > 0 && frApplicable.length === frSelectable.length

  const toggleFrOne = (id) =>
    setFrDeselected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const toggleFrAll = () =>
    setFrDeselected(() => (frAllChecked ? new Set(frSelectable.map((m) => m.id)) : new Set()))

  const applyFindReplace = () => {
    const n = replaceTransactionDescriptions(
      frApplicable.map((m) => ({ id: m.id, description: m.after })),
    )
    setFrOpen(false)
    setImportNotice(`Find & Replace updated ${n} item description${n === 1 ? '' : 's'}.`)
    setTimeout(() => setImportNotice(''), 6000)
  }

  return (
    <>
      <PageHeader
        title="Overall Transactions"
        subtitle="Every amortization installment across all borrowers. Status changes here update each borrower's dashboard instantly."
        action={
          <div className="flex flex-wrap gap-2">
            <RefreshButton />
            <input
              ref={importInputRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              aria-label="Import transactions from CSV"
              onChange={(e) => {
                handleImportFile(e.target.files[0])
                e.target.value = ''
              }}
            />
            <Button
              variant="secondary"
              onClick={openFindReplace}
              title="Find and replace text in item descriptions"
            >
              <Icon name="pencil" className="h-4 w-4" />
              Find & Replace
            </Button>
            <Button variant="secondary" onClick={downloadTemplate} title="Download a sample CSV with the expected columns">
              <Icon name="file" className="h-4 w-4" />
              Template
            </Button>
            <Button variant="secondary" onClick={() => importInputRef.current?.click()}>
              <Icon name="upload" className="h-4 w-4" />
              Import CSV
            </Button>
            <Button variant="gold" onClick={exportCSV} disabled={filtered.length === 0}>
              <Icon name="download" className="h-4 w-4" />
              Export CSV
            </Button>
          </div>
        }
      />

      {importNotice && (
        <p role="status" className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <Icon name="check" className="h-4 w-4 shrink-0" />
          {importNotice}
        </p>
      )}

      {/* Filters (multi-select: pick any combination; empty = all).
          relative z-20: backdrop-blur gives each Card its own stacking
          context, so this card must sit above the grid card below for the
          dropdown panels to overlay it. */}
      <Card className="relative z-20 mb-4 hidden p-4 md:block">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div>
            <label htmlFor="txn-search" className="mb-1 block text-xs font-medium text-slate-500">
              Search
            </label>
            <input
              id="txn-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Borrower or item…"
              className={inputClass}
            />
          </div>
          <div>
            <span className="mb-1 block text-xs font-medium text-slate-500">Borrower</span>
            <MultiSelect
              label="Borrower"
              options={borrowers.map((b) => ({ value: b.id, label: b.name }))}
              selected={borrowerSel}
              onChange={setBorrowerSel}
            />
          </div>
          <div>
            <span className="mb-1 block text-xs font-medium text-slate-500">Status</span>
            <MultiSelect
              label="Status"
              options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
              selected={statusSel}
              onChange={setStatusSel}
            />
          </div>
          <div>
            <span className="mb-1 block text-xs font-medium text-slate-500">Txn Date</span>
            <MultiSelect label="Txn Date" options={dateOptions.txn} selected={txnDateSel} onChange={setTxnDateSel} />
          </div>
          <div>
            <span className="mb-1 block text-xs font-medium text-slate-500">Due Date</span>
            <MultiSelect label="Due Date" options={dateOptions.due} selected={dueDateSel} onChange={setDueDateSel} />
          </div>
          <div>
            <span className="mb-1 block text-xs font-medium text-slate-500">Date Paid</span>
            <MultiSelect label="Date Paid" options={dateOptions.paid} selected={datePaidSel} onChange={setDatePaidSel} />
          </div>
        </div>
      </Card>

      {/* Bulk action bar */}
      {selectedInView.length > 0 && (
        <div className="mb-4 hidden flex-wrap items-center justify-between gap-3 rounded-xl border border-navy-200 bg-navy-50 px-4 py-3 md:flex">
          <p className="text-sm font-medium text-navy-900">
            {selectedInView.length} installment{selectedInView.length === 1 ? '' : 's'} selected
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="bulk-status" className="sr-only">
              Bulk status to apply
            </label>
            <select
              id="bulk-status"
              value={bulkStatus}
              onChange={(e) => setBulkStatus(e.target.value)}
              className={`${inputClass} !w-44`}
            >
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  Mark as {label}
                </option>
              ))}
            </select>
            <Button className="!min-h-9 !px-3" onClick={applyBulk}>
              <Icon name="check" className="h-4 w-4" />
              Apply
            </Button>
            <Button variant="danger" className="!min-h-9 !px-3" onClick={deleteSelected}>
              <Icon name="trash" className="h-4 w-4" />
              Delete (move to Archives)
            </Button>
          </div>
        </div>
      )}

      <Card>
        {/* Mobile toolbar: search + filter-sheet trigger, then record count
            and the hide-settled toggle (mirrors the mobile app's header). */}
        <div className="md:hidden">
          <div className="flex items-center gap-2 px-4 pt-4">
            <label htmlFor="txn-search-mobile" className="sr-only">
              Search transactions
            </label>
            <input
              id="txn-search-mobile"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search borrower or item…"
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              aria-label={`Filters${activeFilterCount ? ` (${activeFilterCount} active)` : ''}`}
              className="relative shrink-0 rounded-xl border border-slate-300 p-2.5 text-slate-500 transition-colors hover:bg-slate-100"
            >
              <Icon name="list" className="h-5 w-5" />
              {activeFilterCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-navy-800 px-1 text-[10px] font-semibold text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-xs text-slate-500">
              {filtered.length} record{filtered.length === 1 ? '' : 's'}
            </span>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-500">
              Hide settled
              <Switch
                checked={hideSettled}
                onChange={setHideSettled}
                label={hideSettled ? 'Show all transactions' : 'Hide paid, refunded, and cancelled transactions'}
              />
            </label>
          </div>
        </div>

        <div className="hidden md:block">
          <CardHeader
            title="All Transactions"
            subtitle={`${filtered.length} records · Amount total ${formatPeso(filteredTotal)}${Object.entries(statusCounts)
              .map(([s, c]) => ` · ${c} ${STATUS_LABELS[s].toLowerCase()}`)
              .join('')}`}
            action={
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                <Switch
                  checked={hideSettled}
                  onChange={setHideSettled}
                  label={hideSettled ? 'Show all transactions' : 'Hide paid, refunded, and cancelled transactions'}
                />
                {hideSettled ? 'Show all transactions' : 'Hide paid/refunded/cancelled'}
              </label>
            }
          />
        </div>
        {filtered.length === 0 ? (
          <EmptyState icon="scroll" title="No matching transactions" body="Adjust your filters or search." />
        ) : (
          <>
          {/* Mobile: tappable cards (mirrors the mobile app). Tap opens the
              status action sheet. Same paged slice as the desktop table. */}
          <div className="md:hidden">
            {pag.pageItems.map((t, idx) => {
              const eff = effectiveStatus(t, today)
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActionTxn(t)}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 active:bg-slate-100 ${
                    idx > 0 ? 'border-t border-slate-100' : 'border-t border-slate-200'
                  } ${
                    t.amount < 0 ? 'bg-emerald-50/50' : eff === 'past_due' ? 'bg-red-50/50' : ''
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-slate-900">{nameOf(t.userId)}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                      {t.description} · Due {formatDate(t.dueDate)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="font-mono text-[13px] font-semibold text-slate-900">{formatPeso(t.amount)}</span>
                    <Badge status={eff}>{STATUS_LABELS[eff]}</Badge>
                  </div>
                </button>
              )
            })}
            <div className="flex items-center justify-between border-t border-slate-200 bg-navy-50/70 px-4 py-3">
              <span className="text-xs font-semibold text-navy-900">
                FILTERED TOTAL ({filtered.length})
              </span>
              <span className="font-mono text-sm font-semibold text-navy-900">{formatPeso(filteredTotal)}</span>
            </div>
          </div>

          {/* Desktop / tablet: full editable table. */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[1060px] text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th scope="col" className="px-2.5 py-3">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Select all filtered transactions"
                      className="h-4 w-4 cursor-pointer accent-[#1e3a8a]"
                    />
                  </th>
                  <th scope="col" className="px-2.5 py-3">Borrower</th>
                  <th scope="col" className="px-2.5 py-3" aria-sort={sortKey === 'txnDate' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button
                      type="button"
                      onClick={() => toggleSort('txnDate')}
                      className="cursor-pointer font-semibold uppercase tracking-wide transition-colors duration-150 hover:text-navy-800"
                      title="Sort by Transaction Date"
                    >
                      Txn Date{sortArrow('txnDate')}
                    </button>
                  </th>
                  <th scope="col" className="px-2.5 py-3">Item Description</th>
                  <th scope="col" className="px-2.5 py-3 text-right">Amount</th>
                  <th scope="col" className="px-2.5 py-3">Type</th>
                  <th scope="col" className="px-2.5 py-3" aria-sort={sortKey === 'dueDate' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button
                      type="button"
                      onClick={() => toggleSort('dueDate')}
                      className="cursor-pointer font-semibold uppercase tracking-wide transition-colors duration-150 hover:text-navy-800"
                      title="Sort by Due Date"
                    >
                      Due Date{sortArrow('dueDate')}
                    </button>
                  </th>
                  <th scope="col" className="px-2.5 py-3">Date Paid</th>
                  <th scope="col" className="px-2.5 py-3">Status</th>
                  <th scope="col" className="px-2.5 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {pag.pageItems.map((t) => {
                  const effective = effectiveStatus(t, today)
                  const isPastDue = effective === 'past_due'
                  return (
                    <tr
                      key={t.id}
                      className={`border-b border-slate-100 transition-colors duration-150 ${
                        t.amount < 0
                          ? 'bg-emerald-50/70 hover:bg-emerald-50'
                          : isPastDue
                            ? 'bg-red-50/70 hover:bg-red-50'
                            : selected.has(t.id)
                              ? 'bg-navy-50/60 hover:bg-navy-50/40'
                              : 'hover:bg-navy-50/40'
                      }`}
                    >
                      <td className="px-2.5 py-2.5">
                        <input
                          type="checkbox"
                          checked={selected.has(t.id)}
                          onChange={() => toggleOne(t.id)}
                          aria-label={`Select ${t.description} for ${nameOf(t.userId)}`}
                          className="h-4 w-4 cursor-pointer accent-[#1e3a8a]"
                        />
                      </td>
                      <td className="max-w-[7.5rem] truncate px-2.5 py-2.5 font-medium text-slate-900" title={nameOf(t.userId)}>
                        {nameOf(t.userId)}
                      </td>
                      <td className="px-2.5 py-2.5">
                        <input
                          type="date"
                          value={t.txnDate}
                          onChange={(e) => updateTransaction(t.id, { txnDate: e.target.value })}
                          aria-label={`Transaction date for ${t.description}`}
                          className={dateCellClass}
                        />
                      </td>
                      <td className="px-2.5 py-2.5">
                        <DescriptionCell
                          txn={t}
                          onSave={(desc) => updateTransaction(t.id, { description: desc })}
                        />
                      </td>
                      <td className="px-2.5 py-2.5 text-right font-mono text-slate-900">
                        {formatPeso(t.amount)}
                      </td>
                      <td className="px-2.5 py-2.5 text-slate-600">{t.type}</td>
                      <td className="px-2.5 py-2.5">
                        <input
                          type="date"
                          value={t.dueDate}
                          onChange={(e) => updateTransaction(t.id, { dueDate: e.target.value })}
                          aria-label={`Due date for ${t.description}`}
                          className={dateCellClass}
                        />
                      </td>
                      <td className="px-2.5 py-2.5">
                        <input
                          type="date"
                          value={t.datePaid ?? ''}
                          onChange={(e) =>
                            updateTransaction(t.id, { datePaid: e.target.value || null })
                          }
                          aria-label={`Date paid for ${t.description}`}
                          className={dateCellClass}
                        />
                      </td>
                      <td className="px-2.5 py-2.5">
                        <Badge status={effective}>{STATUS_LABELS[effective]}</Badge>
                      </td>
                      <td className="px-2.5 py-2.5">
                        <label className="sr-only" htmlFor={`action-${t.id}`}>
                          Set status for {t.description}
                        </label>
                        <select
                          id={`action-${t.id}`}
                          value={t.status}
                          onChange={(e) => setTransactionStatus([t.id], e.target.value)}
                          className={`${inputClass} !min-h-8 !w-[6.8rem] !px-1.5 !py-1 !text-[11px]`}
                        >
                          {Object.entries(STATUS_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-navy-50/70 text-xs font-semibold text-navy-900">
                  <td className="px-2.5 py-3" colSpan={4}>
                    FILTERED TOTAL ({filtered.length} record{filtered.length === 1 ? '' : 's'})
                  </td>
                  <td className="px-2.5 py-3 text-right font-mono">{formatPeso(filteredTotal)}</td>
                  <td className="px-2.5 py-3" colSpan={5} />
                </tr>
              </tfoot>
            </table>
          </div>
          </>
        )}
        {filtered.length > 0 && (
          <Pagination
            page={pag.page}
            pageCount={pag.pageCount}
            pageSize={pag.pageSize}
            total={pag.total}
            start={pag.start}
            end={pag.end}
            onPageChange={pag.setPage}
            onPageSizeChange={pag.setPageSize}
            pageSizeOptions={[15, 25, 50, 100]}
            itemLabel="records"
          />
        )}
      </Card>

      {/* CSV import preview */}
      <Modal
        open={!!importPreview}
        title="Import transactions from CSV"
        onClose={() => setImportPreview(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setImportPreview(null)} disabled={importing}>
              Cancel
            </Button>
            <Button
              onClick={confirmImport}
              disabled={
                importing ||
                !importPreview ||
                (importPreview.mode === 'loans'
                  ? importPreview.groups.length === 0
                  : importPreview.rows.length === 0)
              }
            >
              <Icon name="upload" className="h-4 w-4" />
              {importing
                ? 'Importing…'
                : importPreview?.mode === 'loans'
                  ? `Import ${importPreview.groups.length} loan${importPreview.groups.length === 1 ? '' : 's'}`
                  : `Import ${importPreview?.rows.length ?? 0} record${importPreview?.rows.length === 1 ? '' : 's'}`}
            </Button>
          </>
        }
      >
        {importPreview && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Borrowers are matched by exact name or email.{' '}
              {importPreview.mode === 'loans'
                ? 'Loan columns detected — a row carrying a Principal Amount starts a new loan; the rows below it (with loan columns left blank) are its installments. Each loan gets a full Loan Disclosure Statement on the borrower’s dashboard, and amounts are imported verbatim.'
                : 'No loan columns found — records import as standalone ledger entries (visible in Consolidated Transactions, not in My Loan Schedules). Use the Template to include loan-level columns.'}
            </p>
            <p className="rounded-lg bg-navy-50 px-3 py-2.5 text-sm font-medium text-navy-900">
              {importPreview.mode === 'loans'
                ? `${importPreview.groups.length} loan${importPreview.groups.length === 1 ? '' : 's'} (${importPreview.groups.reduce((s, g) => s + g.rows.length, 0)} installment${importPreview.groups.reduce((s, g) => s + g.rows.length, 0) === 1 ? '' : 's'}) ready to import`
                : `${importPreview.rows.length} row${importPreview.rows.length === 1 ? '' : 's'} ready to import`}
              {importPreview.errors.length > 0 &&
                ` · ${importPreview.errors.length} issue${importPreview.errors.length === 1 ? '' : 's'}`}
            </p>
            {importPreview.mode === 'loans' && importPreview.groups.length > 0 && (
              <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-slate-600">
                {importPreview.groups.map((g, gi) => (
                  <li key={gi} className="truncate">
                    <span className="font-medium text-slate-800">{g.loan.label}</span> ·{' '}
                    {nameOf(g.loan.userId)} · {formatPeso(g.loan.principal)} ·{' '}
                    {g.rows.length} {g.loan.txnType === 'straight' ? 'payment' : 'installments'}
                  </li>
                ))}
              </ul>
            )}
            {importPreview.mode === 'records' && importPreview.rows.length > 0 && (
              <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-slate-600">
                {importPreview.rows.slice(0, 8).map((r) => (
                  <li key={r.id} className="truncate">
                    {nameOf(r.userId)} · {r.description} · {formatPeso(r.amount)} · due {r.dueDate} ·{' '}
                    {STATUS_LABELS[r.status]}
                  </li>
                ))}
                {importPreview.rows.length > 8 && (
                  <li className="text-slate-400">… and {importPreview.rows.length - 8} more</li>
                )}
              </ul>
            )}
            {importPreview.errors.length > 0 && (
              <ul className="max-h-32 space-y-1 overflow-y-auto rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                {importPreview.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Modal>

      {/* Find & Replace (Item Descriptions) */}
      <Modal
        open={frOpen}
        title="Find & Replace — Item Descriptions"
        onClose={() => setFrOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFrOpen(false)}>
              Cancel
            </Button>
            <Button onClick={applyFindReplace} disabled={frApplicable.length === 0}>
              <Icon name="check" className="h-4 w-4" />
              {frApplicable.length > 0 ? `Replace ${frApplicable.length}` : 'Replace'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="fr-find" className="mb-1 block text-xs font-medium text-slate-500">
                Find text
              </label>
              <input
                id="fr-find"
                type="text"
                value={frFind}
                onChange={(e) => setFrFind(e.target.value)}
                placeholder="e.g. gcash"
                className={inputClass}
                autoFocus
              />
            </div>
            <div>
              <label htmlFor="fr-mode" className="mb-1 block text-xs font-medium text-slate-500">
                Action
              </label>
              <select
                id="fr-mode"
                value={frMode}
                onChange={(e) => setFrMode(e.target.value)}
                className={inputClass}
              >
                {REPLACE_MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {frMode === 'text' ? (
            <div>
              <label htmlFor="fr-replace" className="mb-1 block text-xs font-medium text-slate-500">
                Replace with
              </label>
              <input
                id="fr-replace"
                type="text"
                value={frReplace}
                onChange={(e) => setFrReplace(e.target.value)}
                placeholder="Corrected text"
                className={inputClass}
              />
            </div>
          ) : (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              {frFind.trim()
                ? `Each match of “${frFind.trim()}” will be re-cased. Leave Find empty to re-case the whole description.`
                : 'Find is empty — the whole item description will be re-cased.'}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
              <Switch checked={frMatchCase} onChange={setFrMatchCase} label="Match case" />
              Match case
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
              <Switch
                checked={frScope === 'filtered'}
                onChange={(v) => setFrScope(v ? 'filtered' : 'all')}
                label="Limit to current filter"
              />
              Only current filter ({filtered.length})
            </label>
          </div>

          {frMatches.length === 0 ? (
            <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-500">
              {frMode === 'text' && !frFind.trim()
                ? 'Enter text to find in the Item Description column. Borrowers, amounts, dates, and status are never changed.'
                : 'No item descriptions would change with these terms.'}
            </p>
          ) : (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium text-navy-900">
                  {frMatches.length} match{frMatches.length === 1 ? '' : 'es'}
                  {frEmptyCount > 0 && ` · ${frEmptyCount} skipped (would be empty)`}
                </p>
                <button
                  type="button"
                  onClick={toggleFrAll}
                  className="cursor-pointer text-xs font-medium text-navy-700 hover:underline"
                >
                  {frAllChecked ? 'Deselect all' : 'Select all'}
                </button>
              </div>
              <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                {frMatches.map((m) => {
                  const empty = !m.after.trim()
                  const checked = !empty && !frDeselected.has(m.id)
                  return (
                    <li key={m.id} className="flex items-start gap-2 rounded-md px-1.5 py-1">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={empty}
                        onChange={() => toggleFrOne(m.id)}
                        aria-label={`Apply replacement to ${m.before}`}
                        className="mt-1 h-4 w-4 cursor-pointer accent-[#1e3a8a] disabled:cursor-not-allowed disabled:opacity-50"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] text-slate-400">{nameOf(m.userId)}</p>
                        <p className="break-words text-xs text-slate-500 line-through">{m.before}</p>
                        <p
                          className={`break-words text-xs font-medium ${
                            empty ? 'text-red-600' : 'text-emerald-700'
                          }`}
                        >
                          {empty ? '(empty — skipped)' : m.after}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ul>
              <p className="mt-2 text-xs text-slate-500">
                {frApplicable.length} of {frSelectable.length} selected will be updated. Check items to
                apply one by one, or Select all for bulk.
              </p>
            </div>
          )}
        </div>
      </Modal>

      {/* Mobile filter bottom sheet (multi-select per group; empty = All). */}
      {filtersOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Filters"
        >
          <button
            type="button"
            aria-label="Close filters"
            className="absolute inset-0 cursor-default bg-navy-950/40"
            onClick={() => setFiltersOpen(false)}
          />
          <div className="relative flex max-h-[85vh] w-full flex-col rounded-t-3xl bg-white p-5">
            <h2 className="mb-3 text-lg font-bold text-slate-900">Filters</h2>
            <div className="-mx-1 flex-1 overflow-y-auto px-1">
              <SheetMultiGroup
                title="Borrower"
                options={borrowers.map((b) => ({ value: b.id, label: b.name }))}
                selected={borrowerSel}
                onChange={setBorrowerSel}
              />
              <SheetMultiGroup
                title="Status"
                options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
                selected={statusSel}
                onChange={setStatusSel}
              />
              <SheetMultiGroup
                title="Type"
                options={[
                  { value: 'Installment', label: 'Installment' },
                  { value: 'Straight', label: 'Straight' },
                ]}
                selected={typeSel}
                onChange={setTypeSel}
              />
              <SheetMultiGroup title="Txn Date" options={dateOptions.txn} selected={txnDateSel} onChange={setTxnDateSel} />
              <SheetMultiGroup title="Due Date" options={dateOptions.due} selected={dueDateSel} onChange={setDueDateSel} />
              <SheetMultiGroup title="Date Paid" options={dateOptions.paid} selected={datePaidSel} onChange={setDatePaidSel} />
            </div>
            <Button className="mt-4 w-full" onClick={() => setFiltersOpen(false)}>
              Apply
            </Button>
          </div>
        </div>
      )}

      {/* Mobile per-row status action sheet (tap a card to open). */}
      {actionTxn && (
        <div
          className="fixed inset-0 z-50 flex items-end md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Transaction actions"
        >
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 cursor-default bg-navy-950/40"
            onClick={() => setActionTxn(null)}
          />
          <div className="relative w-full rounded-t-3xl bg-white p-4 pb-8">
            <p className="truncate px-2 pt-1 text-base font-bold text-slate-900">
              {nameOf(actionTxn.userId)} · {formatPeso(actionTxn.amount)}
            </p>
            <p className="mb-2 truncate px-2 text-xs text-slate-500">
              Due {formatDate(actionTxn.dueDate)}
            </p>
            <div className="mb-3 px-2">
              <label htmlFor="edit-desc" className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                Item description
              </label>
              <DescriptionCell
                key={actionTxn.id}
                txn={actionTxn}
                inputId="edit-desc"
                onSave={(desc) => {
                  updateTransaction(actionTxn.id, { description: desc })
                  setActionTxn((prev) => (prev ? { ...prev, description: desc } : prev))
                }}
                className="min-h-10 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-navy-600 focus:outline-2 focus:outline-navy-600/20"
              />
            </div>
            <p className="mb-1 px-2 text-xs font-medium uppercase tracking-wide text-slate-400">
              Set status
            </p>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setTransactionStatus([actionTxn.id], value)
                  setActionTxn(null)
                }}
                className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-left transition-colors hover:bg-slate-50 active:bg-slate-100"
              >
                <span className="text-[15px] font-medium text-slate-800">{label}</span>
                {actionTxn.status === value && <Icon name="check" className="h-4 w-4 text-navy-700" />}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                archiveTransactions([actionTxn.id])
                setActionTxn(null)
              }}
              className="mt-1 flex w-full items-center gap-2 rounded-xl px-4 py-3 text-left text-red-600 transition-colors hover:bg-red-50 active:bg-red-100"
            >
              <Icon name="trash" className="h-4 w-4" />
              <span className="text-[15px] font-medium">Delete (move to Archives)</span>
            </button>
          </div>
        </div>
      )}
    </>
  )
}

// Inline-editable Item Description cell. Commits on blur or Enter, reverts on
// Escape, and re-syncs if the underlying record changes elsewhere. Editing is
// held in local state so the shared ledger only updates once, on commit —
// avoiding per-keystroke re-filtering/re-sorting of the whole grid.
function DescriptionCell({ txn, onSave, className, inputId }) {
  const [value, setValue] = useState(txn.description)
  const [editing, setEditing] = useState(false)
  // Re-sync to an external change (another edit to this row) while not editing,
  // using the render-time "reset state on prop change" pattern (no effect).
  const [lastDesc, setLastDesc] = useState(txn.description)
  if (txn.description !== lastDesc) {
    setLastDesc(txn.description)
    if (!editing) setValue(txn.description)
  }
  const commit = () => {
    setEditing(false)
    const next = value.trim()
    if (next && next !== txn.description) onSave(next)
    else if (!next) setValue(txn.description) // reject empty description
  }
  return (
    <input
      id={inputId}
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onFocus={() => setEditing(true)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.blur()
        } else if (e.key === 'Escape') {
          setValue(txn.description)
          setEditing(false)
          e.currentTarget.blur()
        }
      }}
      title={`${txn.description}${txn.loanId ? ` · ${txn.loanId}` : ''}`}
      aria-label={`Item description for ${txn.description}`}
      className={className ?? descCellClass}
    />
  )
}

// Multi-select filter group for the mobile filter sheet — a labeled list of
// pill options that each toggle on/off. Empty selection means "All" (matches
// the desktop MultiSelect semantics). A per-group "Clear" resets it.
function SheetMultiGroup({ title, options, selected, onChange }) {
  const toggle = (value) => {
    const next = new Set(selected)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    onChange(next)
  }
  if (options.length === 0) return null
  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
        {selected.size > 0 && (
          <button
            type="button"
            onClick={() => onChange(new Set())}
            className="cursor-pointer text-[11px] font-medium text-navy-700 hover:underline"
          >
            Clear ({selected.size})
          </button>
        )}
      </div>
      <div className="space-y-1.5">
        {options.map((o) => {
          const active = selected.has(o.value)
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => toggle(o.value)}
              className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left transition-colors ${
                active ? 'border-navy-600 bg-navy-50' : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <span className="text-sm font-medium text-slate-900">{o.label}</span>
              {active && <Icon name="check" className="h-4 w-4 text-navy-700" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
