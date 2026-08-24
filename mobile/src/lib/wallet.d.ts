export const NETWORKS: string[]
export const TIERS: string[]
export const CATEGORIES: string[]
export const INCOME_CATEGORIES: string[]
export const NETWORK_SVG: Record<string, string>
export function accountLast4(a: any): string
export function cardNetworkSvg(network: string): string | null
export function daysUntil(dueDate: string, today: string): number
export function billState(bill: any, payments: any[], today: string): any
export function urgencyBadge(bill: any, today: string): any
export function cardAge(activationDate: string, today: string): any
export function cardAgeLabel(activationDate: string, today: string): string
export function portfolioTotals(cards: any[]): any
export function accountMask(a: any): string
export function accountColors(seed: string): [string, string]
export function accountTotals(accounts: any[], payments: any[]): any
export function groupDeducted(payments: any[], accounts: any[], by: string): any[]
export function walletRound2(n: number): number
