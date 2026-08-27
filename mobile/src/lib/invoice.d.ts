export const BILLED_FROM: any
export const INVOICE_STATUS_META: Record<string, { label: string; badge: string }>
export const EDITABLE_INVOICE_STATUSES: string[]
export function invoiceStatusMeta(status: string): { label: string; badge: string }
export function invoiceStatusLabel(txn: any, today: string, nextUnpaidDate: string | null): string
export function buildLineItems(transactions: any[], userId: string, today?: string, dueDates?: string[] | null): any[]
export function computeInvoiceTotals(lineItems: any[]): { subtotal: number; amountPaid: number; totalDue: number }
export function borrowerDueDates(transactions: any[], userId: string): string[]
