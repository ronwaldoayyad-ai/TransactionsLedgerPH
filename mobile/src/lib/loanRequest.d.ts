export const TERMS: number[]
export const BANKS: string[]
export const PROCESSING_FEE: number
export const NOTARIAL_RATE: number
export const NOTARIAL_THRESHOLD: number
export const REQUEST_STATUSES: any[]
export const STATUS_LABEL: Record<string, string>
export const STATUS_NOTES: Record<string, string>
export const TERMINAL_STATUSES: string[]
export const CANCELABLE_STATUSES: string[]
export function computeNotarial(amount: number): number
export function computeRequestDST(amount: number): number
export function canCancel(status: string): boolean
export function isTerminal(status: string): boolean
export function monthlyInstallment(amount: number, monthlyRate: number, termMonths: number): number
export function buildRequestSchedule(input: any): any[]
export function requestSummary(input: any): any
