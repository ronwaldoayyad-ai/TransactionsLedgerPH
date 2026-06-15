import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import Icon from '../components/Icon'
import { Button, Field, inputClass } from '../components/ui'

const rules = [
  { id: 'len', label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { id: 'num', label: 'Contains a number', test: (p) => /\d/.test(p) },
  { id: 'case', label: 'Upper & lowercase letters', test: (p) => /[a-z]/.test(p) && /[A-Z]/.test(p) },
]

// Forced password setup on first login for invited users.
export default function SetPassword() {
  const { session, completePasswordSetup } = useApp()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!session) return <Navigate to="/login" replace />
  if (!session.needsPasswordSetup)
    return <Navigate to={session.user.role === 'admin' ? '/admin' : '/portal'} replace />

  const allPass = rules.every((r) => r.test(password))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!allPass) {
      setError('Your password does not meet all the requirements yet.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setSubmitting(true)
    const { error: setupError } = await completePasswordSetup(password)
    setSubmitting(false)
    if (setupError) {
      setError(setupError)
      return
    }
    navigate(session.user.role === 'admin' ? '/admin' : '/portal')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <span className="inline-flex rounded-full bg-navy-50 p-3 text-navy-800">
          <Icon name="lock" className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-xl font-bold text-slate-900">Set your permanent password</h1>
        <p className="mt-1 text-sm text-slate-600">
          Welcome, {session.user.name.split(' ')[0]}. Your temporary credential has been verified —
          choose a permanent password to activate your account.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
          <Field label="New password" htmlFor="new-password">
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setError('')
              }}
              className={inputClass}
            />
          </Field>
          <ul className="space-y-1.5" aria-label="Password requirements">
            {rules.map((r) => {
              const ok = r.test(password)
              return (
                <li
                  key={r.id}
                  className={`flex items-center gap-2 text-sm ${ok ? 'text-emerald-600' : 'text-slate-500'}`}
                >
                  <Icon name={ok ? 'check' : 'clock'} className="h-4 w-4" />
                  {r.label}
                </li>
              )
            })}
          </ul>
          <Field label="Confirm password" htmlFor="confirm-password">
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value)
                setError('')
              }}
              className={inputClass}
            />
          </Field>
          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={!password || !confirm || submitting}>
            {submitting ? 'Activating…' : 'Activate account'}
          </Button>
        </form>
      </div>
    </div>
  )
}
