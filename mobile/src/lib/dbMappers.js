// Maps Supabase rows (snake_case, numerics as strings) to the app's shapes
// (camelCase, numbers) and back. The app shapes are the PRD §7 contracts.
import { buildDisclosure } from './amortization'
import { supabase } from './supabase'

const num = (v) => (v == null ? 0 : Number(v))
const day = (v) => (v ? String(v).slice(0, 10) : null)

const stamp = (v) =>
  v
    ? new Date(v).toLocaleString('en-PH', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : null

export const mapProfile = (r) => ({
  id: r.id,
  name: r.name,
  firstName: r.first_name ?? '',
  lastName: r.last_name ?? '',
  nickname: r.nickname ?? '',
  email: r.email,
  phone: r.phone ?? '',
  role: r.role,
  status: r.status,
  invitedAt: day(r.invited_at),
  lastLogin: day(r.last_login),
  avatarPath: r.avatar_path ?? null,
  avatarUrl: r.avatar_path
    ? supabase.storage.from('avatars').getPublicUrl(r.avatar_path).data.publicUrl
    : null,
})

export const mapLoan = (r) => {
  const loan = {
    id: r.id,
    userId: r.user_id,
    label: r.label,
    txnType: r.txn_type,
    principal: num(r.principal),
    monthlyRate: num(r.monthly_rate),
    durationMonths: r.duration_months,
    txnDate: day(r.txn_date),
    firstPaymentDate: day(r.first_payment_date),
    dst: num(r.dst),
    processingFee: num(r.processing_fee),
    notarialFee: num(r.notarial_fee),
    deductFromProceeds: r.deduct_from_proceeds,
    status: r.status,
  }
  // Disclosure figures are derived, not stored (PRD §7.2) — rebuild with the
  // same engine the calculator uses.
  loan.disclosure = buildDisclosure(loan)
  return loan
}

export const mapTransaction = (r) => ({
  id: r.id,
  loanId: r.loan_id,
  userId: r.user_id,
  n: r.n,
  description: r.description,
  amount: num(r.amount),
  type: r.type,
  txnDate: day(r.txn_date),
  dueDate: day(r.due_date),
  status: r.status,
  // Invariant: only paid/refunded carry a payment date. Unpaid / past due /
  // cancelled must show blank — never auto-populate a date for them.
  datePaid: ['unpaid', 'cancelled', 'past_due'].includes(r.status) ? null : day(r.date_paid),
  archivedAt: day(r.archived_at),
})

export const mapPayment = (r, fileUrl = null) => ({
  id: r.id,
  userId: r.user_id,
  loanId: r.loan_id,
  amount: num(r.amount),
  method: r.method,
  reference: r.reference,
  fileName: r.file_name,
  fileType: r.file_type,
  filePath: r.file_path,
  fileUrl,
  submittedAt: day(r.submitted_at),
  status: r.status,
  reviewedAt: day(r.reviewed_at),
  note: r.note ?? '',
})

export const mapPaymentLog = (r) => ({
  id: r.id,
  userId: r.user_id,
  kind: r.kind,
  txnDate: day(r.txn_date),
  reference: r.reference ?? '',
  subject: r.subject ?? '',
  dueDate: day(r.due_date),
  amountOwed: num(r.amount_owed),
  method: r.method ?? null,
  fundsApplied: num(r.funds_applied),
  remainingBalance: num(r.remaining_balance),
  allocStatus: r.alloc_status,
  carryApplied: num(r.carry_applied),
  parentId: r.parent_id ?? null,
  consumed: !!r.consumed,
  consumedBy: r.consumed_by ?? null,
  note: r.note ?? '',
  createdAt: r.created_at ?? null,
})

// App payment log → DB row (for insert). `id`/`created_at` are DB-defaulted.
export const toDbPaymentLog = (l) => ({
  user_id: l.userId,
  kind: l.kind,
  txn_date: l.txnDate,
  reference: l.reference,
  subject: l.subject,
  due_date: l.dueDate,
  amount_owed: l.amountOwed,
  method: l.method,
  funds_applied: l.fundsApplied,
  remaining_balance: l.remainingBalance,
  alloc_status: l.allocStatus,
  carry_applied: l.carryApplied,
  parent_id: l.parentId ?? null,
  consumed: l.consumed ?? false,
  consumed_by: l.consumedBy ?? null,
  note: l.note ?? '',
})

export const mapInterestRate = (r) => ({
  id: r.id,
  kind: r.kind,
  rate: num(r.rate),
})

export const mapArbitrageLoan = (r) => ({
  id: r.id,
  userId: r.user_id,
  principal: num(r.principal),
  txnDate: day(r.txn_date),
  firstPaymentDate: day(r.first_payment_date),
  durationMonths: r.duration_months,
  lastPaymentDate: day(r.last_payment_date),
  borrowerRate: num(r.borrower_rate),
  costRate: num(r.cost_rate),
  dst: num(r.dst),
  processingFee: num(r.processing_fee),
  notarialFee: num(r.notarial_fee),
  createdAt: r.created_at ?? null,
})

// App arbitrage record → DB row (for insert). `id`/`created_at` are DB-defaulted.
export const toDbArbitrageLoan = (l) => ({
  user_id: l.userId,
  principal: l.principal,
  txn_date: l.txnDate,
  first_payment_date: l.firstPaymentDate,
  duration_months: l.durationMonths,
  last_payment_date: l.lastPaymentDate,
  borrower_rate: l.borrowerRate,
  cost_rate: l.costRate,
  dst: l.dst,
  processing_fee: l.processingFee,
  notarial_fee: l.notarialFee,
})

export const mapTrackedLoan = (r) => ({
  id: r.id,
  bankName: r.bank_name,
  bankAcronym: r.bank_acronym ?? '',
  bankColor: r.bank_color ?? '#1e3a8a',
  bankDomain: r.bank_domain ?? '',
  principal: num(r.principal),
  processingFee: num(r.processing_fee),
  monthlyRate: num(r.monthly_rate),
  durationMonths: r.duration_months,
  txnDate: day(r.txn_date),
  firstPaymentDate: day(r.first_payment_date),
  createdAt: r.created_at ?? null,
})

// App tracked loan → DB row (for insert). `id`/`created_at` are DB-defaulted.
export const toDbTrackedLoan = (l) => ({
  bank_name: l.bankName,
  bank_acronym: l.bankAcronym,
  bank_color: l.bankColor,
  bank_domain: l.bankDomain,
  principal: l.principal,
  processing_fee: l.processingFee,
  monthly_rate: l.monthlyRate,
  duration_months: l.durationMonths,
  txn_date: l.txnDate,
  first_payment_date: l.firstPaymentDate,
})

export const mapAudit = (r) => ({
  id: String(r.id),
  at: stamp(r.at),
  actor: r.actor,
  action: r.action,
  detail: r.detail,
})

// App transaction → DB row (for bulk insert on loan assignment)
export const toDbTransaction = (t) => ({
  loan_id: t.loanId,
  user_id: t.userId,
  n: t.n,
  description: t.description,
  amount: t.amount,
  type: t.type,
  txn_date: t.txnDate,
  due_date: t.dueDate,
  status: t.status,
  date_paid: t.datePaid,
})
