// Loose typings for the verbatim-copied web money/date module (amortization.js).
export function formatPeso(n: number): string
export function formatAmount(n: number): string
export function parseAmount(text: string): number
export function formatDate(date: string | Date | null | undefined): string
export function parseISODate(iso: string): Date
export function toISODate(date: Date): string
export function computeDST(principal: number): number
export function autoDST(principal: number): number
export function computeDeductions(args: any): any
export function addMonthsClamped(anchor: Date, n: number): Date
export function buildDisclosure(args: any): any
