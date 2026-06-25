import { useState } from 'react'
import Icon from './Icon'

// Page-windowing: returns the list of page numbers to render, inserting a single
// neighbour (e.g. 4) when exactly one page is skipped and an ellipsis ('…') when
// more are. Always keeps the first and last page anchored.
function pageRange(current, count) {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1)
  const neighbours = []
  for (let i = Math.max(2, current - 1); i <= Math.min(count - 1, current + 1); i++) {
    neighbours.push(i)
  }
  const anchored = [1, ...neighbours, count]
  const out = []
  let prev
  for (const p of anchored) {
    if (prev) {
      if (p - prev === 2) out.push(prev + 1)
      else if (p - prev > 2) out.push(`…${p}`) // unique key for the gap
    }
    out.push(p)
    prev = p
  }
  return out
}

const cellBase =
  'inline-flex h-9 min-w-9 cursor-pointer items-center justify-center rounded-lg px-2.5 text-sm font-medium transition-[background-color,color,box-shadow] duration-150'

// Sleek, self-contained pager: prev/next, windowed page numbers, a "n / page"
// size selector, and a "Go to … Page" jump box. Render it inside a Card's footer
// area; it returns null when there's nothing to page through.
export default function Pagination({
  page,
  pageCount,
  pageSize,
  total,
  start = 0,
  end = 0,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 15, 25, 50],
  itemLabel = 'records',
}) {
  const [jump, setJump] = useState('')
  if (total === 0) return null

  const submitJump = () => {
    const n = parseInt(jump, 10)
    if (!Number.isNaN(n)) onPageChange(Math.min(Math.max(1, n), pageCount))
    setJump('')
  }

  const sizes = pageSizeOptions.includes(pageSize)
    ? pageSizeOptions
    : [...pageSizeOptions, pageSize].sort((a, b) => a - b)

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-slate-100 px-4 py-3">
      <p className="text-xs text-slate-500">
        Showing <span className="font-semibold text-slate-700">{total === 0 ? 0 : start + 1}–{end}</span> of{' '}
        <span className="font-semibold text-slate-700">{total}</span> {itemLabel}
      </p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        {/* Page navigation */}
        <nav className="flex items-center gap-1" aria-label="Pagination">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label="Previous page"
            className={`${cellBase} text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent`}
          >
            <Icon name="chevron" className="h-4 w-4 rotate-90" />
          </button>
          {pageRange(page, pageCount).map((p) =>
            typeof p === 'string' ? (
              <span key={p} className="inline-flex h-9 min-w-9 items-center justify-center text-sm text-slate-400">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                aria-current={p === page ? 'page' : undefined}
                className={
                  p === page
                    ? `${cellBase} bg-navy-800 text-white shadow-sm`
                    : `${cellBase} text-slate-600 hover:bg-slate-100 hover:text-slate-900`
                }
              >
                {p}
              </button>
            ),
          )}
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= pageCount}
            aria-label="Next page"
            className={`${cellBase} text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent`}
          >
            <Icon name="chevron" className="h-4 w-4 -rotate-90" />
          </button>
        </nav>

        {/* Page-size selector */}
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          <span className="sr-only">Records per page</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="h-9 cursor-pointer rounded-lg border border-slate-300/80 bg-white/70 pl-3 pr-7 text-sm font-medium text-slate-700 transition-colors duration-150 hover:border-slate-400 focus:border-navy-600 focus:outline-2 focus:outline-navy-600/20"
          >
            {sizes.map((n) => (
              <option key={n} value={n}>
                {n} / page
              </option>
            ))}
          </select>
        </label>

        {/* Jump to page */}
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <span>Go to</span>
          <input
            type="text"
            inputMode="numeric"
            value={jump}
            onChange={(e) => setJump(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submitJump()
              }
            }}
            onBlur={() => jump && submitJump()}
            aria-label="Go to page"
            placeholder={String(page)}
            className="h-9 w-14 rounded-full border border-slate-300/80 bg-white/70 px-3 text-center font-medium text-slate-900 transition-colors duration-150 placeholder:font-normal placeholder:text-slate-300 focus:border-navy-600 focus:outline-2 focus:outline-navy-600/20"
          />
          <span>Page</span>
        </div>
      </div>
    </div>
  )
}
