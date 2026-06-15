import { useRef, useState } from 'react'
import { useApp } from '../context/AppContext'
import Icon from './Icon'
import { Button, Field, inputClass } from './ui'

// Liquid-glass profile editor (both roles). Always edits the REAL signed-in
// user, even while an admin is in "view as borrower" mode.
export default function ProfileModal({ open, onClose }) {
  const { realSession, updateMyProfile, setMyAvatar } = useApp()
  const me = realSession?.user
  const fileRef = useRef(null)
  const [form, setForm] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)

  if (!open || !me) return null

  // Initialize once per open (form survives re-renders while editing).
  const current = form ?? {
    firstName: me.firstName || me.name.split(' ')[0] || '',
    lastName: me.lastName || me.name.split(' ').slice(1).join(' ') || '',
    nickname: me.nickname || '',
    phone: me.phone || '',
    email: me.email,
  }
  const set = (key) => (e) => {
    setForm({ ...current, [key]: e.target.value })
    setError('')
  }
  const isAdmin = me.role === 'admin'

  const close = () => {
    setForm(null)
    setError('')
    setNotice('')
    onClose()
  }

  const handlePhoto = async (file) => {
    if (!file) return
    if (!/\.(jpe?g|png|webp)$/i.test(file.name)) return setError('Photo must be a JPG, PNG, or WebP image.')
    if (file.size > 2 * 1024 * 1024) return setError('Photo is too large — maximum size is 2 MB.')
    const { error: err } = await setMyAvatar(file)
    if (err) setError(err)
    else setNotice('Photo updated.')
  }

  const handleSave = async () => {
    if (!current.firstName.trim() && !current.nickname.trim()) {
      setError('Please provide at least a first name or a nickname.')
      return
    }
    if (isAdmin && !/.+@.+\..+/.test(current.email)) {
      setError('Please enter a valid email address.')
      return
    }
    setSaving(true)
    const { error: err } = await updateMyProfile({
      firstName: current.firstName.trim(),
      lastName: current.lastName.trim(),
      nickname: current.nickname.trim(),
      phone: current.phone.trim(),
      email: isAdmin ? current.email.trim() : undefined,
    })
    setSaving(false)
    if (err) setError(err)
    else {
      setNotice('Profile saved.')
      setTimeout(close, 700)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        aria-label="Close profile"
        onClick={close}
        className="backdrop-fade absolute inset-0 cursor-default bg-navy-950/30 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="My profile"
        className="modal-pop relative w-full max-w-md overflow-hidden rounded-3xl border border-white/60 bg-white/70 shadow-2xl backdrop-blur-2xl"
      >
        {/* liquid-glass glow accents */}
        <div aria-hidden="true" className="pointer-events-none absolute -top-20 -right-16 h-48 w-48 rounded-full bg-gold-400/30 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-sky-400/25 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute top-1/3 -left-10 h-32 w-32 rounded-full bg-navy-400/20 blur-3xl" />

        <div className="relative max-h-[85vh] overflow-y-auto p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">My Profile</h2>
            <button
              onClick={close}
              aria-label="Close"
              className="cursor-pointer rounded-lg p-1.5 text-slate-500 transition-colors duration-200 hover:bg-white/60 hover:text-slate-900"
            >
              <Icon name="x" className="h-5 w-5" />
            </button>
          </div>

          {/* Photo */}
          <div className="mt-4 flex flex-col items-center">
            <div className="relative">
              <span className="absolute -inset-1.5 rounded-full bg-gradient-to-tr from-gold-400/50 via-white/40 to-sky-400/50 blur-md" aria-hidden="true" />
              {me.avatarUrl ? (
                <img
                  src={me.avatarUrl}
                  alt={`${me.name}'s profile photo`}
                  className="relative h-24 w-24 rounded-full border-4 border-white/80 object-cover shadow-lg"
                />
              ) : (
                <span className="relative flex h-24 w-24 items-center justify-center rounded-full border-4 border-white/80 bg-navy-800 text-3xl font-bold text-white shadow-lg">
                  {me.name.charAt(0)}
                </span>
              )}
              <span className="absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-white bg-sky-400 shadow" aria-hidden="true" />
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp"
              className="sr-only"
              aria-label="Choose profile photo"
              onChange={(e) => {
                handlePhoto(e.target.files[0])
                e.target.value = ''
              }}
            />
            <div className="mt-3 flex gap-2">
              <Button variant="secondary" className="!min-h-9 !bg-white/60 !px-3 !text-xs" onClick={() => fileRef.current?.click()}>
                <Icon name="image" className="h-3.5 w-3.5" />
                Change photo
              </Button>
              {me.avatarUrl && (
                <Button
                  variant="ghost"
                  className="!min-h-9 !px-3 !text-xs !text-red-600 hover:!bg-red-50/70"
                  onClick={async () => {
                    const { error: err } = await setMyAvatar(null)
                    if (err) setError(err)
                    else setNotice('Photo removed.')
                  }}
                >
                  <Icon name="trash" className="h-3.5 w-3.5" />
                  Delete photo
                </Button>
              )}
            </div>
          </div>

          {/* Fields */}
          <div className="mt-5 space-y-3 rounded-2xl border border-white/60 bg-white/50 p-4 backdrop-blur-xl">
            <div className="grid grid-cols-2 gap-3">
              <Field label="First Name" htmlFor="pf-first">
                <input id="pf-first" type="text" value={current.firstName} onChange={set('firstName')} className={inputClass} />
              </Field>
              <Field label="Last Name" htmlFor="pf-last">
                <input id="pf-last" type="text" value={current.lastName} onChange={set('lastName')} className={inputClass} />
              </Field>
            </div>
            <Field label="Preferred Nickname" htmlFor="pf-nick" hint="Shown across the app when set.">
              <input id="pf-nick" type="text" value={current.nickname} onChange={set('nickname')} className={inputClass} placeholder="e.g. Ron" />
            </Field>
            <Field label="Phone Number" htmlFor="pf-phone">
              <input id="pf-phone" type="tel" value={current.phone} onChange={set('phone')} className={inputClass} placeholder="+63 9xx xxx xxxx" />
            </Field>
            <Field
              label="Email Address"
              htmlFor="pf-email"
              hint={
                isAdmin
                  ? 'Changing this also updates your sign-in email (a confirmation email is sent).'
                  : 'Only administrators can change email addresses.'
              }
            >
              <input
                id="pf-email"
                type="email"
                value={current.email}
                onChange={set('email')}
                disabled={!isAdmin}
                className={inputClass}
              />
            </Field>
          </div>

          {error && (
            <p role="alert" className="mt-3 rounded-lg bg-red-50/80 px-3 py-2.5 text-sm text-red-700">
              {error}
            </p>
          )}
          {notice && !error && (
            <p role="status" className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50/80 px-3 py-2.5 text-sm text-emerald-700">
              <Icon name="check" className="h-4 w-4" />
              {notice}
            </p>
          )}

          <Button
            onClick={handleSave}
            disabled={saving}
            className="mt-4 w-full !bg-gradient-to-r !from-navy-800 !via-navy-700 !to-sky-700 shadow-lg hover:!opacity-95"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>
    </div>
  )
}
