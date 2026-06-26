import { useEffect, useRef, useState } from 'react'
import Icon from '../Icon'
import Avatar from '../Avatar'

const timeLabel = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })
}

// Message list + composer. `isAdmin` decides which bubbles are "mine" (a message
// is mine when its from_admin flag matches my role). `greeting` renders a static
// system bubble at the top (used on the borrower side).
export default function ChatThread({ messages, isAdmin, meUser, otherUser, onSend, placeholder = 'Message…', greeting, disabled = false }) {
  const [text, setText] = useState('')
  const scrollRef = useRef(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  const submit = () => {
    const t = text.trim()
    if (!t || disabled) return
    onSend(t)
    setText('')
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-5 sm:px-6">
        {greeting && (
          <div className="flex justify-center">
            <p className="max-w-[80%] rounded-2xl bg-slate-100 px-4 py-2 text-center text-sm text-slate-600">
              {greeting}
            </p>
          </div>
        )}
        {messages.length === 0 && !greeting ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-slate-400">No messages yet — say hello 👋</p>
          </div>
        ) : (
          messages.map((m, i) => {
            const mine = m.fromAdmin === isAdmin
            const who = mine ? meUser : otherUser
            // Show the avatar only at the end of a run from the same sender; keep
            // a same-width spacer otherwise so bubbles stay aligned.
            const endOfRun = i === messages.length - 1 || messages[i + 1].fromAdmin !== m.fromAdmin
            const gutter = endOfRun ? (
              <Avatar user={who} size={30} className="self-end" />
            ) : (
              <span className="w-[30px] shrink-0" />
            )
            return (
              <div key={m.id} className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
                {!mine && gutter}
                <div className={`flex max-w-[72%] flex-col ${mine ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`rounded-2xl px-3.5 py-2 text-sm ${
                      mine
                        ? 'rounded-br-md bg-navy-800 text-white'
                        : 'rounded-bl-md bg-slate-100 text-slate-800'
                    }`}
                  >
                    {m.body}
                  </div>
                  <span className="mt-1 px-1 text-[11px] text-slate-400">
                    {timeLabel(m.createdAt)}
                    {mine && m.readAt ? ' · Read' : ''}
                  </span>
                </div>
                {mine && gutter}
              </div>
            )
          })
        )}
      </div>

      <div className="border-t border-slate-100 px-3 py-3 sm:px-4">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={text}
            disabled={disabled}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submit()
              }
            }}
            placeholder={placeholder}
            aria-label="Message"
            className="min-h-11 flex-1 rounded-full border border-slate-300/80 bg-white px-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-navy-600 focus:outline-2 focus:outline-navy-600/20 disabled:bg-slate-100"
          />
          <button
            type="button"
            onClick={submit}
            disabled={disabled || !text.trim()}
            aria-label="Send message"
            className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-navy-800 text-white transition-[background-color,transform] duration-150 hover:bg-navy-700 active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <Icon name="send" className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
