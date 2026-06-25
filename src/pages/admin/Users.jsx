import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import { PageHeader } from '../../components/AppShell'
import Icon from '../../components/Icon'
import RefreshButton from '../../components/RefreshButton'
import { Badge, Button, Card, CardHeader, Field, Modal, inputClass } from '../../components/ui'
import Pagination from '../../components/Pagination'
import { usePagination } from '../../hooks/usePagination'
import { formatDate } from '../../lib/amortization'

const emptyForm = { name: '', email: '', phone: '' }

// Global user management: invite (create), edit, disable, delete.
export default function Users() {
  const { users, loans, transactions, inviteUser, updateUser, deleteUser, resendInvite, startViewAs } =
    useApp()
  const navigate = useNavigate()

  // Per-borrower portfolio counts.
  //  - Active Installments     = installment loans not yet fully paid
  //  - Fully Paid Installments = installment loans whose installments are all paid
  //  - Straight Transactions   = straight transaction records (paid + unpaid)
  const countsFor = (userId) => {
    const txnsOfLoan = (loanId) => transactions.filter((t) => t.loanId === loanId)
    const installmentLoans = loans.filter(
      (l) => l.userId === userId && l.txnType !== 'straight' && txnsOfLoan(l.id).length > 0,
    )
    const loanFullyPaid = (loanId) => {
      const ts = txnsOfLoan(loanId)
      return ts.length > 0 && ts.every((t) => t.status === 'paid')
    }
    const straight = transactions.filter((t) => t.userId === userId && t.type === 'Straight')
    const straightPaid = straight.filter((t) => t.status === 'paid').length
    return {
      activeInstallments: installmentLoans.filter((l) => !loanFullyPaid(l.id)).length,
      fullyPaidInstallments: installmentLoans.filter((l) => loanFullyPaid(l.id)).length,
      straightCount: straight.length,
      straightPaid,
      straightUnpaid: straight.length - straightPaid,
    }
  }

  const handleViewAs = (user) => {
    startViewAs(user)
    navigate('/portal')
  }
  const [modal, setModal] = useState(null) // 'invite' | 'edit' | 'delete'
  const [target, setTarget] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  const borrowers = users.filter((u) => u.role === 'user')
  const pag = usePagination(borrowers, 10)

  const openInvite = () => {
    setForm(emptyForm)
    setError('')
    setModal('invite')
  }
  const openEdit = (u) => {
    setTarget(u)
    setForm({ name: u.name, email: u.email, phone: u.phone })
    setError('')
    setModal('edit')
  }

  const flash = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 5000)
  }

  const submit = () => {
    if (!form.name.trim() || !/.+@.+\..+/.test(form.email)) {
      setError('A full name and a valid email address are required.')
      return
    }
    if (modal === 'invite') {
      inviteUser({ name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim() })
      flash(`Invitation sent to ${form.email.trim()} with a secure first-login link.`)
    } else {
      updateUser(target.id, { name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim() })
      flash('Profile updated.')
    }
    setModal(null)
  }

  const confirmDelete = () => {
    deleteUser(target.id)
    setModal(null)
    flash('Account deleted.')
  }

  return (
    <>
      <PageHeader
        title="User Management"
        subtitle="Public registration is disabled — accounts are created here by invitation."
        action={
          <div className="flex flex-wrap gap-2">
            <RefreshButton />
            <Button variant="gold" onClick={openInvite}>
              <Icon name="plus" className="h-4 w-4" />
              Invite new user
            </Button>
          </div>
        }
      />

      {toast && (
        <p role="status" className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <Icon name="mail" className="h-4 w-4 shrink-0" />
          {toast}
        </p>
      )}

      <Card>
        <CardHeader title="Borrower Accounts" subtitle={`${borrowers.length} accounts`} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th scope="col" className="px-5 py-3">Name</th>
                <th scope="col" className="px-5 py-3">Contact</th>
                <th scope="col" className="px-5 py-3">Status</th>
                <th scope="col" className="px-5 py-3 text-right">Active Installments</th>
                <th scope="col" className="px-5 py-3 text-right">Fully Paid Installments</th>
                <th scope="col" className="px-5 py-3 text-right">Straight Transactions</th>
                <th scope="col" className="px-5 py-3">Last Login</th>
                <th scope="col" className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pag.pageItems.map((u) => {
                const c = countsFor(u.id)
                return (
                  <tr
                    key={u.id}
                    className="border-b border-slate-100 transition-colors duration-150 hover:bg-navy-50/40"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-100 text-sm font-semibold text-navy-800">
                          {u.name.charAt(0)}
                        </span>
                        <div>
                          <p className="font-medium text-slate-900">{u.name}</p>
                          <p className="text-xs text-slate-500">{u.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="text-slate-700">{u.email}</p>
                      <p className="text-xs text-slate-500">{u.phone}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge status={u.status} />
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <p className="font-mono font-medium text-slate-900">{c.activeInstallments}</p>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <p className="font-mono font-medium text-emerald-700">{c.fullyPaidInstallments}</p>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <p className="font-mono font-medium text-slate-900">{c.straightCount}</p>
                      {c.straightCount > 0 && (
                        <p className="font-mono text-xs text-slate-500">
                          {c.straightPaid} paid · {c.straightUnpaid} unpaid
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">
                      {u.lastLogin ? formatDate(u.lastLogin) : <span className="text-slate-400">Never</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => handleViewAs(u)}
                          aria-label={`View the app as ${u.name}`}
                          title="View as this borrower"
                          className="cursor-pointer rounded-lg p-2 text-slate-500 transition-colors duration-200 hover:bg-amber-50 hover:text-amber-700"
                        >
                          <Icon name="eye" className="h-4 w-4" />
                        </button>
                        {u.status === 'invited' && (
                          <button
                            onClick={() => {
                              resendInvite(u)
                              flash(`Invitation re-sent to ${u.email}.`)
                            }}
                            aria-label={`Resend invitation to ${u.name}`}
                            title="Resend invitation"
                            className="cursor-pointer rounded-lg p-2 text-slate-500 transition-colors duration-200 hover:bg-sky-50 hover:text-sky-700"
                          >
                            <Icon name="mail" className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => openEdit(u)}
                          aria-label={`Edit ${u.name}`}
                          title="Edit profile"
                          className="cursor-pointer rounded-lg p-2 text-slate-500 transition-colors duration-200 hover:bg-navy-50 hover:text-navy-800"
                        >
                          <Icon name="pencil" className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => {
                            setTarget(u)
                            setModal('delete')
                          }}
                          aria-label={`Delete ${u.name}`}
                          title="Delete account"
                          className="cursor-pointer rounded-lg p-2 text-slate-500 transition-colors duration-200 hover:bg-red-50 hover:text-red-600"
                        >
                          <Icon name="trash" className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {borrowers.length > 0 && (
          <Pagination
            page={pag.page}
            pageCount={pag.pageCount}
            pageSize={pag.pageSize}
            total={pag.total}
            start={pag.start}
            end={pag.end}
            onPageChange={pag.setPage}
            onPageSizeChange={pag.setPageSize}
            itemLabel="accounts"
          />
        )}
      </Card>

      {/* Invite / Edit modal */}
      <Modal
        open={modal === 'invite' || modal === 'edit'}
        title={modal === 'invite' ? 'Invite new user' : `Edit ${target?.name}`}
        onClose={() => setModal(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button onClick={submit}>
              {modal === 'invite' ? (
                <>
                  <Icon name="mail" className="h-4 w-4" />
                  Create & send invitation
                </>
              ) : (
                'Save changes'
              )}
            </Button>
          </>
        }
      >
        {modal === 'invite' && (
          <p className="mb-4 rounded-lg bg-navy-50 px-3 py-2.5 text-sm text-navy-800">
            An automated email with a secure link and temporary credential will be sent. The user
            must set a permanent password on first login.
          </p>
        )}
        <div className="space-y-4">
          <Field label="Full name" htmlFor="user-name">
            <input
              id="user-name"
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={inputClass}
              placeholder="Juan Dela Cruz"
            />
          </Field>
          <Field label="Email address" htmlFor="user-email">
            <input
              id="user-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className={inputClass}
              placeholder="juan@example.com"
            />
          </Field>
          <Field label="Mobile number" htmlFor="user-phone">
            <input
              id="user-phone"
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className={inputClass}
              placeholder="+63 9xx xxx xxxx"
            />
          </Field>
          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>
      </Modal>

      {/* Delete confirmation */}
      <Modal
        open={modal === 'delete'}
        title="Delete account"
        onClose={() => setModal(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmDelete}>
              <Icon name="trash" className="h-4 w-4" />
              Delete permanently
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          You are about to permanently delete <span className="font-semibold text-slate-900">{target?.name}</span>{' '}
          ({target?.email}). Their loan records and payment history will be retained in the audit
          trail, but they will lose all access. This cannot be undone.
        </p>
      </Modal>
    </>
  )
}
