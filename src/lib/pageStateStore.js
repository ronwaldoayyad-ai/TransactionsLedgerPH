// Module-level store for per-page UI state (filters, sorts, calculator
// inputs) so it survives navigating between sections. Deliberately outside
// React: usePersistedState reads it lazily and writes through effects.
// Cleared by Refresh and on sign-out.
let store = {}

export const hasPageEntry = (key) => key in store
export const getPageEntry = (key) => store[key]
export const setPageEntry = (key, value) => {
  store[key] = value
}
export const clearPageStore = () => {
  store = {}
}
