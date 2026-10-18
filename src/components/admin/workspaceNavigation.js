export const workspaceNavigation = [
  { title: 'Workspace', items: [
    { to: '/admin', label: 'Overview', icon: 'dashboard', end: true },
    { to: '/admin/users', label: 'Borrowers', icon: 'users' },
    { to: '/admin/queue', label: 'Payment review', icon: 'inbox' },
  ] },
  { title: 'Collections', items: [
    { to: '/admin/payment-due', label: 'Payment due', icon: 'clock' },
    { to: '/admin/transactions', label: 'Transactions', icon: 'list' },
    { to: '/admin/payment-logs', label: 'Payment history', icon: 'wallet' },
  ] },
  { title: 'Lending', items: [
    { to: '/admin/loan-requests', label: 'Loan requests', icon: 'file' },
    { to: '/admin/calculator', label: 'Loan calculator', icon: 'calculator' },
    { to: '/admin/fee-manager', label: 'Loan fees & billing', icon: 'calculator' },
    { to: '/admin/loan-tracker', label: 'Loan tracker', icon: 'wallet' },
    { to: '/admin/disbursements', label: 'Disbursements', icon: 'send' },
    { to: '/admin/invoices', label: 'Invoices', icon: 'file' },
  ] },
  { title: 'Communication', items: [
    { to: '/admin/messages', label: 'Messages', icon: 'mail' },
    { to: '/admin/support', label: 'Support tickets', icon: 'help' },
    { to: '/admin/announcements', label: 'Announcements', icon: 'announcement' },
    { to: '/admin/notifications', label: 'Notifications', icon: 'bell' },
  ] },
  { title: 'Management', items: [
    { to: '/admin/portfolio', label: 'Portfolio detail', icon: 'chart' },
    { to: '/admin/wallet', label: 'Cards & bills', icon: 'wallet' },
    { to: '/admin/arbitrage', label: 'Interest & arbitrage', icon: 'trendingUp' },
    { to: '/admin/logs', label: 'Reports & logs', icon: 'scroll' },
    { to: '/admin/settings', label: 'Settings', icon: 'sliders' },
  ] },
]

export const workspacePages = workspaceNavigation.flatMap(group => group.items.map(item => ({ ...item, group: group.title })))

export const borrowerReference = borrower => borrower?.accountNumber || 'Account number pending'

export function matchesBorrower(borrower, query) {
  const value = query.trim().toLocaleLowerCase()
  return !value || [borrower.name, borrower.email, borrower.phone, borrower.accountNumber]
    .some(field => String(field || '').toLocaleLowerCase().includes(value))
}
