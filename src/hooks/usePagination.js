import { useState } from 'react'

// Slice an array into pages with clamped, filter-resilient page state. The stored
// page is never written from an effect — when filtering shrinks the result set we
// derive a clamped `page` during render so the view stays valid without a setState
// loop (React-compiler safe).
export function usePagination(items, defaultPageSize = 10) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSizeRaw] = useState(defaultPageSize)
  const total = items.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(page, pageCount)
  const start = (safePage - 1) * pageSize
  const pageItems = items.slice(start, start + pageSize)

  const goTo = (n) => setPage(Math.min(Math.max(1, n), pageCount))
  const setPageSize = (n) => {
    setPageSizeRaw(n)
    setPage(1)
  }

  return {
    pageItems,
    page: safePage,
    pageCount,
    pageSize,
    total,
    start,
    end: Math.min(start + pageSize, total),
    setPage: goTo,
    setPageSize,
  }
}
