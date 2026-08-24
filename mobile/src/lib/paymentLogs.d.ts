// Loose typings for the ported web allocation module (paymentLogs.js).
export const PAY_LOG_METHODS: string[]
export const PAY_LOG_STATUSES: string[]
export function defaultSubject(dueDate: string): string
export function computeAmountOwed(transactions: any[], userId: string, dueDate: string, today: string): number
export function suggestedAmountOwed(transactions: any[], userId: string, dueDate: string, today: string): number
export function allocate(amountOwed: any, fundsApplied: any): { remaining: number; status: string }
