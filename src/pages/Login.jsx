import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import Icon from '../components/Icon'
import { Button, FloatingInput } from '../components/ui'

// Invite-only sign-in against Supabase (AUTH-5/AUTH-7: no public
// registration, no demo backdoor).
export default function Login() {
  const { session, signInWithPassword } = useApp()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // Sign-in choreography: brief scale/blur exit, then navigate.
  const [leaving, setLeaving] = useState(false)

  const target = !session
    ? null
    : session.needsPasswordSetup
      ? '/set-password'
      : session.user.role === 'admin'
        ? '/admin'
        : '/portal'

  useEffect(() => {
    if (!leaving || !target) return undefined
    const t = setTimeout(() => navigate(target, { replace: true }), 230)
    return () => clearTimeout(t)
  }, [leaving, target, navigate])

  // Restored session (page load / invite-link landing): route instantly —
  // never animate a flow the user didn't just initiate.
  if (session && !leaving) return <Navigate to={target} replace />

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email.trim() || !password) {
      setError('Enter your email address and password.')
      return
    }
    setSubmitting(true)
    const { error: authError } = await signInWithPassword(email.trim(), password)
    setSubmitting(false)
    if (authError) {
      setError(
        authError === 'Invalid login credentials'
          ? 'Invalid email or password. Access is by invitation only — contact your administrator if you need an account.'
          : authError,
      )
      return
    }
    setLeaving(true) // session arrives via the auth listener; effect navigates
  }

  return (
    <div className={`flex min-h-screen flex-col bg-navy-950 lg:flex-row ${leaving ? 'page-leave' : ''}`}>
      {/* Brand panel */}
      <div className="flex flex-col justify-between p-8 lg:w-1/2 lg:p-12">
        <div className="lp-rise flex items-center gap-3">
          <span className="rounded-lg bg-gold-500 p-2 text-white">
            <Icon name="wallet" className="h-6 w-6" />
          </span>
          <span className="text-lg font-bold text-white">LoanLedger PH</span>
        </div>
        <div className="lp-rise hidden lg:block" style={{ animationDelay: '60ms' }}>
          <h1 className="max-w-md text-4xl font-bold leading-tight text-white">
            Predictable loan schedules. Transparent disclosures.
          </h1>
          <p className="mt-4 max-w-md text-navy-200">
            Generate BIR-compliant disclosure statements, track borrower payments, and keep a full
            audit trail — all in one place.
          </p>
        </div>
        <div
          className="lp-rise hidden items-center gap-2 text-sm text-navy-300 lg:flex"
          style={{ animationDelay: '120ms' }}
        >
          <Icon name="shield" className="h-4 w-4" />
          Invite-only access. Public registration is disabled.
        </div>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center bg-slate-50 p-6 lg:rounded-l-3xl">
        <div className="w-full max-w-md">
          <div className="lp-rise" style={{ animationDelay: '80ms' }}>
            <h2 className="text-2xl font-bold text-slate-900">Sign in</h2>
            <p className="mt-1 text-sm text-slate-600">
              Use the credentials from your email invitation.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="lp-rise mt-6 space-y-4"
            style={{ animationDelay: '140ms' }}
            noValidate
          >
            <FloatingInput
              id="email"
              label="Email address"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setError('')
              }}
            />
            <FloatingInput
              id="password"
              label="Password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && (
              <p role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
                <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

        </div>
      </div>
    </div>
  )
}
