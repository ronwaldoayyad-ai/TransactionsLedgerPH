// Loose typings for the verbatim-copied web status module (transactions.js).
export const STATUS_LABELS: Record<string, string>
export const BORROWER_STATUS_LABELS: Record<string, string>
export function effectiveStatus(t: any, today: string): string
export function borrowerStatus(t: any, today: string): string
export function isReceivable(t: any, today: string): boolean
