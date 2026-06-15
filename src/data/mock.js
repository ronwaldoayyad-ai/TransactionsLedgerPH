// Mock data for the design-phase prototype. The shapes here are the proposed
// API contracts for the Phase 2 backend.
import { buildDisclosure } from '../lib/amortization'

export const mockUsers = [
  {
    id: 'u-001',
    name: 'Maria Santos',
    email: 'maria.santos@example.com',
    phone: '+63 917 555 0101',
    role: 'user',
    status: 'active', // invited | active | disabled
    invitedAt: '2026-04-02',
    lastLogin: '2026-06-10',
  },
  {
    id: 'u-002',
    name: 'Jose Ramirez',
    email: 'jose.ramirez@example.com',
    phone: '+63 928 555 0144',
    role: 'user',
    status: 'active',
    invitedAt: '2026-04-15',
    lastLogin: '2026-06-08',
  },
  {
    id: 'u-003',
    name: 'Ana Dela Cruz',
    email: 'ana.delacruz@example.com',
    phone: '+63 915 555 0188',
    role: 'user',
    status: 'invited',
    invitedAt: '2026-06-09',
    lastLogin: null,
  },
]

export const adminUser = {
  id: 'admin-1',
  name: 'Ron Ay-yad',
  email: 'owner@lending.ph',
  role: 'admin',
}

const loanDefs = [
  {
    id: 'ln-1001',
    userId: 'u-001',
    label: 'Personal Loan',
    principal: 60000,
    monthlyRate: 0.03,
    durationMonths: 6,
    firstPaymentDate: '2026-03-31',
    processingFee: 1500,
    notarialFee: 0,
    status: 'active',
    paidMonths: 3,
  },
  {
    id: 'ln-1002',
    userId: 'u-001',
    label: 'Appliance Loan',
    principal: 25000,
    monthlyRate: 0.025,
    durationMonths: 12,
    firstPaymentDate: '2026-01-15',
    processingFee: 1500,
    notarialFee: 200,
    status: 'active',
    paidMonths: 4, // payment 5 (due 2026-05-15) is overdue — demos auto past-due
  },
  {
    id: 'ln-1003',
    userId: 'u-002',
    label: 'Business Capital',
    principal: 120000,
    monthlyRate: 0.035,
    durationMonths: 10,
    firstPaymentDate: '2026-05-30',
    processingFee: 2000,
    notarialFee: 500,
    status: 'active',
    paidMonths: 1,
  },
]

export const mockLoans = loanDefs.map((def) => ({
  ...def,
  disclosure: buildDisclosure(def),
}))

// Placeholder receipt images (SVG data URLs) so View/Download work for the
// seeded proofs. Real uploads get object URLs created at submission time.
const receiptDataUrl = (lines) =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="320">` +
      `<rect width="420" height="320" fill="#f1f5f9"/>` +
      `<rect x="20" y="20" width="380" height="280" rx="12" fill="#ffffff" stroke="#cbd5e1"/>` +
      `<text x="40" y="64" font-family="monospace" font-size="17" font-weight="bold" fill="#0f172a">PAYMENT RECEIPT</text>` +
      `<line x1="40" y1="80" x2="380" y2="80" stroke="#e2e8f0"/>` +
      lines
        .map(
          (line, i) =>
            `<text x="40" y="${112 + i * 30}" font-family="monospace" font-size="13" fill="#475569">${line}</text>`,
        )
        .join('') +
      `<text x="40" y="280" font-family="monospace" font-size="11" fill="#94a3b8">Prototype placeholder — not a real receipt</text>` +
      `</svg>`,
  )

export const mockPayments = [
  {
    id: 'pay-9001',
    userId: 'u-001',
    loanId: 'ln-1001',
    amount: 11800,
    method: 'GCash',
    reference: 'GC-2026-558821',
    fileName: 'gcash-receipt-may.jpg',
    fileType: 'image',
    fileUrl: receiptDataUrl(['Method: GCash', 'Ref: GC-2026-558821', 'Amount: PHP 11,800.00', 'Date: 2026-05-31']),
    submittedAt: '2026-05-31',
    status: 'approved',
    reviewedAt: '2026-06-01',
    note: '',
  },
  {
    id: 'pay-9002',
    userId: 'u-001',
    loanId: 'ln-1001',
    amount: 11800,
    method: 'Bank Transfer',
    reference: 'BPI-77410223',
    fileName: 'bpi-transfer-jun.pdf',
    fileType: 'pdf',
    fileUrl: receiptDataUrl(['Method: Bank Transfer', 'Ref: BPI-77410223', 'Amount: PHP 11,800.00', 'Date: 2026-06-10']),
    submittedAt: '2026-06-10',
    status: 'pending',
    reviewedAt: null,
    note: '',
  },
  {
    id: 'pay-9003',
    userId: 'u-002',
    loanId: 'ln-1003',
    amount: 16200,
    method: 'GCash',
    reference: 'GC-2026-601177',
    fileName: 'gcash-jun-screenshot.png',
    fileType: 'image',
    fileUrl: receiptDataUrl(['Method: GCash', 'Ref: GC-2026-601177', 'Amount: PHP 16,200.00', 'Date: 2026-06-09']),
    submittedAt: '2026-06-09',
    status: 'pending',
    reviewedAt: null,
    note: '',
  },
  {
    id: 'pay-9004',
    userId: 'u-001',
    loanId: 'ln-1002',
    amount: 2700,
    method: 'GCash',
    reference: 'GC-2026-441002',
    fileName: 'blurry-receipt.jpg',
    fileType: 'image',
    fileUrl: receiptDataUrl(['Method: GCash', 'Ref: GC-2026-441002', 'Amount: PHP 2,700.00', 'Date: 2026-05-18']),
    submittedAt: '2026-05-18',
    status: 'rejected',
    reviewedAt: '2026-05-19',
    note: 'Reference number not legible. Please re-upload a clearer photo.',
  },
]

export const mockAuditLog = [
  { id: 'log-1', at: '2026-06-10 14:22', actor: 'Ron Ay-yad', action: 'INVITE_SENT', detail: 'Invitation emailed to ana.delacruz@example.com' },
  { id: 'log-2', at: '2026-06-10 11:05', actor: 'Maria Santos', action: 'PAYMENT_SUBMITTED', detail: 'Proof bpi-transfer-jun.pdf uploaded for ln-1001' },
  { id: 'log-3', at: '2026-06-09 16:48', actor: 'Jose Ramirez', action: 'PAYMENT_SUBMITTED', detail: 'Proof gcash-jun-screenshot.png uploaded for ln-1003' },
  { id: 'log-4', at: '2026-06-01 09:12', actor: 'Ron Ay-yad', action: 'PAYMENT_APPROVED', detail: 'GC-2026-558821 approved for Maria Santos' },
  { id: 'log-5', at: '2026-05-30 10:31', actor: 'Ron Ay-yad', action: 'LOAN_ASSIGNED', detail: 'ln-1003 (PHP 120,000.00) assigned to Jose Ramirez' },
  { id: 'log-6', at: '2026-05-19 08:55', actor: 'Ron Ay-yad', action: 'PAYMENT_REJECTED', detail: 'GC-2026-441002 rejected — illegible reference' },
]
