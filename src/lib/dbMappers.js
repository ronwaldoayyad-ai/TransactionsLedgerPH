// Maps Supabase rows (snake_case, numerics as strings) to the app's shapes
// (camelCase, numbers) and back. The app shapes are the PRD §7 contracts.
import { buildDisclosure } from './amortization'
import { supabase } from '../supabaseClient'

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
  datePaid: day(r.date_paid),
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
